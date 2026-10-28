import { ResultAsync, okAsync } from 'neverthrow';
import {
  AudioMode, CANVAS, CAMERA_DEVICE_PROPERTY, CAMERA_INPUT_KINDS, InputCameraType, JsonObject, PlannedCamera, cameraInputName,
} from './layout';
import { ObsCall, getCanvas, ignoreError, listPropertyItems, sequence, transformFor, waitForInputsRemoved } from './obsCall';

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

// Camera audio is only wanted when the stream takes its audio from the cameras.
export const cameraMuted = (audioMode: AudioMode) => audioMode !== 'camera';

export const getCameraStatus = (call: ObsCall, camera: PlannedCamera): ResultAsync<CameraStatus, string> =>
  call('GetSceneList').andThen(({ scenes }) => {
    if (!scenes.some(scene => scene.sceneName === camera.scene))
      return okAsync<CameraStatus, string>({ state: 'missing' });
    return call('GetSceneItemList', { sceneName: camera.scene }).andThen(({ sceneItems }) => {
      const only = sceneItems.length === 1 ? sceneItems[0] : undefined;
      const type = typeOfKind(only?.inputKind);
      if (only && only.sourceType === SCENE_SOURCE_TYPE)
        return okAsync<CameraStatus, string>({ state: 'shared', scene: String(only.sourceName) });
      if (!only || type === undefined)
        return okAsync<CameraStatus, string>({ state: 'custom', sources: sceneItems.map(item => String(item.sourceName)) });
      const inputName = String(only.sourceName);
      return call('GetInputSettings', { inputName }).map(({ inputSettings }): CameraStatus => ({
        state: 'input',
        type,
        inputName,
        device: String(inputSettings[CAMERA_DEVICE_PROPERTY[type]] ?? ''),
      }));
    });
  });

export const listCameraDevices = (call: ObsCall, inputName: string, type: InputCameraType) =>
  listPropertyItems(call, inputName, CAMERA_DEVICE_PROPERTY[type]);

export const setCameraDevice = (call: ObsCall, inputName: string, type: InputCameraType, value: string) =>
  call('SetInputSettings', { inputName, inputSettings: { [CAMERA_DEVICE_PROPERTY[type]]: value } });

// Keep sources running when they are not on screen so switching scenes never waits on a reconnect.
const cameraSettings = (type: InputCameraType): JsonObject => type === 'ndi'
  ? { ndi_behavior: 0 }
  : { deactivate_when_not_showing: false };

const fillCanvas = (call: ObsCall, sceneName: string, sceneItemId: number) =>
  getCanvas(call).andThen(canvas => call('SetSceneItemTransform', {
    sceneName,
    sceneItemId,
    sceneItemTransform: transformFor({ x: 0, y: 0, ...CANVAS }, 'contain', canvas),
  }));

// Adds the camera input of `type` to the camera scene, filling the canvas.
export const addCameraInput = (call: ObsCall, camera: PlannedCamera, type: InputCameraType, muted: boolean, inputExists: boolean) => {
  const inputName = cameraInputName(camera.label, type);
  const create = inputExists
    ? call('CreateSceneItem', { sceneName: camera.scene, sourceName: inputName })
    : call('CreateInput', {
        sceneName: camera.scene,
        inputName,
        inputKind: CAMERA_INPUT_KINDS[type],
        inputSettings: cameraSettings(type),
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
    const managed = sceneItems.filter(item => item.sourceType === SCENE_SOURCE_TYPE || typeOfKind(item.inputKind) !== undefined);
    const inputs = managed.filter(item => item.sourceType !== SCENE_SOURCE_TYPE).map(item => String(item.sourceName));
    return sequence(managed, item => call('RemoveSceneItem', { sceneName: camera.scene, sceneItemId: Number(item.sceneItemId) }))
      .andThen(() => sequence(inputs, inputName => ignoreError(call('RemoveInput', { inputName }))))
      .map(() => inputs);
  });

export const setCameraSource = (call: ObsCall, camera: PlannedCamera, source: CameraSource, muted: boolean) =>
  clearCamera(call, camera).andThen(removed => {
    if (source.type === 'shared')
      return call('CreateSceneItem', { sceneName: camera.scene, sourceName: source.scene })
        .andThen(({ sceneItemId }) => fillCanvas(call, camera.scene, sceneItemId));
    const inputName = cameraInputName(camera.label, source.type);
    // Switching back to a type just removed reuses its name, so the old input has to be gone first.
    const ready = removed.includes(inputName) ? waitForInputsRemoved(call, [inputName]) : okAsync<void, string>(undefined);
    return ready
      .andThen(() => call('GetInputList'))
      .andThen(({ inputs }) => addCameraInput(call, camera, source.type, muted, inputs.some(input => input.inputName === inputName)));
  });

export const setCameraAudioMuted = (call: ObsCall, camera: PlannedCamera, muted: boolean) =>
  call('GetSceneItemList', { sceneName: camera.scene })
    .map(({ sceneItems }) => sceneItems.filter(item => typeOfKind(item.inputKind) !== undefined).map(item => String(item.sourceName)))
    .andThen(names => sequence(names, inputName => call('SetInputMute', { inputName, inputMuted: muted })));

export const cameraThumbnail = (call: ObsCall, scene: string, width = 320) =>
  call('GetSourceScreenshot', { sourceName: scene, imageFormat: 'jpg', imageWidth: width, imageCompressionQuality: 70 })
    .map(({ imageData }) => imageData);
