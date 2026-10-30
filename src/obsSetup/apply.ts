import { ResultAsync, okAsync } from 'neverthrow';
import {
  DEFAULT_CAMERA_TYPE, Plan, PlannedCamera, PlannedItem, PlannedScene, SOURCE_NAMES, SetupOptions, buildPlan, cameraInputName,
} from './layout';
import { addCameraInput, cameraMuted, setCameraAudioMuted, updateLanReceiver } from './cameras';
import { Canvas, ObsCall, getCanvas, ignoreError, sequence, transformFor, waitForInputsRemoved } from './obsCall';

// update:        add whatever is missing and point the browser sources at the current event; keeps
//                camera choices, audio devices, item positions and anything the user added.
// newCollection: build everything in a new, empty scene collection; the old one is kept in OBS.
// wipe:          delete every scene and source in the current scene collection, then build.
export type SetupMode = 'update' | 'newCollection' | 'wipe';

export interface SetupReport {
  warnings: string[];
  sceneCollection: string;
}

type Log = (line: string) => void;

interface ObsState {
  scenes: Set<string>;
  inputs: Map<string, string>; // name -> kind
  canvas: Canvas;
}

const SETUP_SCENE = 'FTC Setup (temporary)';

const loadState = (call: ObsCall): ResultAsync<ObsState, string> =>
  ResultAsync.combine([call('GetSceneList'), call('GetInputList'), getCanvas(call)])
    .map(([{ scenes }, { inputs }, canvas]) => ({
      scenes: new Set(scenes.map(scene => String(scene.sceneName))),
      inputs: new Map(inputs.map(input => [String(input.inputName), String(input.inputKind)])),
      canvas,
    }));

const ensureScene = (call: ObsCall, state: ObsState, name: string, log: Log) => {
  if (state.scenes.has(name))
    return okAsync<void, string>(undefined);
  log(`Creating scene "${name}"`);
  return call('CreateScene', { sceneName: name }).map(() => { state.scenes.add(name); });
};

const ensureCamera = (call: ObsCall, state: ObsState, camera: PlannedCamera, options: SetupOptions, log: Log) => {
  const muted = cameraMuted(options.audioMode);
  if (state.scenes.has(camera.scene))
    return setCameraAudioMuted(call, camera, muted)
      .andThen(() => updateLanReceiver(call, camera, options.lanReceiver))
      .map(updated => { if (updated) log(`Updating the LAN camera receiver of "${camera.scene}"`); });
  return ensureScene(call, state, camera.scene, log)
    .andThen(() => addCameraInput(call, camera, DEFAULT_CAMERA_TYPE, muted,
      state.inputs.has(cameraInputName(camera.label, DEFAULT_CAMERA_TYPE)), options.lanReceiver))
    .map(inputName => { state.inputs.set(inputName, 'camera'); });
};

// Compares setting values regardless of the key order OBS returns nested objects (e.g. fonts) in.
const canonical = (value: unknown): string =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? `{${Object.keys(value).sort().map(key => `${key}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
    : JSON.stringify(value);

// Only touches inputs whose settings differ, so re-running an update doesn't reload browser sources.
const updateInputs = (call: ObsCall, state: ObsState, plan: Plan, warnings: string[], log: Log) =>
  sequence(plan.inputs.filter(input => state.inputs.has(input.name) && !input.keepExistingSettings), input => {
    const kind = state.inputs.get(input.name);
    if (kind !== input.kind) {
      warnings.push(`"${input.name}" already exists as a ${kind}, not a ${input.kind}. Left it as it was.`);
      return okAsync(undefined);
    }
    return call('GetInputSettings', { inputName: input.name }).andThen(({ inputSettings }) => {
      const changed = Object.entries(input.settings).filter(([key, value]) => canonical(inputSettings[key]) !== canonical(value));
      if (changed.length === 0)
        return okAsync(undefined);
      log(`Updating ${changed.map(([key]) => key).join(', ')} of "${input.name}"`);
      return call('SetInputSettings', { inputName: input.name, inputSettings: Object.fromEntries(changed), overlay: true });
    });
  });

