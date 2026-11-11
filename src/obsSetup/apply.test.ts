import { describe, expect, it } from '@jest/globals';
import { okAsync } from 'neverthrow';
import { SetupMode, applySetup } from './apply';
import { setCameraSource } from './cameras';
import { SOURCE_NAMES, SetupOptions, buildPlan, overlayUrl } from './layout';
import { lanReceiverUrl } from '../lanCamera/urls';
import { FakeObs, SPECIAL_INPUTS } from '../test/fakeObs';

const options = (overrides: Partial<SetupOptions> = {}): SetupOptions => ({
  ftcHost: '192.168.1.5',
  eventCode: 'usmnrq1',
  fieldCount: 2,
  audioMode: 'device',
  overlaySounds: true,
  safeBackgroundUrl: 'https://example.com/bg.png',
  lowerThirdUrl: 'https://obs.example.com/lower-third.html',
  lanReceiver: { port: 4455, password: 'pw' },
  customCameras: [],
  ...overrides,
});

const OUR_SCENES = [
  'Field 1', 'Field 2', 'Ceremony', 'Alliance Selection', 'Pit Display', 'Sponsor Loop',
  'Camera - Field 1', 'Camera - Field 2', 'Camera - Ceremony',
];

const MUTATIONS = /^(Create|Remove|Set(?!InputMute))/;

const setup = (obs: FakeObs, mode: SetupMode, setupOptions = options()) => {
  const log: string[] = [];
  return applySetup(obs.call, setupOptions, mode, line => log.push(line)).map(report => ({ ...report, log }));
};

describe('applySetup in a new scene collection', () => {
  it('builds every scene, in order, in a collection named after the event', async () => {
    const obs = new FakeObs();

    const report = (await setup(obs, 'newCollection'))._unsafeUnwrap();

    expect(report.sceneCollection).toBe('FTC usmnrq1');
    expect(obs.currentCollection).toBe('FTC usmnrq1');
    // OBS's own empty "Scene" is gone.
    expect(obs.scenes).toEqual(OUR_SCENES);
    expect(obs.collection.program).toBe('Field 1');
    expect(report.log.at(-1)).toBe('Done');
  });

  it('stacks each scene\'s sources as planned', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');
    for (const scene of buildPlan(options(), 'windows').scenes)
      expect(obs.sources(scene.name)).toEqual(scene.items.map(item => item.source));
  });

  it('gives each camera a capture input, muted while the audio comes from a device', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');
    expect(obs.sources('Camera - Field 2')).toEqual(['Camera - Field 2 (Capture)']);
    expect(obs.inputs.get('Camera - Field 2 (Capture)')).toMatchObject({ kind: 'dshow_input', muted: true });
    expect(obs.inputs.get(SOURCE_NAMES.audio)!.muted).toBe(false);
  });

  it('keeps the camera audio when the audio comes from the cameras', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection', options({ audioMode: 'camera' }));
    expect(obs.inputs.get('Camera - Field 1 (Capture)')!.muted).toBe(false);
    expect(obs.inputs.has(SOURCE_NAMES.audio)).toBe(false);
  });

  it('mutes desktop audio and the microphone, and says so', async () => {
    const obs = new FakeObs();
    const report = (await setup(obs, 'newCollection'))._unsafeUnwrap();
    expect(obs.inputs.get(SPECIAL_INPUTS.desktop1)!.muted).toBe(true);
    expect(obs.inputs.get(SPECIAL_INPUTS.mic1)!.muted).toBe(true);
    expect(report.warnings).toEqual([expect.stringContaining('Muted "Desktop Audio" and "Mic/Aux"')]);
  });

  it('keeps the old collection and picks a new name next time', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');
    expect((await setup(obs, 'newCollection'))._unsafeUnwrap().sceneCollection).toBe('FTC usmnrq1 (2)');
    expect([...obs.collections.keys()]).toEqual(['Untitled', 'FTC usmnrq1', 'FTC usmnrq1 (2)']);
  });

  it('scales the layout to the OBS canvas and warns when it is not 16:9', async () => {
    const obs = new FakeObs({ canvas: { width: 1440, height: 1080 } });
    const report = (await setup(obs, 'newCollection'))._unsafeUnwrap();
    expect(obs.item('Field 1', SOURCE_NAMES.overlay)!.transform).toMatchObject({ boundsWidth: 1440, boundsHeight: 1080 });
    expect(report.warnings).toContainEqual(expect.stringContaining('The OBS canvas is 1440x1080'));
  });
});

