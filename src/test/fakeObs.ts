import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { ObsCall } from '../obsSetup/obsCall';

// An in-memory OBS for unit tests: enough of obs-websocket v5 for the setup, camera and settings
// code, with the quirks that code relies on (new scenes go just below the current scene, scene
// items are listed bottom first, removed inputs linger for a while, outputs change only when a
// profile loads). The *.obs.test.ts tests run against both this and the real OBS to keep it honest.

type Settings = Record<string, unknown>;

interface Input {
  kind: string;
  settings: Settings;
  muted: boolean;
}

interface SceneItem {
  sceneItemId: number;
  sourceName: string;
  transform: Settings;
}

interface Collection {
  // Top of the OBS scene list first.
  scenes: string[];
  items: Map<string, SceneItem[]>;
  inputs: Map<string, Input>;
  program: string;
  preview: string;
}

export interface FakeObsOptions {
  version?: string;
  canvas?: { width: number; height: number };
  // Choices for list properties, by input kind and property name.
  propertyItems?: Record<string, Record<string, { itemName: string; itemValue: string; itemEnabled?: boolean }[]>>;
  // How many GetInputList calls a removed input stays listed for.
  removalLag?: number;
}

export interface Call {
  requestType: string;
  requestData: Record<string, unknown>;
}

export const SPECIAL_INPUTS = { desktop1: 'Desktop Audio', mic1: 'Mic/Aux' };

const SCENE_TYPE = 'OBS_SOURCE_TYPE_SCENE';
const INPUT_TYPE = 'OBS_SOURCE_TYPE_INPUT';

const newCollection = (): Collection => ({
  scenes: ['Scene'],
  items: new Map([['Scene', []]]),
  inputs: new Map([
    [SPECIAL_INPUTS.desktop1, { kind: 'wasapi_output_capture', settings: {}, muted: false }],
    [SPECIAL_INPUTS.mic1, { kind: 'wasapi_input_capture', settings: {}, muted: false }],
  ]),
  program: 'Scene',
  preview: 'Scene',
});

export class FakeObs {
  readonly calls: Call[] = [];
  version: string;
  video: { baseWidth: number; baseHeight: number; outputWidth: number; outputHeight: number; fpsNumerator: number; fpsDenominator: number };
  collections = new Map<string, Collection>([['Untitled', newCollection()]]);
  currentCollection = 'Untitled';
  studioMode = false;
  profiles = new Map<string, Map<string, string>>([['Untitled', new Map()]]);
  currentProfile = 'Untitled';
  streaming = false;
  recording = false;
  recordDirectory = 'C:\\Users\\Test\\Videos';
  // Whether the loaded profile has a replay buffer, decided when the profile loads, as in OBS.
  replayBufferAvailable = false;
  replayBufferActive = false;
  private nextItemId = 1;
  private lingering = new Map<string, number>();
  private readonly options: FakeObsOptions;

  constructor(options: FakeObsOptions = {}) {
    this.options = options;
    this.version = options.version ?? '31.0.0';
    const canvas = options.canvas ?? { width: 1920, height: 1080 };
    this.video = { baseWidth: canvas.width, baseHeight: canvas.height, outputWidth: canvas.width, outputHeight: canvas.height, fpsNumerator: 30, fpsDenominator: 1 };
  }

  get collection() {
    return this.collections.get(this.currentCollection)!;
  }

  get scenes() {
    return this.collection.scenes;
  }

  get inputs() {
    return this.collection.inputs;
  }

  // Source names in a scene, top first, as the OBS sources list shows them.
  sources(sceneName: string) {
    return [...(this.collection.items.get(sceneName) ?? [])].reverse().map(item => item.sourceName);
  }

  item(sceneName: string, sourceName: string) {
    return this.collection.items.get(sceneName)?.find(item => item.sourceName === sourceName);
  }

  profileParameters() {
    return this.profiles.get(this.currentProfile)!;
  }

  // Request types called, in order, optionally only those after `from`.
  requestTypes(from = 0) {
    return this.calls.slice(from).map(call => call.requestType);
  }

  // Adds a scene as OBS does: just below the current scene in the list.
  addScene(name: string) {
    this.collection.scenes.splice(this.scenes.indexOf(this.collection.program) + 1, 0, name);
    this.collection.items.set(name, []);
  }

