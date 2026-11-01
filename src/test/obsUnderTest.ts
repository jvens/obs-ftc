import OBSWebSocket, { OBSWebSocketError } from 'obs-websocket-js';
import { ResultAsync, okAsync } from 'neverthrow';
import { ObsCall, getPlatform } from '../obsSetup/obsCall';
import { PLATFORM_KINDS } from '../obsSetup/layout';
import { FakeObs } from './fakeObs';

// The OBS a contract test (*.obs.test.ts) runs against: FakeObs in the unit tests, or the real OBS
// Studio `npm run test:obs` starts (integration/obs/jestGlobalSetup.ts passes it in OBS_TEST_URL).
// Running the same tests against both keeps FakeObs honest. Tests check OBS only through requests.

export const REAL_OBS = !!process.env.OBS_TEST_URL;

export interface ObsUnderTest {
  call: ObsCall;
  // Only in the unit tests.
  fake?: FakeObs;
}

let connection: OBSWebSocket | undefined;
const run = Math.random().toString(36).slice(2, 8);
let count = 0;

const connect = async () => {
  if (!connection) {
    const obs = new OBSWebSocket();
    await obs.connect(process.env.OBS_TEST_URL, process.env.OBS_TEST_PASSWORD);
    connection = obs;
  }
  return connection;
};

const message = (error: unknown) =>
  error instanceof OBSWebSocketError ? `${error.message} (code ${error.code})` : error instanceof Error ? error.message : String(error);

const TIMEOUT_MS = 30_000;

// A crashed OBS keeps its connection open behind a crash dialog, so requests time out rather than
// wait forever.
const request = (obs: OBSWebSocket) => <T>(requestType: string, requestData?: unknown): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`OBS did not answer ${requestType} within ${TIMEOUT_MS / 1000} s; did it crash?`)), TIMEOUT_MS);
  });
  return Promise.race([(obs.call as (type: string, data?: unknown) => Promise<T>)(requestType, requestData), timeout])
    .finally(() => clearTimeout(timer));
};

const until = async (check: () => Promise<boolean>) => {
  while (!(await check())) await new Promise(resolve => setTimeout(resolve, 100));
};

// A fresh OBS for each test. In the real OBS: a new scene collection, holding OBS's empty "Scene",
// in the starting profile (1920x1080, 30 fps). With `profile`, also a new profile, for tests that
// change output settings; OBS crashes if video settings change while a profile is still loading
// (OBS 33), so this waits for it.
export const freshObs = async ({ profile = false } = {}): Promise<ObsUnderTest> => {
  if (!REAL_OBS) {
    const fake = new FakeObs();
    return { call: fake.call, fake };
  }
  const call = request(await connect());
  const name = `Test ${run} ${++count}`;
  if (profile) {
    await call('CreateProfile', { profileName: name });
    await until(() => call<{ currentProfileName: string }>('GetProfileList').then(list => list.currentProfileName === name));
    await new Promise(resolve => setTimeout(resolve, 1000));
    await call('SetRecordDirectory', { recordDirectory: process.env.OBS_TEST_RECORD_DIR! });
  }
  await call('CreateSceneCollection', { sceneCollectionName: name });
  await until(() => call<{ currentSceneCollectionName: string }>('GetSceneCollectionList').then(list => list.currentSceneCollectionName === name));
  return {
    call: ((requestType: string, requestData?: unknown) =>
      ResultAsync.fromPromise(call(requestType, requestData), message)) as ObsCall,
  };
};

export const closeObs = async () => {
  await connection?.disconnect();
  connection = undefined;
};

// The value, or a thrown error carrying OBS's message.
export const unwrap = async <T>(result: ResultAsync<T, string>) => {
  const settled = await result;
  if (settled.isErr()) throw new Error(settled.error);
  return settled.value;
};

export const queries = (call: ObsCall) => ({
  // Top of the OBS scene list first.
  scenes: () => unwrap(call('GetSceneList').map(({ scenes }) => [...scenes].reverse().map(scene => String(scene.sceneName)))),
  // Top of the scene's source list first.
  sources: (sceneName: string) => unwrap(call('GetSceneItemList', { sceneName })
    .map(({ sceneItems }) => [...sceneItems].reverse().map(item => String(item.sourceName)))),
  inputs: () => unwrap(call('GetInputList').map(({ inputs }) => inputs.map(input => String(input.inputName)))),
  // `muted` is undefined for inputs without audio.
  input: (inputName: string) => unwrap(ResultAsync.combine([
    call('GetInputSettings', { inputName }),
    call('GetInputMute', { inputName }).map(({ inputMuted }): boolean | undefined => inputMuted).orElse(() => okAsync(undefined)),
  ]).map(([{ inputKind, inputSettings }, muted]) => ({ kind: inputKind, settings: inputSettings, muted }))),
  transform: (sceneName: string, sourceName: string) => unwrap(call('GetSceneItemList', { sceneName })
    .andThen(({ sceneItems }) => call('GetSceneItemTransform', {
      sceneName,
      sceneItemId: Number(sceneItems.find(item => item.sourceName === sourceName)?.sceneItemId),
    }))
    .map(({ sceneItemTransform }) => sceneItemTransform)),
  programScene: () => unwrap(call('GetCurrentProgramScene').map(({ currentProgramSceneName }) => currentProgramSceneName)),
  sceneCollection: () => unwrap(call('GetSceneCollectionList').map(({ currentSceneCollectionName }) => currentSceneCollectionName)),
  sceneCollections: () => unwrap(call('GetSceneCollectionList').map(({ sceneCollections }) => sceneCollections)),
  specialInputs: () => unwrap(call('GetSpecialInputs')
    .map(special => Object.values(special).filter((name): name is string => typeof name === 'string' && name !== ''))),
  profile: () => unwrap(call('GetProfileList')),
  profileParameter: (parameterCategory: string, parameterName: string) =>
    unwrap(call('GetProfileParameter', { parameterCategory, parameterName }).map(({ parameterValue }) => parameterValue)),
  video: () => unwrap(call('GetVideoSettings')),
  version: () => unwrap(call('GetVersion').map(({ obsVersion }) => obsVersion)),
  // The input kinds for cameras and audio devices on this OBS's platform.
  kinds: () => unwrap(getPlatform(call).map(platform => PLATFORM_KINDS[platform])),
  platform: () => unwrap(getPlatform(call)),
});

// OBS asks before starting a recording or the replay buffer when the scene shows nothing, which a
// test OBS without audio devices (in a container) would otherwise do.
export const addSomethingToShow = (call: ObsCall) => unwrap(call('GetCurrentProgramScene')
  .andThen(({ currentProgramSceneName }) => call('CreateInput', {
    sceneName: currentProgramSceneName, inputName: 'Something to show', inputKind: 'color_source_v3', inputSettings: {},
  })));

// SetRecordDirectory (obs-websocket 5.3) is missing from obs-websocket-js's request types.
export const setRecordDirectory = (call: ObsCall, recordDirectory: string) =>
  (call as unknown as (type: string, data: object) => ResultAsync<unknown, string>)('SetRecordDirectory', { recordDirectory });

// Polls until `check` passes; OBS finishes some changes (recording starting, inputs going away) in
// the background.
export const eventually = async (check: () => Promise<boolean>, what: string, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
};
