import { describe, expect, it } from '@jest/globals';
import { applySetup } from './apply';
import { customCameraNameError, removeCustomCameraScenes, setOverlayShown } from './customCameras';
import { CustomCamera, SOURCE_NAMES, SetupOptions, buildPlan } from './layout';
import { FakeObs } from '../test/fakeObs';

const AUDIENCE: CustomCamera = { name: 'Audience', overlay: true };
const PIT: CustomCamera = { name: 'Pit Camera', overlay: false };

const options = (customCameras: CustomCamera[]): SetupOptions => ({
  ftcHost: '192.168.1.5',
  eventCode: 'usmnrq1',
  fieldCount: 2,
  audioMode: 'device',
  overlaySounds: true,
  safeBackgroundUrl: 'https://example.com/bg.png',
  lowerThirdUrl: 'https://obs.example.com/lower-third.html',
  lanReceiver: { port: 4455, password: 'pw' },
  customCameras,
});

const overlayShown = (obs: FakeObs, scene: string) =>
  obs.collection.items.get(scene)!.find(item => item.sourceName === SOURCE_NAMES.overlay)!.enabled;

describe('custom cameras in the plan', () => {
  it('gives each one a camera and a scene of its own, after the event scenes', () => {
    const plan = buildPlan(options([AUDIENCE, PIT]), 'windows');
    expect(plan.cameras.map(camera => camera.label)).toEqual(['Field 1', 'Field 2', 'Ceremony', 'Audience', 'Pit Camera']);
    expect(plan.scenes.map(scene => scene.name).slice(-3)).toEqual(['Sponsor Loop', 'Audience', 'Pit Camera']);
    const pit = plan.scenes.find(scene => scene.name === 'Pit Camera')!;
    expect(pit.items.map(item => [item.source, item.hidden ?? false])).toEqual([
      [SOURCE_NAMES.lowerThird, false],
      [SOURCE_NAMES.overlay, true],
      ['Camera - Pit Camera', false],
      [SOURCE_NAMES.safeBackground, false],
      [SOURCE_NAMES.audio, false],
    ]);
  });
});

describe('custom cameras in OBS', () => {
  it('builds their scenes, with the overlay hidden where it is off', async () => {
    const obs = new FakeObs();
    (await applySetup(obs.call, options([AUDIENCE, PIT]), 'newCollection', () => undefined))._unsafeUnwrap();
    expect(obs.scenes).toEqual(expect.arrayContaining(['Audience', 'Pit Camera', 'Camera - Audience', 'Camera - Pit Camera']));
    expect(obs.sources('Camera - Pit Camera')).toEqual(['Camera - Pit Camera (Capture)']);
    expect(overlayShown(obs, 'Audience')).toBe(true);
    expect(overlayShown(obs, 'Pit Camera')).toBe(false);
  });

  it('adds a new one to an event set up before, on update', async () => {
    const obs = new FakeObs();
    (await applySetup(obs.call, options([]), 'newCollection', () => undefined))._unsafeUnwrap();
    (await applySetup(obs.call, options([PIT]), 'update', () => undefined))._unsafeUnwrap();
    expect(obs.scenes).toEqual(expect.arrayContaining(['Pit Camera', 'Camera - Pit Camera']));
    expect(overlayShown(obs, 'Pit Camera')).toBe(false);
  });

  it('shows and hides the overlay in its scene', async () => {
    const obs = new FakeObs();
    (await applySetup(obs.call, options([PIT]), 'newCollection', () => undefined))._unsafeUnwrap();
    (await setOverlayShown(obs.call, PIT, true))._unsafeUnwrap();
    expect(overlayShown(obs, 'Pit Camera')).toBe(true);
    (await setOverlayShown(obs.call, PIT, false))._unsafeUnwrap();
    expect(overlayShown(obs, 'Pit Camera')).toBe(false);
  });

  it('leaves OBS alone when the scene is not built yet', async () => {
    const obs = new FakeObs();
    (await setOverlayShown(obs.call, PIT, true))._unsafeUnwrap();
    (await removeCustomCameraScenes(obs.call, PIT))._unsafeUnwrap();
  });

  it('removes its scenes and its camera, and nothing else', async () => {
    const obs = new FakeObs();
    (await applySetup(obs.call, options([AUDIENCE, PIT]), 'newCollection', () => undefined))._unsafeUnwrap();
    (await removeCustomCameraScenes(obs.call, PIT))._unsafeUnwrap();
    expect(obs.scenes).not.toContain('Pit Camera');
    expect(obs.scenes).not.toContain('Camera - Pit Camera');
    expect(obs.scenes).toContain('Audience');
    expect(obs.inputs.has('Camera - Pit Camera (Capture)')).toBe(false);
    expect(obs.inputs.has(SOURCE_NAMES.overlay)).toBe(true);
  });
});

describe('customCameraNameError', () => {
  it('takes a new name', () => {
    expect(customCameraNameError('Pit Camera', [AUDIENCE], 2)).toBeUndefined();
  });

  it('needs a name that is not a scene or source setup uses', () => {
    expect(customCameraNameError('  ', [], 2)).toBe('Name the camera.');
    expect(customCameraNameError('audience', [AUDIENCE], 2)).toBe('"audience" is already used. Pick another name.');
    expect(customCameraNameError('Pit Display', [], 2)).toBe('"Pit Display" is already used. Pick another name.');
    expect(customCameraNameError('Field 2', [], 2)).toBe('"Field 2" is already used. Pick another name.');
    expect(customCameraNameError('FTC Live Overlay', [], 2)).toBe('"FTC Live Overlay" is already used. Pick another name.');
    expect(customCameraNameError('Camera - Extra', [], 2)).toBe('Names starting with "Camera - " are for the camera scenes.');
  });
});
