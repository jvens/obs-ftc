// applySetup against OBS: a FakeObs in the unit tests, the real OBS Studio in `npm run test:obs`.
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { SetupMode, applySetup } from './apply';
import { setCameraSource } from './cameras';
import { ObsCall } from './obsCall';
import { SOURCE_NAMES, SetupOptions, buildPlan } from './layout';
import { lanReceiverUrl } from '../lanCamera/urls';
import { closeObs, eventually, freshObs, queries, unwrap } from '../test/obsUnderTest';

let call: ObsCall;
let obs: ReturnType<typeof queries>;
let eventNumber = 0;

beforeEach(async () => {
  ({ call } = await freshObs());
  obs = queries(call);
});

afterAll(closeObs);

// A new event code per test keeps the scene collections setup creates apart. Nothing is reachable
// at these addresses, so OBS's browser sources stay blank.
const options = (overrides: Partial<SetupOptions> = {}): SetupOptions => ({
  ftcHost: '127.0.0.1:9',
  eventCode: `test${++eventNumber}`,
  fieldCount: 2,
  audioMode: 'device',
  overlaySounds: true,
  safeBackgroundUrl: 'about:blank#background',
  lowerThirdUrl: 'about:blank#lower-third',
  lanReceiver: { port: 4455, password: 'pw' },
  ...overrides,
});

const SETUP_SCENE = 'FTC Setup (temporary)';

const OUR_SCENES = [
  'Field 1', 'Field 2', 'Ceremony', 'Alliance Selection', 'Pit Display', 'Sponsor Loop',
  'Camera - Field 1', 'Camera - Field 2', 'Camera - Ceremony',
];

// Requests that change OBS, other than muting (which setup repeats harmlessly).
const MUTATION = /^(Create|Remove|Set(?!InputMute))/;

// Runs setup, noting the requests it makes.
const setup = async (mode: SetupMode, setupOptions: SetupOptions) => {
  const log: string[] = [];
  const requests: string[] = [];
  const recorded = ((requestType: string, requestData?: unknown) => {
    requests.push(requestType);
    return (call as (type: string, data?: unknown) => ReturnType<ObsCall>)(requestType, requestData);
  }) as ObsCall;
  const report = await unwrap(applySetup(recorded, setupOptions, mode, line => log.push(line)));
  return { ...report, log, requests };
};

describe('setting up in a new scene collection', () => {
  it('builds every scene, in order, with each scene\'s sources stacked as planned', async () => {
    const setupOptions = options();

    const report = await setup('newCollection', setupOptions);

    expect(report.sceneCollection).toBe(`FTC ${setupOptions.eventCode}`);
    expect(await obs.sceneCollection()).toBe(report.sceneCollection);
    // OBS's own empty "Scene" is gone.
    expect(await obs.scenes()).toEqual(OUR_SCENES);
    expect(await obs.programScene()).toBe('Field 1');
    for (const scene of buildPlan(setupOptions).scenes)
      expect(await obs.sources(scene.name)).toEqual(scene.items.map(item => item.source));
  });

  it('gives each camera a muted capture input filling the canvas, and an audio device', async () => {
    await setup('newCollection', options());
    expect(await obs.sources('Camera - Field 2')).toEqual(['Camera - Field 2 (Capture)']);
    expect(await obs.input('Camera - Field 2 (Capture)')).toMatchObject({ kind: 'dshow_input', muted: true });
    expect(await obs.transform('Camera - Field 2', 'Camera - Field 2 (Capture)')).toMatchObject({
      positionX: 0, positionY: 0, boundsWidth: 1920, boundsHeight: 1080, boundsType: 'OBS_BOUNDS_SCALE_INNER',
    });
    expect(await obs.input(SOURCE_NAMES.audio)).toMatchObject({ kind: 'wasapi_input_capture', muted: false });
  });

  it('points the browser sources at the event', async () => {
    const setupOptions = options();
    await setup('newCollection', setupOptions);
    for (const input of buildPlan(setupOptions).inputs.filter(input => input.kind === 'browser_source'))
      expect((await obs.input(input.name)).settings).toMatchObject(input.settings);
  });

  it('mutes desktop audio and the microphone', async () => {
    const report = await setup('newCollection', options());
    const special = await obs.specialInputs();
    for (const name of special)
      expect(await obs.input(name)).toMatchObject({ muted: true });
    if (special.length > 0)
      expect(report.warnings).toContainEqual(expect.stringMatching(/^Muted /));
  });

  it('crops the ceremony camera into the alliance selection window, scaled to the canvas', async () => {
    await call('SetVideoSettings', { baseWidth: 1280, baseHeight: 720, outputWidth: 1280, outputHeight: 720 });
    await setup('newCollection', options());
    expect(await obs.transform('Alliance Selection', 'Camera - Ceremony')).toMatchObject({
      // OBS keeps positions to the half pixel.
      positionX: expect.closeTo(119 * 2 / 3, 0),
      positionY: expect.closeTo(357 * 2 / 3, 0),
      boundsWidth: 608,
      boundsHeight: 342,
      boundsType: 'OBS_BOUNDS_SCALE_OUTER',
      cropToBounds: true,
    });
  });
});

