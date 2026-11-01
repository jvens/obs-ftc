// The camera controls against OBS: a FakeObs in the unit tests, the real OBS Studio in
// `npm run test:obs`.
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import {
  cameraThumbnail, getCameraStatus, listCameraDevices, setCameraAudioMuted, setCameraSource, setLanCameraSender, updateLanReceiver,
} from './cameras';
import { ObsCall } from './obsCall';
import { PlannedCamera } from './layout';
import { lanReceiverUrl } from '../lanCamera/urls';
import { closeObs, freshObs, queries, unwrap } from '../test/obsUnderTest';

const FIELD_1: PlannedCamera = { label: 'Field 1', scene: 'Camera - Field 1' };
const CEREMONY: PlannedCamera = { label: 'Ceremony', scene: 'Camera - Ceremony' };
const LAN = { port: 4455, password: 'pw' };
const FILLS_CANVAS = { positionX: 0, positionY: 0, boundsWidth: 1920, boundsHeight: 1080, boundsType: 'OBS_BOUNDS_SCALE_INNER' };

let call: ObsCall;
let obs: ReturnType<typeof queries>;

beforeEach(async () => {
  ({ call } = await freshObs());
  obs = queries(call);
  await unwrap(call('CreateScene', { sceneName: CEREMONY.scene }));
  await unwrap(call('CreateScene', { sceneName: FIELD_1.scene }));
});

afterAll(closeObs);

const status = (camera = FIELD_1) => unwrap(getCameraStatus(call, camera));
const setSource = (source: Parameters<typeof setCameraSource>[2], muted = true) =>
  unwrap(setCameraSource(call, FIELD_1, source, muted, LAN));

describe('camera sources', () => {
  it('reports a camera without a scene as missing', async () => {
    expect(await status({ label: 'Field 9', scene: 'Camera - Field 9' })).toEqual({ state: 'missing' });
  });

  it('switches a camera between capture, LAN, shared and capture again', async () => {
    await setSource({ type: 'capture' });
    expect(await status()).toEqual({ state: 'input', type: 'capture', inputName: 'Camera - Field 1 (Capture)', device: '' });
    expect(await obs.transform(FIELD_1.scene, 'Camera - Field 1 (Capture)')).toMatchObject(FILLS_CANVAS);

    await setSource({ type: 'lan' });
    expect(await status()).toEqual({ state: 'input', type: 'lan', inputName: 'Camera - Field 1 (LAN)', device: lanReceiverUrl('Field 1', '', LAN) });
    expect(await obs.inputs()).not.toContain('Camera - Field 1 (Capture)');
    expect(await obs.input('Camera - Field 1 (LAN)')).toMatchObject({ kind: 'browser_source', muted: true, settings: { reroute_audio: true } });

    await setSource({ type: 'shared', scene: CEREMONY.scene });
    expect(await status()).toEqual({ state: 'shared', scene: CEREMONY.scene });
    expect(await obs.inputs()).not.toContain('Camera - Field 1 (LAN)');
    expect(await obs.transform(FIELD_1.scene, CEREMONY.scene)).toMatchObject(FILLS_CANVAS);

    // Reuses the name of an input that was just removed.
    await setSource({ type: 'capture' });
    await setSource({ type: 'capture' });
    expect(await obs.sources(FIELD_1.scene)).toEqual(['Camera - Field 1 (Capture)']);
  });

  it('leaves the user\'s other sources in a camera scene alone', async () => {
    await setSource({ type: 'capture' });
    await unwrap(call('CreateInput', { sceneName: FIELD_1.scene, inputName: 'Label', inputKind: 'color_source_v3', inputSettings: {} }));
    expect(await status()).toEqual({ state: 'custom', sources: ['Camera - Field 1 (Capture)', 'Label'] });

    await setSource({ type: 'shared', scene: CEREMONY.scene });

    expect(await obs.sources(FIELD_1.scene)).toEqual([CEREMONY.scene, 'Label']);
  });

  // A LAN camera has audio on every platform; capture cameras have none on Linux.
  it('mutes and unmutes the camera audio', async () => {
    await setSource({ type: 'lan' }, false);
    expect(await obs.input('Camera - Field 1 (LAN)')).toMatchObject({ muted: false });
    await unwrap(setCameraAudioMuted(call, FIELD_1, true));
    expect(await obs.input('Camera - Field 1 (LAN)')).toMatchObject({ muted: true });
  });

  it('leaves capture cameras without audio unmuted, rather than failing', async () => {
    await setSource({ type: 'capture' });
    expect((await setCameraAudioMuted(call, FIELD_1, false)).isOk()).toBe(true);
  });

  it('lists the capture devices OBS offers', async () => {
    await setSource({ type: 'capture' });
    const devices = await unwrap(listCameraDevices(call, 'Camera - Field 1 (Capture)', 'capture'));
    // Whatever cameras this computer has, perhaps none.
    for (const device of devices)
      expect(device).toEqual({ name: expect.any(String), value: expect.any(String) });
  });

  it('takes a thumbnail of a camera', async () => {
    await setSource({ type: 'capture' });
    expect(await unwrap(cameraThumbnail(call, FIELD_1.scene))).toMatch(/^data:image\/jpg;base64,/);
  });
});

describe('LAN cameras', () => {
  it('shows the picked camera computer and follows OBS port and password changes', async () => {
    await setSource({ type: 'lan' });
    await unwrap(setLanCameraSender(call, FIELD_1, 'Camera - Field 1 (LAN)', 'Pit Cam', LAN));
    expect(await status()).toMatchObject({ device: lanReceiverUrl('Field 1', 'Pit Cam', LAN) });

    const changed = { port: 4456, password: 'new' };
    expect(await unwrap(updateLanReceiver(call, FIELD_1, changed))).toBe(true);
    expect(await status()).toMatchObject({ device: lanReceiverUrl('Field 1', 'Pit Cam', changed) });
    expect(await unwrap(updateLanReceiver(call, FIELD_1, changed))).toBe(false);
  });

  it('only counts LAN camera receivers as LAN cameras', async () => {
    await unwrap(call('CreateInput', {
      sceneName: FIELD_1.scene, inputName: 'Switcher', inputKind: 'browser_source', inputSettings: { url: 'about:blank#switcher' },
    }));
    expect(await status()).toEqual({ state: 'custom', sources: ['Switcher'] });
    expect(await unwrap(updateLanReceiver(call, FIELD_1, LAN))).toBe(false);
  });
});
