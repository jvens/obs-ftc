import { ResultAsync, okAsync } from 'neverthrow';
import {
  AudioMode, CAMERA_DEVICE_PROPERTY, CAMERA_INPUT_KINDS, CameraType, JsonObject, PlannedCamera, cameraInputName,
} from './layout';
import { ObsCall, getCanvas, listPropertyItems, sequence, transformFor, waitForInputsRemoved } from './obsCall';

export type CameraStatus =
  | { state: 'missing' }
  // The camera scene holds something other than a single NDI or capture input; leave it to the user.
  | { state: 'custom'; sources: string[] }
  | { state: 'managed'; type: CameraType; inputName: string; device: string };

const typeOfKind = (kind: unknown): CameraType | undefined =>
  (Object.keys(CAMERA_INPUT_KINDS) as CameraType[]).find(type => CAMERA_INPUT_KINDS[type] === kind);

// Camera audio is only wanted when the stream takes its audio from the cameras.
export const cameraMuted = (audioMode: AudioMode) => audioMode !== 'camera';

const cameraInputsIn = (call: ObsCall, scene: string) =>
  call('GetSceneItemList', { sceneName: scene })
    .map(({ sceneItems }) => sceneItems.filter(item => typeOfKind(item.inputKind) !== undefined)
      .map(item => String(item.sourceName)));

export const getCameraStatus = (call: ObsCall, camera: PlannedCamera): ResultAsync<CameraStatus, string> =>
  call('GetSceneList').andThen(({ scenes }) => {
    if (!scenes.some(scene => scene.sceneName === camera.scene))
      return okAsync<CameraStatus, string>({ state: 'missing' });
    return call('GetSceneItemList', { sceneName: camera.scene }).andThen(({ sceneItems }) => {
      const type = sceneItems.length === 1 ? typeOfKind(sceneItems[0].inputKind) : undefined;
      if (type === undefined)
        return okAsync<CameraStatus, string>({ state: 'custom', sources: sceneItems.map(item => String(item.sourceName)) });
      const inputName = String(sceneItems[0].sourceName);
      return call('GetInputSettings', { inputName }).map(({ inputSettings }): CameraStatus => ({
        state: 'managed',
        type,
        inputName,
        device: String(inputSettings[CAMERA_DEVICE_PROPERTY[type]] ?? ''),
      }));
    });
  });

export const listCameraDevices = (call: ObsCall, inputName: string, type: CameraType) =>
  listPropertyItems(call, inputName, CAMERA_DEVICE_PROPERTY[type]);

export const setCameraDevice = (call: ObsCall, inputName: string, type: CameraType, value: string) =>
  call('SetInputSettings', { inputName, inputSettings: { [CAMERA_DEVICE_PROPERTY[type]]: value } });

// Keep sources running when they are not on screen so switching scenes never waits on a reconnect.
const cameraSettings = (type: CameraType): JsonObject => type === 'ndi'
  ? { ndi_behavior: 0 }
  : { deactivate_when_not_showing: false };

// Adds the camera input of `type` to the camera scene, filling the canvas.
export const addCameraInput = (call: ObsCall, camera: PlannedCamera, type: CameraType, muted: boolean, inputExists: boolean) => {
  const inputName = cameraInputName(camera.label, type);
  const create = inputExists
    ? call('CreateSceneItem', { sceneName: camera.scene, sourceName: inputName })
    : call('CreateInput', {
        sceneName: camera.scene,
        inputName,
        inputKind: CAMERA_INPUT_KINDS[type],
        inputSettings: cameraSettings(type),
      });
  return ResultAsync.combine([create, getCanvas(call)])
    .andThen(([{ sceneItemId }, canvas]) => call('SetSceneItemTransform', {
      sceneName: camera.scene,
      sceneItemId,
      sceneItemTransform: transformFor({ x: 0, y: 0, width: 1920, height: 1080 }, 'contain', canvas),
    }))
    .andThen(() => call('SetInputMute', { inputName, inputMuted: muted }))
    .map(() => inputName);
};

// Replaces the NDI/capture input in the camera scene with one of the other type. Program scenes show
// the camera scene, so they keep their layout.
export const setCameraType = (call: ObsCall, camera: PlannedCamera, type: CameraType, muted: boolean) =>
  cameraInputsIn(call, camera.scene)
    .andThen(names => sequence(names, inputName => call('RemoveInput', { inputName }))
      .andThen(() => waitForInputsRemoved(call, names)))
    .andThen(() => call('GetInputList'))
    .andThen(({ inputs }) => addCameraInput(
      call, camera, type, muted, inputs.some(input => input.inputName === cameraInputName(camera.label, type))));

export const setCameraAudioMuted = (call: ObsCall, camera: PlannedCamera, muted: boolean) =>
  cameraInputsIn(call, camera.scene)
    .andThen(names => sequence(names, inputName => call('SetInputMute', { inputName, inputMuted: muted })));

export const cameraThumbnail = (call: ObsCall, scene: string, width = 320) =>
  call('GetSourceScreenshot', { sourceName: scene, imageFormat: 'jpg', imageWidth: width, imageCompressionQuality: 70 })
    .map(({ imageData }) => imageData);
