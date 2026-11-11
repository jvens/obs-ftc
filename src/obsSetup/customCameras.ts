import { ResultAsync, okAsync } from 'neverthrow';
import { ObsCall } from './obsCall';
import { CustomCamera, SCENE_NAMES, SOURCE_NAMES, cameraSceneName, plannedCameras } from './layout';

// Why a name cannot be a new custom camera, or undefined when it can. Its scene is named after it,
// so it must not clash with another scene setup builds or with an OBS source setup uses.
export const customCameraNameError = (name: string, cameras: CustomCamera[], fieldCount: number): string | undefined => {
  const trimmed = name.trim();
  if (trimmed === '') return 'Name the camera.';
  const taken = [
    ...Array.from({ length: Math.max(1, fieldCount) }, (_, index) => SCENE_NAMES.field(index + 1)),
    SCENE_NAMES.ceremony, SCENE_NAMES.allianceSelection, SCENE_NAMES.pit, SCENE_NAMES.sponsor,
    ...Object.values(SOURCE_NAMES),
    ...plannedCameras(fieldCount, cameras).map(camera => camera.label),
  ];
  if (taken.some(other => other.toLowerCase() === trimmed.toLowerCase()))
    return `"${trimmed}" is already used. Pick another name.`;
  if (/^camera - /i.test(trimmed)) return 'Names starting with "Camera - " are for the camera scenes.';
  return undefined;
};

// Shows or hides the FTC Live overlay in a custom camera's scene, if OBS has the scene.
export const setOverlayShown = (call: ObsCall, camera: CustomCamera, shown: boolean): ResultAsync<void, string> =>
  call('GetSceneList').andThen(({ scenes }) => !scenes.some(scene => scene.sceneName === camera.name)
    ? okAsync(undefined)
    : call('GetSceneItemId', { sceneName: camera.name, sourceName: SOURCE_NAMES.overlay })
        .andThen(({ sceneItemId }) => call('SetSceneItemEnabled', { sceneName: camera.name, sceneItemId, sceneItemEnabled: shown }))
        .map(() => undefined));

// Removes a custom camera's scenes from OBS: its own scene, its camera scene, and the camera input in
// it (a camera shown from another camera's scene is left alone).
export const removeCustomCameraScenes = (call: ObsCall, camera: CustomCamera): ResultAsync<void, string> => {
  const cameraScene = cameraSceneName(camera.name);
  return call('GetSceneList').andThen(({ scenes }) => {
    const names = new Set(scenes.map(scene => String(scene.sceneName)));
    const removeCameraInputs = names.has(cameraScene)
      ? call('GetSceneItemList', { sceneName: cameraScene }).andThen(({ sceneItems }) => ResultAsync.combine(
          sceneItems
            .filter(item => item.sourceType === 'OBS_SOURCE_TYPE_INPUT')
            .map(item => call('RemoveInput', { inputName: String(item.sourceName) }))))
      : okAsync([]);
    return removeCameraInputs
      .andThen(() => names.has(camera.name) ? call('RemoveScene', { sceneName: camera.name }) : okAsync(undefined))
      .andThen(() => names.has(cameraScene) ? call('RemoveScene', { sceneName: cameraScene }) : okAsync(undefined))
      .map(() => undefined);
  });
};