describe('updating the current scene collection', () => {
  it('builds everything in a fresh collection, below the current scene', async () => {
    await setup('update', options());
    expect(await obs.scenes()).toEqual(['Scene', ...OUR_SCENES]);
  });

  it('changes nothing when run again, so browser sources do not reload', async () => {
    const setupOptions = options();
    await setup('newCollection', setupOptions);

    const report = await setup('update', setupOptions);

    expect(report.requests.filter(type => MUTATION.test(type))).toEqual([]);
    expect(report.log).toEqual(['Done']);
    expect(report.warnings).toEqual([]);
  });

  it('points the browser sources at a new event', async () => {
    await setup('newCollection', options({ eventCode: 'first' }));

    const report = await setup('update', options({ eventCode: 'second' }));

    expect((await obs.input(SOURCE_NAMES.pit)).settings.url).toBe('http://127.0.0.1:9/event/second/display/?type=pit');
    expect(report.log).toEqual([
      `Updating url of "${SOURCE_NAMES.overlay}"`,
      `Updating url of "${SOURCE_NAMES.pit}"`,
      `Updating url of "${SOURCE_NAMES.sponsor}"`,
      'Done',
    ]);
  });

  it('puts back a removed source in its place and keeps the user\'s own sources', async () => {
    const setupOptions = options();
    await setup('newCollection', setupOptions);
    await call('CreateInput', { sceneName: 'Field 1', inputName: 'Score Bug', inputKind: 'color_source_v3', inputSettings: {} });
    const { sceneItems } = await unwrap(call('GetSceneItemList', { sceneName: 'Field 1' }));
    const overlay = sceneItems.find(item => item.sourceName === SOURCE_NAMES.overlay)!;
    await call('RemoveSceneItem', { sceneName: 'Field 1', sceneItemId: Number(overlay.sceneItemId) });

    await setup('update', setupOptions);

    expect(await obs.sources('Field 1'))
      .toEqual([SOURCE_NAMES.overlay, 'Score Bug', 'Camera - Field 1', SOURCE_NAMES.safeBackground, SOURCE_NAMES.audio]);
  });

  // OBS adds new scenes just below the current one (Field 1 after setup), which puts the new
  // camera's scene among the program scenes.
  it('adds the scenes a bigger event needs below the current scene', async () => {
    await setup('newCollection', options({ eventCode: 'event' }));
    await setup('update', options({ eventCode: 'event', fieldCount: 3 }));
    expect((await obs.scenes()).slice(0, 4)).toEqual(['Field 1', 'Field 3', 'Camera - Field 3', 'Field 2']);
    expect(await obs.sources('Field 3')).toEqual([SOURCE_NAMES.overlay, 'Camera - Field 3', SOURCE_NAMES.safeBackground, SOURCE_NAMES.audio]);
  });

  it('keeps the camera choices', async () => {
    const setupOptions = options();
    await setup('newCollection', setupOptions);
    await setCameraSource(call, { label: 'Field 2', scene: 'Camera - Field 2' }, { type: 'shared', scene: 'Camera - Field 1' }, true, setupOptions.lanReceiver);
    await setup('update', setupOptions);
    expect(await obs.sources('Camera - Field 2')).toEqual(['Camera - Field 1']);
  });

  it('updates LAN camera receivers for a new OBS password', async () => {
    const setupOptions = options();
    await setup('newCollection', setupOptions);
    await setCameraSource(call, { label: 'Field 1', scene: 'Camera - Field 1' }, { type: 'lan' }, true, setupOptions.lanReceiver);
    const lanReceiver = { port: 4455, password: 'changed' };

    const report = await setup('update', { ...setupOptions, lanReceiver });

    expect((await obs.input('Camera - Field 1 (LAN)')).settings.url).toBe(lanReceiverUrl('Field 1', '', lanReceiver));
    expect(report.log).toContain('Updating the LAN camera receiver of "Camera - Field 1"');
  });

  it('leaves a source of the wrong kind alone and warns about it', async () => {
    await call('CreateInput', { sceneName: 'Scene', inputName: SOURCE_NAMES.pit, inputKind: 'color_source_v3', inputSettings: { color: 4278190335 } });

    const report = await setup('update', options());

    expect(await obs.input(SOURCE_NAMES.pit)).toMatchObject({ kind: 'color_source_v3', settings: { color: 4278190335 } });
    expect(report.warnings).toContain(`"${SOURCE_NAMES.pit}" already exists as a color_source_v3, not a browser_source. Left it as it was.`);
  });
});

describe('wiping the current scene collection', () => {
  it('removes everything but desktop audio and the microphone, then builds', async () => {
    await call('CreateScene', { sceneName: 'Old Scene' });
    await call('CreateInput', { sceneName: 'Old Scene', inputName: 'Old Camera', inputKind: 'dshow_input', inputSettings: {} });
    await call('SetStudioModeEnabled', { studioModeEnabled: true });
    const collection = await obs.sceneCollection();

    try {
      await setup('wipe', options());

      expect(await obs.sceneCollection()).toBe(collection);
      // OBS 32 lists a removed scene for a moment after removing it.
      await eventually(async () => !(await obs.scenes()).includes(SETUP_SCENE), 'wipe\'s temporary scene to leave the scene list');
      expect(await obs.scenes()).toEqual(OUR_SCENES);
      expect(await obs.inputs()).not.toContain('Old Camera');
      expect(await obs.inputs()).toEqual(expect.arrayContaining(await obs.specialInputs()));
      expect((await unwrap(call('GetCurrentPreviewScene'))).currentPreviewSceneName).toBe('Field 1');
    } finally {
      await call('SetStudioModeEnabled', { studioModeEnabled: false });
    }
  });
});
