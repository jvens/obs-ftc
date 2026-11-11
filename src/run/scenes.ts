// Which OBS scenes the Run view offers as buttons: every scene in OBS's order except the camera
// scenes Configure OBS Studio builds ("Camera - Field 1"), which only hold a camera for the scenes
// that show it. Scenes added in OBS by hand get a button too.
export const runScenes = (scenes: string[]) => scenes.filter(scene => !scene.startsWith('Camera - '));
