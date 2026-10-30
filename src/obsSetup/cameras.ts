import { ResultAsync, okAsync } from 'neverthrow';
import {
  AudioMode, CANVAS, CAMERA_DEVICE_PROPERTY, CAMERA_INPUT_KINDS, InputCameraType, JsonObject, PlannedCamera, cameraInputName,
} from './layout';
import { ListItem, ObsCall, getCanvas, ignoreError, listPropertyItems, sequence, transformFor, waitForInputsRemoved } from './obsCall';
import { LanReceiverConfig, isLanReceiverUrl, lanReceiverCamera, lanReceiverUrl } from '../lanCamera/urls';

export type CameraStatus =
  | { state: 'missing' }
  // The camera scene holds something other than one camera input or one other camera; leave it to the user.
  | { state: 'custom'; sources: string[] }
  | { state: 'input'; type: InputCameraType; inputName: string; device: string }
  // Shows another camera's scene, for one camera covering two roles.
  | { state: 'shared'; scene: string };

// What a camera scene should show.
export type CameraSource =
  | { type: InputCameraType }
  | { type: 'shared'; scene: string };

const SCENE_SOURCE_TYPE = 'OBS_SOURCE_TYPE_SCENE';

const typeOfKind = (kind: unknown): InputCameraType | undefined =>
  (Object.keys(CAMERA_INPUT_KINDS) as InputCameraType[]).find(type => CAMERA_INPUT_KINDS[type] === kind);

interface SceneItem {
  sceneItemId?: unknown;
  sourceName?: unknown;
  inputKind?: unknown;
  sourceType?: unknown;
}

// The camera type of a scene item, if it is one of our camera inputs. A browser source only counts
// when it is a LAN camera receiver, so any other browser source in a camera scene stays the user's.
const cameraTypeOf = (call: ObsCall, item: SceneItem): ResultAsync<InputCameraType | undefined, string> => {
  const type = typeOfKind(item.inputKind);
  if (type !== 'lan')
    return okAsync(type);
  return call('GetInputSettings', { inputName: String(item.sourceName) })
    .map(({ inputSettings }) => isLanReceiverUrl(String(inputSettings.url ?? '')) ? type : undefined);
};

const cameraInputsOf = (call: ObsCall, sceneItems: SceneItem[]) =>
  ResultAsync.combine(sceneItems.map(item => cameraTypeOf(call, item)))
    .map(types => sceneItems.filter((_, index) => types[index] !== undefined));

// Camera audio is only wanted when the stream takes its audio from the cameras.
export const cameraMuted = (audioMode: AudioMode) => audioMode !== 'camera';

export const getCameraStatus = (call: ObsCall, camera: PlannedCamera): ResultAsync<CameraStatus, string> =>
  call('GetSceneList').andThen(({ scenes }) => {
    if (!scenes.some(scene => scene.sceneName === camera.scene))
      return okAsync<CameraStatus, string>({ state: 'missing' });
    return call('GetSceneItemList', { sceneName: camera.scene }).andThen(({ sceneItems }) => {
      const only = sceneItems.length === 1 ? sceneItems[0] : undefined;
      if (only && only.sourceType === SCENE_SOURCE_TYPE)
        return okAsync<CameraStatus, string>({ state: 'shared', scene: String(only.sourceName) });
      const custom: CameraStatus = { state: 'custom', sources: sceneItems.map(item => String(item.sourceName)) };
      if (!only)
        return okAsync<CameraStatus, string>(custom);
      return cameraTypeOf(call, only).andThen(type => {
        if (type === undefined)
          return okAsync<CameraStatus, string>(custom);
        const inputName = String(only.sourceName);
        return call('GetInputSettings', { inputName }).map(({ inputSettings }): CameraStatus => ({
          state: 'input',
          type,
          inputName,
          device: String(inputSettings[CAMERA_DEVICE_PROPERTY[type]] ?? ''),
        }));
      });
    });
  });

// The camera computers a LAN camera can show are the ones sending now, which the dashboard hears
// about itself rather than from OBS.
export const listCameraDevices = (call: ObsCall, inputName: string, type: InputCameraType): ResultAsync<ListItem[], string> =>
  type === 'lan' ? okAsync([]) : listPropertyItems(call, inputName, CAMERA_DEVICE_PROPERTY[type]);

export const setCameraDevice = (call: ObsCall, inputName: string, type: InputCameraType, value: string) =>
  call('SetInputSettings', { inputName, inputSettings: { [CAMERA_DEVICE_PROPERTY[type]]: value } });

// `sender` is the camera computer to show, empty for none yet.
const lanReceiverSettings = (camera: PlannedCamera, sender: string, lan: LanReceiverConfig): JsonObject => ({
  url: lanReceiverUrl(camera.label, sender, lan),
  width: CANVAS.width,
  height: CANVAS.height,
  // Camera audio goes through the OBS mixer, like any other camera.
  reroute_audio: true,
});

