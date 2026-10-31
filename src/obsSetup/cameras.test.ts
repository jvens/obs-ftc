import { describe, expect, it } from '@jest/globals';
import { getCameraStatus, listCameraDevices, setCameraAudioMuted, setCameraSource, setLanCameraSender, updateLanReceiver } from './cameras';
import { PlannedCamera } from './layout';
import { lanReceiverUrl } from '../lanCamera/urls';
import { FakeObs } from '../test/fakeObs';

const FIELD_1: PlannedCamera = { label: 'Field 1', scene: 'Camera - Field 1' };
const CEREMONY: PlannedCamera = { label: 'Ceremony', scene: 'Camera - Ceremony' };
const LAN = { port: 4455, password: 'pw' };

const withCameraScenes = (options?: ConstructorParameters<typeof FakeObs>[0]) => {
  const obs = new FakeObs(options);
  obs.addScene(CEREMONY.scene);
  obs.addScene(FIELD_1.scene);
  return obs;
};

describe('getCameraStatus', () => {
  it('reports a missing camera scene', async () => {
    expect((await getCameraStatus(new FakeObs().call, FIELD_1))._unsafeUnwrap()).toEqual({ state: 'missing' });
  });

  it('reports the device of a capture camera', async () => {
    const obs = withCameraScenes();
    obs.addInput(FIELD_1.scene, 'Camera - Field 1 (Capture)', 'dshow_input', { video_device_id: 'cam:1' });
    expect((await getCameraStatus(obs.call, FIELD_1))._unsafeUnwrap())
      .toEqual({ state: 'input', type: 'capture', inputName: 'Camera - Field 1 (Capture)', device: 'cam:1' });
  });

  it('reports a camera that shows another camera', async () => {
    const obs = withCameraScenes();
    obs.addItem(FIELD_1.scene, CEREMONY.scene);
    expect((await getCameraStatus(obs.call, FIELD_1))._unsafeUnwrap()).toEqual({ state: 'shared', scene: CEREMONY.scene });
  });

  it('reports a LAN camera receiver as a LAN camera', async () => {
    const obs = withCameraScenes();
    const url = lanReceiverUrl('Field 1', 'Pit Cam', LAN);
    obs.addInput(FIELD_1.scene, 'Camera - Field 1 (LAN)', 'browser_source', { url });
    expect((await getCameraStatus(obs.call, FIELD_1))._unsafeUnwrap())
      .toEqual({ state: 'input', type: 'lan', inputName: 'Camera - Field 1 (LAN)', device: url });
  });

  it('leaves any other browser source to the user', async () => {
    const obs = withCameraScenes();
    obs.addInput(FIELD_1.scene, 'Switcher', 'browser_source', { url: 'https://example.com/switcher' });
    expect((await getCameraStatus(obs.call, FIELD_1))._unsafeUnwrap()).toEqual({ state: 'custom', sources: ['Switcher'] });
  });

  it('leaves a scene with more than one source to the user', async () => {
    const obs = withCameraScenes();
    obs.addInput(FIELD_1.scene, 'Camera - Field 1 (Capture)', 'dshow_input');
    obs.addInput(FIELD_1.scene, 'Label', 'text_gdiplus_v3');
    expect((await getCameraStatus(obs.call, FIELD_1))._unsafeUnwrap())
      .toEqual({ state: 'custom', sources: ['Camera - Field 1 (Capture)', 'Label'] });
  });
});