// Keeps the planned sources in the planned stacking order, using the slots they already occupy so
// sources the user added stay roughly where they were.
const restack = (call: ObsCall, scene: PlannedScene) =>
  call('GetSceneItemList', { sceneName: scene.name }).andThen(({ sceneItems }) => {
    const bottomUp = [...scene.items].reverse()
      .map(item => sceneItems.find(sceneItem => sceneItem.sourceName === item.source))
      .filter(sceneItem => sceneItem !== undefined);
    const slots = bottomUp.map(sceneItem => Number(sceneItem.sceneItemIndex)).sort((a, b) => a - b);
    return sequence(bottomUp.map((sceneItem, index) => ({ sceneItemId: Number(sceneItem.sceneItemId), sceneItemIndex: slots[index] })),
      ({ sceneItemId, sceneItemIndex }) => call('SetSceneItemIndex', { sceneName: scene.name, sceneItemId, sceneItemIndex }));
  });

const setTransform = (call: ObsCall, state: ObsState, scene: PlannedScene, item: PlannedItem, sceneItemId: number) =>
  call('SetSceneItemTransform', {
    sceneName: scene.name,
    sceneItemId,
    sceneItemTransform: transformFor(item.rect, item.fit, state.canvas),
  });

const fillScene = (call: ObsCall, state: ObsState, plan: Plan, scene: PlannedScene, log: Log) =>
  call('GetSceneItemList', { sceneName: scene.name }).andThen(({ sceneItems }) => {
    const present = new Set(sceneItems.map(item => String(item.sourceName)));
    // Sources are added bottom first; each new item lands on top of the previous ones.
    const missing = [...scene.items].reverse().filter(item => !present.has(item.source));
    if (missing.length > 0)
      log(`Adding ${missing.map(item => `"${item.source}"`).join(', ')} to "${scene.name}"`);
    const add = sequence(missing, item => {
      const planned = plan.inputs.find(input => input.name === item.source);
      const create = planned && !state.inputs.has(planned.name)
        ? call('CreateInput', { sceneName: scene.name, inputName: planned.name, inputKind: planned.kind, inputSettings: planned.settings })
            .map(result => { state.inputs.set(planned.name, planned.kind); return result; })
        : call('CreateSceneItem', { sceneName: scene.name, sourceName: item.source });
      return create.andThen(({ sceneItemId }) => setTransform(call, state, scene, item, sceneItemId));
    });
    return add.andThen(() => missing.length > 0 && sceneItems.length > 0 ? restack(call, scene) : okAsync(undefined));
  });

// Brings the current scene collection in line with the plan without removing anything.
const sync = (call: ObsCall, plan: Plan, options: SetupOptions, warnings: string[], log: Log) =>
  loadState(call).andThen(state => {
    if (state.canvas.width * 9 !== state.canvas.height * 16)
      warnings.push(`The OBS canvas is ${state.canvas.width}x${state.canvas.height}. FTC Live graphics are 16:9, so expect borders; 1920x1080 is recommended (Settings > Video).`);
    return updateInputs(call, state, plan, warnings, log)
      // OBS puts each new scene at the top of its list (and has no request to reorder them), so
      // create from the bottom up: cameras last in the list, program scenes above them.
      .andThen(() => sequence([...plan.cameras].reverse(), camera => ensureCamera(call, state, camera, options, log)))
      .andThen(() => sequence([...plan.scenes].reverse(), scene => ensureScene(call, state, scene.name, log)))
      .andThen(() => sequence(plan.scenes, scene => fillScene(call, state, plan, scene, log)))
      .andThen(() => state.inputs.has(SOURCE_NAMES.audio)
        ? call('SetInputMute', { inputName: SOURCE_NAMES.audio, inputMuted: options.audioMode !== 'device' })
        : okAsync(undefined));
  });