  // Adds an input to a scene the way a user would, on top of the scene's sources.
  addInput(sceneName: string, inputName: string, kind: string, settings: Settings = {}) {
    if (!this.inputs.has(inputName))
      this.inputs.set(inputName, { kind, settings: { ...settings }, muted: false });
    return this.addItem(sceneName, inputName);
  }

  addItem(sceneName: string, sourceName: string) {
    const item: SceneItem = { sceneItemId: this.nextItemId++, sourceName, transform: {} };
    this.collection.items.get(sceneName)!.push(item);
    return item.sceneItemId;
  }

  readonly call: ObsCall = ((requestType: string, requestData: Record<string, unknown> = {}) => {
    this.calls.push({ requestType, requestData });
    const handler = this.handlers[requestType];
    if (!handler)
      return errAsync(`FakeObs does not support ${requestType}`);
    return handler(requestData);
  }) as ObsCall;

  private loadProfile(name: string) {
    this.currentProfile = name;
    this.replayBufferAvailable = this.profileParameters().get('SimpleOutput.RecRB') === 'true';
    this.replayBufferActive = false;
  }

  private sceneItems(sceneName: unknown) {
    return this.collection.items.get(String(sceneName));
  }

  private removeSource(name: string) {
    for (const items of this.collection.items.values())
      items.splice(0, items.length, ...items.filter(item => item.sourceName !== name));
  }