describe('setCameraSource', () => {
  it('replaces a capture camera with a LAN camera receiver filling the canvas', async () => {
    const obs = withCameraScenes({ canvas: { width: 1280, height: 720 } });
    obs.addInput(FIELD_1.scene, 'Camera - Field 1 (Capture)', 'dshow_input');

    expect((await setCameraSource(obs.call, FIELD_1, { type: 'lan' }, true, LAN)).isOk()).toBe(true);

    expect(obs.sources(FIELD_1.scene)).toEqual(['Camera - Field 1 (LAN)']);
    expect(obs.inputs.has('Camera - Field 1 (Capture)')).toBe(false);
    const input = obs.inputs.get('Camera - Field 1 (LAN)')!;
    expect(input).toMatchObject({ kind: 'browser_source', muted: true });
    expect(input.settings).toMatchObject({ url: lanReceiverUrl('Field 1', '', LAN), reroute_audio: true, shutdown: false });
    expect(obs.item(FIELD_1.scene, 'Camera - Field 1 (LAN)')!.transform).toMatchObject({ boundsWidth: 1280, boundsHeight: 720 });
  });

  it('shares another camera, keeping the user\'s other sources', async () => {
    const obs = withCameraScenes();
    obs.addInput(FIELD_1.scene, 'Camera - Field 1 (NDI)', 'ndi_source');
    obs.addInput(FIELD_1.scene, 'Label', 'text_gdiplus_v3');

    expect((await setCameraSource(obs.call, FIELD_1, { type: 'shared', scene: CEREMONY.scene }, false, LAN)).isOk()).toBe(true);

    expect(obs.sources(FIELD_1.scene)).toEqual([CEREMONY.scene, 'Label']);
    expect(obs.inputs.has('Camera - Field 1 (NDI)')).toBe(false);
  });

  it('waits for OBS to finish removing an input before reusing its name', async () => {
    const obs = withCameraScenes({ removalLag: 2 });
    obs.addInput(FIELD_1.scene, 'Camera - Field 1 (Capture)', 'dshow_input', { video_device_id: 'cam:1' });

    const result = await setCameraSource(obs.call, FIELD_1, { type: 'capture' }, false, LAN);

    expect(result.isOk()).toBe(true);
    expect(obs.sources(FIELD_1.scene)).toEqual(['Camera - Field 1 (Capture)']);
    // A fresh input, with the default settings rather than the old device.
    expect(obs.inputs.get('Camera - Field 1 (Capture)')!.settings).toEqual({ deactivate_when_not_showing: false });
  });
});

describe('LAN cameras', () => {
  it('shows the picked camera computer', async () => {
    const obs = withCameraScenes();
    await setCameraSource(obs.call, FIELD_1, { type: 'lan' }, true, LAN);
    await setLanCameraSender(obs.call, FIELD_1, 'Camera - Field 1 (LAN)', 'Pit Cam', LAN);
    expect(obs.inputs.get('Camera - Field 1 (LAN)')!.settings.url).toBe(lanReceiverUrl('Field 1', 'Pit Cam', LAN));
  });

  it('updates the receiver for a new OBS password, keeping the camera computer', async () => {
    const obs = withCameraScenes();
    await setCameraSource(obs.call, FIELD_1, { type: 'lan' }, true, LAN);
    await setLanCameraSender(obs.call, FIELD_1, 'Camera - Field 1 (LAN)', 'Pit Cam', LAN);
    const changed = { port: 4456, password: 'new' };

    expect((await updateLanReceiver(obs.call, FIELD_1, changed))._unsafeUnwrap()).toBe(true);
    expect(obs.inputs.get('Camera - Field 1 (LAN)')!.settings.url).toBe(lanReceiverUrl('Field 1', 'Pit Cam', changed));
    expect((await updateLanReceiver(obs.call, FIELD_1, changed))._unsafeUnwrap()).toBe(false);
  });

  it('leaves other cameras alone', async () => {
    const obs = withCameraScenes();
    obs.addInput(FIELD_1.scene, 'Camera - Field 1 (Capture)', 'dshow_input');
    expect((await updateLanReceiver(obs.call, FIELD_1, LAN))._unsafeUnwrap()).toBe(false);
  });

  it('lists no devices, since the dashboard hears about camera computers itself', async () => {
    const obs = withCameraScenes();
    expect((await listCameraDevices(obs.call, 'anything', 'lan'))._unsafeUnwrap()).toEqual([]);
    expect(obs.calls).toHaveLength(0);
  });
});

describe('setCameraAudioMuted', () => {
  it('mutes the camera input and nothing else in the scene', async () => {
    const obs = withCameraScenes();
    obs.addInput(FIELD_1.scene, 'Camera - Field 1 (Capture)', 'dshow_input');
    obs.addInput(FIELD_1.scene, 'Music', 'ffmpeg_source');

    await setCameraAudioMuted(obs.call, FIELD_1, true);

    expect(obs.inputs.get('Camera - Field 1 (Capture)')!.muted).toBe(true);
    expect(obs.inputs.get('Music')!.muted).toBe(false);
  });
});