// Keep sources running when they are not on screen so switching scenes never waits on a reconnect.
const cameraSettings = (type: InputCameraType, camera: PlannedCamera, lan: LanReceiverConfig): JsonObject => {
  switch (type) {
    case 'ndi': return { ndi_behavior: 0 };
    case 'lan': return { ...lanReceiverSettings(camera, '', lan), shutdown: false, restart_when_active: false };
    case 'capture': return { deactivate_when_not_showing: false };
  }
};

const fillCanvas = (call: ObsCall, sceneName: string, sceneItemId: number) =>
  getCanvas(call).andThen(canvas => call('SetSceneItemTransform', {
    sceneName,
    sceneItemId,
    sceneItemTransform: transformFor({ x: 0, y: 0, ...CANVAS }, 'contain', canvas),
  }));

// Adds the camera input of `type` to the camera scene, filling the canvas.
export const addCameraInput = (
  call: ObsCall, camera: PlannedCamera, type: InputCameraType, muted: boolean, inputExists: boolean, lan: LanReceiverConfig,
) => {
  const inputName = cameraInputName(camera.label, type);
  const create = inputExists
    ? call('CreateSceneItem', { sceneName: camera.scene, sourceName: inputName })
    : call('CreateInput', {
        sceneName: camera.scene,
        inputName,
        inputKind: CAMERA_INPUT_KINDS[type],
        inputSettings: cameraSettings(type, camera, lan),
      });
  return create
    .andThen(({ sceneItemId }) => fillCanvas(call, camera.scene, sceneItemId))
    .andThen(() => call('SetInputMute', { inputName, inputMuted: muted }))
    .map(() => inputName);
};

// Empties the camera scene of camera inputs and shared cameras, leaving anything else alone, and
// returns the names of the inputs it removed. The scene items go at once; OBS destroys the inputs in
// the background (often by itself once their last scene item is gone), which can take a while for
// capture devices.
const clearCamera = (call: ObsCall, camera: PlannedCamera) =>
  call('GetSceneItemList', { sceneName: camera.scene }).andThen(({ sceneItems }) => {
    const scenes = sceneItems.filter(item => item.sourceType === SCENE_SOURCE_TYPE);
    return cameraInputsOf(call, sceneItems).andThen(cameraInputs => {
      const inputs = cameraInputs.map(item => String(item.sourceName));
      return sequence([...scenes, ...cameraInputs], item => call('RemoveSceneItem', { sceneName: camera.scene, sceneItemId: Number(item.sceneItemId) }))
        .andThen(() => sequence(inputs, inputName => ignoreError(call('RemoveInput', { inputName }))))
        .map(() => inputs);
    });
  });

export const setCameraSource = (call: ObsCall, camera: PlannedCamera, source: CameraSource, muted: boolean, lan: LanReceiverConfig) =>
  clearCamera(call, camera).andThen(removed => {
    if (source.type === 'shared')
      return call('CreateSceneItem', { sceneName: camera.scene, sourceName: source.scene })
        .andThen(({ sceneItemId }) => fillCanvas(call, camera.scene, sceneItemId));
    const inputName = cameraInputName(camera.label, source.type);
    // Switching back to a type just removed reuses its name, so the old input has to be gone first.
    const ready = removed.includes(inputName) ? waitForInputsRemoved(call, [inputName]) : okAsync<void, string>(undefined);
    return ready
      .andThen(() => call('GetInputList'))
      .andThen(({ inputs }) => addCameraInput(call, camera, source.type, muted, inputs.some(input => input.inputName === inputName), lan));
  });

export const setCameraAudioMuted = (call: ObsCall, camera: PlannedCamera, muted: boolean) =>
  call('GetSceneItemList', { sceneName: camera.scene })
    .andThen(({ sceneItems }) => cameraInputsOf(call, sceneItems))
    .andThen(items => sequence(items, item => call('SetInputMute', { inputName: String(item.sourceName), inputMuted: muted })));

// Shows camera computer `sender` in a LAN camera.
export const setLanCameraSender = (call: ObsCall, camera: PlannedCamera, inputName: string, sender: string, lan: LanReceiverConfig) =>
  call('SetInputSettings', { inputName, inputSettings: lanReceiverSettings(camera, sender, lan) });

// Points a LAN camera's browser source at this dashboard's receiver page with the current OBS port and
// password, keeping the camera computer it shows; other cameras are left alone.
export const updateLanReceiver = (call: ObsCall, camera: PlannedCamera, lan: LanReceiverConfig) =>
  getCameraStatus(call, camera).andThen(status => {
    if (status.state !== 'input' || status.type !== 'lan')
      return okAsync<boolean, string>(false);
    const sender = lanReceiverCamera(status.device);
    if (status.device === lanReceiverUrl(camera.label, sender, lan))
      return okAsync<boolean, string>(false);
    return setLanCameraSender(call, camera, status.inputName, sender, lan).map(() => true);
  });

export const cameraThumbnail = (call: ObsCall, scene: string, width = 320) =>
  call('GetSourceScreenshot', { sourceName: scene, imageFormat: 'jpg', imageWidth: width, imageCompressionQuality: 70 })
    .map(({ imageData }) => imageData);