// Laptop sounds and the built-in microphone have no place on an event stream; the overlay's sounds
// reach OBS through the browser source, not Desktop Audio.
const muteGlobalAudio = (call: ObsCall, warnings: string[]) =>
  call('GetSpecialInputs').andThen(special => {
    const names = Object.values(special).filter((name): name is string => typeof name === 'string' && name !== '');
    if (names.length > 0)
      warnings.push(`Muted ${names.map(name => `"${name}"`).join(' and ')} so computer sounds and the built-in microphone stay off the stream. Unmute them in the OBS audio mixer if you need them.`);
    return sequence(names, inputName => call('SetInputMute', { inputName, inputMuted: true }));
  });

const uniqueCollectionName = (call: ObsCall, base: string) =>
  call('GetSceneCollectionList').map(({ sceneCollections }) => {
    let name = base;
    for (let n = 2; sceneCollections.includes(name); n++)
      name = `${base} (${n})`;
    return name;
  });

// Moves program (and preview, in studio mode) to `scene` so the others can be removed.
const showScene = (call: ObsCall, scene: string) =>
  call('SetCurrentProgramScene', { sceneName: scene })
    .andThen(() => call('GetStudioModeEnabled'))
    .andThen(({ studioModeEnabled }) => studioModeEnabled
      ? call('SetCurrentPreviewScene', { sceneName: scene }).map(() => undefined)
      : okAsync(undefined));

const wipe = (call: ObsCall, log: Log) =>
  ResultAsync.combine([call('GetSceneList'), call('GetInputList'), call('GetSpecialInputs')])
    .andThen(([{ scenes }, { inputs }, special]) => {
      const keep = new Set(Object.values(special));
      const removed = inputs.map(input => String(input.inputName)).filter(name => !keep.has(name));
      log('Removing all scenes and sources from the current scene collection');
      const others = scenes.map(scene => String(scene.sceneName)).filter(name => name !== SETUP_SCENE);
      // The setup scene is left over if an earlier wipe was interrupted.
      const setupScene = others.length < scenes.length ? okAsync(undefined) : call('CreateScene', { sceneName: SETUP_SCENE });
      return setupScene
        .andThen(() => showScene(call, SETUP_SCENE))
        .andThen(() => sequence(others, sceneName => call('RemoveScene', { sceneName })))
        .andThen(() => sequence(removed, inputName => ignoreError(call('RemoveInput', { inputName }))))
        .andThen(() => {
          log('Waiting for OBS to finish removing sources (capture devices can take a while)');
          return waitForInputsRemoved(call, removed);
        });
    });

// Scenes OBS put in a new collection by itself ("Scene"), removed once ours exist.
const removeEmptyScenes = (call: ObsCall, keep: Set<string>) =>
  call('GetSceneList').andThen(({ scenes }) => sequence(
    scenes.map(scene => String(scene.sceneName)).filter(name => !keep.has(name)),
    sceneName => call('GetSceneItemList', { sceneName })
      .andThen(({ sceneItems }) => sceneItems.length === 0 ? call('RemoveScene', { sceneName }) : okAsync(undefined))));

export const applySetup = (call: ObsCall, options: SetupOptions, mode: SetupMode, log: Log): ResultAsync<SetupReport, string> => {
  const warnings: string[] = [];
  const prepare: ResultAsync<unknown, string> = mode === 'newCollection'
    ? uniqueCollectionName(call, `FTC ${options.eventCode}`).andThen(name => {
        log(`Creating scene collection "${name}"`);
        return call('CreateSceneCollection', { sceneCollectionName: name });
      })
    : mode === 'wipe' ? wipe(call, log) : okAsync(undefined);

  return prepare
    .andThen(() => okAsync(buildPlan(options)))
    .andThen(plan => sync(call, plan, options, warnings, log).map(() => plan))
    .andThen(plan => {
      if (mode === 'update')
        return okAsync<void, string>(undefined);
      const ours = new Set([...plan.scenes.map(scene => scene.name), ...plan.cameras.map(camera => camera.scene)]);
      return muteGlobalAudio(call, warnings)
        .andThen(() => showScene(call, plan.scenes[0].name))
        .andThen(() => removeEmptyScenes(call, ours));
    })
    .andThen(() => call('GetSceneCollectionList'))
    .map(({ currentSceneCollectionName }) => {
      log('Done');
      return { warnings, sceneCollection: currentSceneCollectionName };
    });
};