describe('applySetup updating the current collection', () => {
  it('changes nothing when run again', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');
    const from = obs.calls.length;

    const report = (await setup(obs, 'update'))._unsafeUnwrap();

    expect(obs.requestTypes(from).filter(type => MUTATIONS.test(type))).toEqual([]);
    expect(report.log).toEqual(['Done']);
    expect(report.warnings).toEqual([]);
  });

  it('points the browser sources at a new event without reloading the others', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');

    const report = (await setup(obs, 'update', options({ eventCode: 'usmnrq2' })))._unsafeUnwrap();

    expect(obs.inputs.get(SOURCE_NAMES.overlay)!.settings.url).toBe(overlayUrl('192.168.1.5', 'usmnrq2', true));
    expect(obs.inputs.get(SOURCE_NAMES.pit)!.settings.url).toBe('http://192.168.1.5/event/usmnrq2/display/?type=pit');
    expect(report.log).toEqual([
      `Updating url of "${SOURCE_NAMES.overlay}"`,
      `Updating url of "${SOURCE_NAMES.pit}"`,
      `Updating url of "${SOURCE_NAMES.sponsor}"`,
      'Done',
    ]);
  });

  it('puts back a removed source in its place and keeps the user\'s own sources', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');
    obs.addInput('Field 1', 'Score Bug', 'image_source');
    await obs.call('RemoveSceneItem', { sceneName: 'Field 1', sceneItemId: obs.item('Field 1', SOURCE_NAMES.overlay)!.sceneItemId });

    await setup(obs, 'update');

    expect(obs.sources('Field 1')).toEqual([SOURCE_NAMES.overlay, 'Score Bug', 'Camera - Field 1', SOURCE_NAMES.safeBackground, SOURCE_NAMES.audio]);
  });

  it('builds the scenes a bigger event needs', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');
    await setup(obs, 'update', options({ fieldCount: 3 }));
    expect(obs.sources('Field 3')).toEqual([SOURCE_NAMES.overlay, 'Camera - Field 3', SOURCE_NAMES.safeBackground, SOURCE_NAMES.audio]);
    expect(obs.scenes).toEqual([
      'Field 1', 'Field 2', 'Field 3', 'Ceremony', 'Alliance Selection', 'Pit Display', 'Sponsor Loop',
      'Camera - Field 1', 'Camera - Field 2', 'Camera - Field 3', 'Camera - Ceremony',
    ]);
    expect(obs.collection.program).toBe('Field 1');
  });

  it('keeps the camera choices', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');
    await setCameraSource(obs.call, { label: 'Field 2', scene: 'Camera - Field 2' }, { type: 'shared', scene: 'Camera - Field 1' }, true, options().lanReceiver);
    await setup(obs, 'update');
    expect(obs.sources('Camera - Field 2')).toEqual(['Camera - Field 1']);
  });

  it('updates LAN camera receivers for a new OBS password', async () => {
    const obs = new FakeObs();
    await setup(obs, 'newCollection');
    await setCameraSource(obs.call, { label: 'Field 1', scene: 'Camera - Field 1' }, { type: 'lan' }, true, options().lanReceiver);
    const lanReceiver = { port: 4455, password: 'changed' };

    const report = (await setup(obs, 'update', options({ lanReceiver })))._unsafeUnwrap();

    expect(obs.inputs.get('Camera - Field 1 (LAN)')!.settings.url).toBe(lanReceiverUrl('Field 1', '', lanReceiver));
    expect(report.log).toContain('Updating the LAN camera receiver of "Camera - Field 1"');
  });

  it('leaves a source of the wrong kind alone and warns about it', async () => {
    const obs = new FakeObs();
    obs.addInput('Scene', SOURCE_NAMES.pit, 'image_source', { file: 'pit.png' });

    const report = (await setup(obs, 'update'))._unsafeUnwrap();

    expect(obs.inputs.get(SOURCE_NAMES.pit)).toMatchObject({ kind: 'image_source', settings: { file: 'pit.png' } });
    expect(report.warnings).toContainEqual(`"${SOURCE_NAMES.pit}" already exists as a image_source, not a browser_source. Left it as it was.`);
  });
});

describe('applySetup wiping the current collection', () => {
  it('removes everything but desktop audio and the microphone, then builds', async () => {
    const obs = new FakeObs({ removalLag: 2 });
    obs.addScene('Old Scene');
    obs.addInput('Old Scene', 'Old Camera', 'dshow_input');
    obs.studioMode = true;

    (await setup(obs, 'wipe'))._unsafeUnwrap();

    expect(obs.currentCollection).toBe('Untitled');
    expect(obs.scenes).toEqual(OUR_SCENES);
    expect(obs.inputs.has('Old Camera')).toBe(false);
    expect(obs.inputs.has(SPECIAL_INPUTS.desktop1)).toBe(true);
    expect(obs.collection.preview).toBe('Field 1');
  });
});

describe('applySetup on Linux', () => {
  it('uses Video4Linux cameras and a PulseAudio device', async () => {
    const obs = new FakeObs({ platform: 'linux' });

    expect((await setup(obs, 'newCollection')).isOk()).toBe(true);

    expect(obs.inputs.get('Camera - Field 1 (Capture)')).toMatchObject({ kind: 'v4l2_input', settings: {} });
    expect(obs.inputs.get(SOURCE_NAMES.audio)).toMatchObject({ kind: 'pulse_input_capture', settings: { device_id: 'default' } });
  });
});

describe('applySetup on a platform it does not support', () => {
  it('stops before changing anything', async () => {
    const obs = new FakeObs();
    // OBS on macOS has neither DirectShow nor Video4Linux.
    const call = ((type: string, data?: unknown) =>
      type === 'GetInputKindList' ? okAsync({ inputKinds: ['browser_source', 'av_capture_input_v2', 'coreaudio_input_capture'] })
      : type === 'GetVersion' ? okAsync({ obsVersion: '33.0.1', platform: 'macos', platformDescription: 'macOS 15.6' })
      : (obs.call as (type: string, data?: unknown) => ReturnType<typeof obs.call>)(type, data)) as typeof obs.call;

    const result = await applySetup(call, options(), 'update', () => {});

    expect(result._unsafeUnwrapErr()).toBe('Setting up OBS on macOS 15.6 is not supported yet; only Windows and Linux are.');
    expect(obs.requestTypes().filter(type => /^(Create|Set|Remove)/.test(type))).toEqual([]);
  });
});
