import { describe, expect, it } from '@jest/globals';
import { SOURCE_NAMES, SetupOptions, buildPlan, cameraInputName, overlayUrl, plannedCameras } from './layout';

const options = (overrides: Partial<SetupOptions> = {}): SetupOptions => ({
  ftcHost: '192.168.1.5',
  eventCode: 'usmnrq1',
  fieldCount: 2,
  audioMode: 'device',
  overlaySounds: true,
  safeBackgroundUrl: 'https://example.com/bg.png',
  lowerThirdUrl: 'https://obs.example.com/lower-third.html',
  lanReceiver: { port: 4455, password: '' },
  ...overrides,
});

describe('buildPlan', () => {
  it('has a program scene per field, then ceremony, alliance selection, pit and sponsor', () => {
    expect(buildPlan(options({ fieldCount: 3 }), 'windows').scenes.map(scene => scene.name))
      .toEqual(['Field 1', 'Field 2', 'Field 3', 'Ceremony', 'Alliance Selection', 'Pit Display', 'Sponsor Loop']);
  });

  it('plans one field when the event reports none', () => {
    const plan = buildPlan(options({ fieldCount: 0 }), 'windows');
    expect(plan.scenes.filter(scene => scene.name.startsWith('Field'))).toHaveLength(1);
    expect(plan.cameras.map(camera => camera.label)).toEqual(['Field 1', 'Ceremony']);
  });

  it('puts the overlay over the field camera, with the safe background and audio at the bottom', () => {
    const field = buildPlan(options(), 'windows').scenes.find(scene => scene.name === 'Field 2')!;
    expect(field.items.map(item => item.source))
      .toEqual([SOURCE_NAMES.overlay, 'Camera - Field 2', SOURCE_NAMES.safeBackground, SOURCE_NAMES.audio]);
  });

  it('leaves the audio device out unless the audio comes from a device', () => {
    const plan = buildPlan(options({ audioMode: 'camera' }), 'windows');
    expect(plan.inputs.map(input => input.name)).not.toContain(SOURCE_NAMES.audio);
    expect(plan.scenes.flatMap(scene => scene.items).map(item => item.source)).not.toContain(SOURCE_NAMES.audio);
  });

  it('keeps the user\'s choice of audio device once it exists', () => {
    expect(buildPlan(options(), 'windows').inputs.find(input => input.name === SOURCE_NAMES.audio)?.keepExistingSettings).toBe(true);
  });

  it('crops the ceremony camera into the alliance selection window', () => {
    const scene = buildPlan(options(), 'windows').scenes.find(scene => scene.name === 'Alliance Selection')!;
    expect(scene.items.find(item => item.source === 'Camera - Ceremony'))
      .toEqual({ source: 'Camera - Ceremony', rect: { x: 119, y: 357, width: 912, height: 513 }, fit: 'cover' });
  });

  it('points the browser sources at the event on the FTC Live server', () => {
    const urls = Object.fromEntries(buildPlan(options(), 'windows').inputs.map(input => [input.name, input.settings.url]));
    expect(urls[SOURCE_NAMES.pit]).toBe('http://192.168.1.5/event/usmnrq1/display/?type=pit');
    expect(urls[SOURCE_NAMES.sponsor]).toBe('http://192.168.1.5/event/usmnrq1/display/?type=sponsor');
    expect(urls[SOURCE_NAMES.overlay]).toMatch(/^http:\/\/192\.168\.1\.5\/event\/usmnrq1\/display\/\?type=audience&/);
    expect(urls[SOURCE_NAMES.lowerThird]).toBe('https://obs.example.com/lower-third.html');
  });
});

describe('overlayUrl', () => {
  it('mutes the overlay when its sounds are off', () => {
    expect(new URL(overlayUrl('h', 'e', false)).searchParams.get('mute')).toBe('true');
    expect(new URL(overlayUrl('h', 'e', true)).searchParams.get('mute')).toBe('false');
  });
});

describe('camera names', () => {
  it('names each camera scene and its input after the camera', () => {
    expect(plannedCameras(1)).toEqual([
      { label: 'Field 1', scene: 'Camera - Field 1' },
      { label: 'Ceremony', scene: 'Camera - Ceremony' },
    ]);
    expect(cameraInputName('Field 1', 'capture')).toBe('Camera - Field 1 (Capture)');
    expect(cameraInputName('Ceremony', 'ndi')).toBe('Camera - Ceremony (NDI)');
    expect(cameraInputName('Ceremony', 'lan')).toBe('Camera - Ceremony (LAN)');
  });
});