  private readonly handlers: Record<string, (data: Record<string, unknown>) => ResultAsync<unknown, string>> = {
    GetVersion: () => okAsync({ obsVersion: this.version, obsWebSocketVersion: '5.5.0', rpcVersion: 1 }),
    GetVideoSettings: () => okAsync({ ...this.video }),
    SetVideoSettings: data => {
      if (this.streaming || this.recording || this.replayBufferActive)
        return errAsync('Video settings cannot be changed while an output is active.');
      Object.assign(this.video, data);
      return okAsync({});
    },
    GetStudioModeEnabled: () => okAsync({ studioModeEnabled: this.studioMode }),
    GetSpecialInputs: () => okAsync({ ...SPECIAL_INPUTS, desktop2: null, mic2: null, mic3: null, mic4: null }),

    GetSceneCollectionList: () => okAsync({ currentSceneCollectionName: this.currentCollection, sceneCollections: [...this.collections.keys()] }),
    CreateSceneCollection: ({ sceneCollectionName }) => {
      const name = String(sceneCollectionName);
      if (this.collections.has(name))
        return errAsync(`A scene collection named "${name}" already exists.`);
      this.collections.set(name, newCollection());
      this.currentCollection = name;
      return okAsync({});
    },

    GetCurrentProgramScene: () => okAsync({ currentProgramSceneName: this.collection.program, sceneName: this.collection.program }),
    GetCurrentPreviewScene: () => this.studioMode
      ? okAsync({ currentPreviewSceneName: this.collection.preview, sceneName: this.collection.preview })
      : errAsync('Studio mode is not enabled.'),
    SetStudioModeEnabled: ({ studioModeEnabled }) => {
      this.studioMode = Boolean(studioModeEnabled);
      return okAsync({});
    },
    GetSceneList: () => okAsync({
      currentProgramSceneName: this.collection.program,
      currentPreviewSceneName: this.studioMode ? this.collection.preview : null,
      // OBS lists scenes bottom first, numbering from the bottom.
      scenes: [...this.scenes].reverse().map((sceneName, sceneIndex) => ({ sceneName, sceneIndex })),
    }),
    CreateScene: ({ sceneName }) => {
      const name = String(sceneName);
      if (this.collection.items.has(name) || this.inputs.has(name))
        return errAsync(`A source named "${name}" already exists.`);
      this.addScene(name);
      return okAsync({ sceneUuid: name });
    },
    RemoveScene: ({ sceneName }) => {
      const name = String(sceneName);
      if (!this.collection.items.has(name))
        return errAsync(`No scene named "${name}".`);
      if (this.scenes.length === 1)
        return errAsync('Cannot remove the last scene.');
      this.collection.scenes.splice(this.scenes.indexOf(name), 1);
      this.collection.items.delete(name);
      this.removeSource(name);
      if (this.collection.program === name) this.collection.program = this.scenes[0];
      if (this.collection.preview === name) this.collection.preview = this.scenes[0];
      return okAsync({});
    },
    SetCurrentProgramScene: ({ sceneName }) => {
      if (!this.collection.items.has(String(sceneName)))
        return errAsync(`No scene named "${sceneName}".`);
      this.collection.program = String(sceneName);
      return okAsync({});
    },
    SetCurrentPreviewScene: ({ sceneName }) => {
      if (!this.studioMode)
        return errAsync('Studio mode is not enabled.');
      this.collection.preview = String(sceneName);
      return okAsync({});
    },

    GetInputList: () => {
      const listed = [...this.inputs.entries()].map(([inputName, input]) => ({ inputName, inputKind: input.kind }));
      const lingering = [...this.lingering.entries()].map(([inputName]) => ({ inputName, inputKind: 'removing' }));
      for (const [name, polls] of this.lingering)
        if (polls <= 1) this.lingering.delete(name);
        else this.lingering.set(name, polls - 1);
      return okAsync({ inputs: [...listed, ...lingering] });
    },
    CreateInput: ({ sceneName, inputName, inputKind, inputSettings }) => {
      const name = String(inputName);
      if (this.inputs.has(name) || this.collection.items.has(name) || this.lingering.has(name))
        return errAsync(`A source named "${name}" already exists.`);
      if (!this.sceneItems(sceneName))
        return errAsync(`No scene named "${sceneName}".`);
      const sceneItemId = this.addInput(String(sceneName), name, String(inputKind), (inputSettings ?? {}) as Settings);
      return okAsync({ inputUuid: name, sceneItemId });
    },
    RemoveInput: ({ inputName }) => {
      const name = String(inputName);
      if (!this.inputs.has(name))
        return errAsync(`No input named "${name}".`);
      this.inputs.delete(name);
      this.removeSource(name);
      if (this.options.removalLag)
        this.lingering.set(name, this.options.removalLag);
      return okAsync({});
    },
    GetInputSettings: ({ inputName }) => {
      const input = this.inputs.get(String(inputName));
      return input
        ? okAsync({ inputKind: input.kind, inputSettings: JSON.parse(JSON.stringify(input.settings)) as Settings })
        : errAsync(`No input named "${inputName}".`);
    },
    SetInputSettings: ({ inputName, inputSettings, overlay }) => {
      const input = this.inputs.get(String(inputName));
      if (!input)
        return errAsync(`No input named "${inputName}".`);
      input.settings = overlay === false ? { ...(inputSettings as Settings) } : { ...input.settings, ...(inputSettings as Settings) };
      return okAsync({});
    },
    GetInputMute: ({ inputName }) => {
      const input = this.inputs.get(String(inputName));
      return input ? okAsync({ inputMuted: input.muted }) : errAsync(`No input named "${inputName}".`);
    },
    SetInputMute: ({ inputName, inputMuted }) => {
      const input = this.inputs.get(String(inputName));
      if (!input)
        return errAsync(`No input named "${inputName}".`);
      input.muted = Boolean(inputMuted);
      return okAsync({});
    },
    GetInputPropertiesListPropertyItems: ({ inputName, propertyName }) => {
      const input = this.inputs.get(String(inputName));
      if (!input)
        return errAsync(`No input named "${inputName}".`);
      return okAsync({ propertyItems: this.options.propertyItems?.[input.kind]?.[String(propertyName)] ?? [] });
    },
    GetSourceScreenshot: ({ sourceName }) => okAsync({ imageData: `data:image/jpg;base64,${sourceName}` }),

    GetSceneItemList: ({ sceneName }) => {
      const items = this.sceneItems(sceneName);
      if (!items)
        return errAsync(`No scene named "${sceneName}".`);
      return okAsync({
        sceneItems: items.map((item, sceneItemIndex) => {
          const input = this.inputs.get(item.sourceName);
          return {
            sceneItemId: item.sceneItemId,
            sceneItemIndex,
            sourceName: item.sourceName,
            sourceType: input ? INPUT_TYPE : SCENE_TYPE,
            inputKind: input ? input.kind : null,
          };
        }),
      });
    },
    CreateSceneItem: ({ sceneName, sourceName }) => {
      const items = this.sceneItems(sceneName);
      const name = String(sourceName);
      if (!items)
        return errAsync(`No scene named "${sceneName}".`);
      if (!this.inputs.has(name) && !this.collection.items.has(name))
        return errAsync(`No source named "${name}".`);
      return okAsync({ sceneItemId: this.addItem(String(sceneName), name) });
    },
    RemoveSceneItem: ({ sceneName, sceneItemId }) => {
      const items = this.sceneItems(sceneName);
      const index = items?.findIndex(item => item.sceneItemId === sceneItemId) ?? -1;
      if (!items || index < 0)
        return errAsync(`No scene item ${sceneItemId} in "${sceneName}".`);
      items.splice(index, 1);
      return okAsync({});
    },
    SetSceneItemIndex: ({ sceneName, sceneItemId, sceneItemIndex }) => {
      const items = this.sceneItems(sceneName);
      const index = items?.findIndex(item => item.sceneItemId === sceneItemId) ?? -1;
      if (!items || index < 0)
        return errAsync(`No scene item ${sceneItemId} in "${sceneName}".`);
      const [item] = items.splice(index, 1);
      items.splice(Number(sceneItemIndex), 0, item);
      return okAsync({});
    },
    GetSceneItemTransform: ({ sceneName, sceneItemId }) => {
      const item = this.sceneItems(sceneName)?.find(item => item.sceneItemId === sceneItemId);
      return item ? okAsync({ sceneItemTransform: { ...item.transform } }) : errAsync(`No scene item ${sceneItemId} in "${sceneName}".`);
    },
    SetSceneItemTransform: ({ sceneName, sceneItemId, sceneItemTransform }) => {
      const item = this.sceneItems(sceneName)?.find(item => item.sceneItemId === sceneItemId);
      if (!item)
        return errAsync(`No scene item ${sceneItemId} in "${sceneName}".`);
      item.transform = { ...item.transform, ...(sceneItemTransform as Settings) };
      return okAsync({});
    },

    GetStreamStatus: () => okAsync({ outputActive: this.streaming }),
    // Like OBS, accepts StartRecord for a folder it cannot record to, and then never starts. Only
    // drive C: exists here.
    StartRecord: () => {
      if (this.recording)
        return errAsync('Recording is already active.');
      this.recording = /^C:/i.test(this.recordDirectory);
      return okAsync({});
    },
    StopRecord: () => {
      if (!this.recording)
        return errAsync('Recording is not active.');
      this.recording = false;
      return okAsync({ outputPath: `${this.recordDirectory}\\recording.mp4` });
    },
    GetRecordDirectory: () => okAsync({ recordDirectory: this.recordDirectory }),
    SetRecordDirectory: ({ recordDirectory }) => {
      this.recordDirectory = String(recordDirectory);
      return okAsync({});
    },
    GetRecordStatus: () => okAsync({ outputActive: this.recording }),
    GetReplayBufferStatus: () => this.replayBufferAvailable
      ? okAsync({ outputActive: this.replayBufferActive })
      : errAsync('Replay buffer is not available.'),
    StartReplayBuffer: () => {
      if (!this.replayBufferAvailable)
        return errAsync('Replay buffer is not available.');
      this.replayBufferActive = true;
      return okAsync({});
    },
    StopReplayBuffer: () => {
      this.replayBufferActive = false;
      return okAsync({});
    },
    GetProfileList: () => okAsync({ currentProfileName: this.currentProfile, profiles: [...this.profiles.keys()] }),
    CreateProfile: ({ profileName }) => {
      const name = String(profileName);
      if (this.profiles.has(name))
        return errAsync(`A profile named "${name}" already exists.`);
      this.profiles.set(name, new Map());
      this.loadProfile(name);
      return okAsync({});
    },
    SetCurrentProfile: ({ profileName }) => {
      if (!this.profiles.has(String(profileName)))
        return errAsync(`No profile named "${profileName}".`);
      this.loadProfile(String(profileName));
      return okAsync({});
    },
    RemoveProfile: ({ profileName }) => {
      const name = String(profileName);
      if (!this.profiles.has(name))
        return errAsync(`No profile named "${name}".`);
      if (name === this.currentProfile)
        return errAsync('Cannot remove the current profile.');
      this.profiles.delete(name);
      return okAsync({});
    },
    GetProfileParameter: ({ parameterCategory, parameterName }) =>
      okAsync({ parameterValue: this.profileParameters().get(`${parameterCategory}.${parameterName}`) ?? null, defaultParameterValue: null }),
    SetProfileParameter: ({ parameterCategory, parameterName, parameterValue }) => {
      this.profileParameters().set(`${parameterCategory}.${parameterName}`, String(parameterValue));
      return okAsync({});
    },
  };
}
