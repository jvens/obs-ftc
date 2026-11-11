import { describe, expect, it } from '@jest/globals';
import { applyOutputSettings, applyRecommendedSettings, readOutputSettings } from './outputSettings';
import { FakeObs } from '../test/fakeObs';

const RECOMMENDED = {
  'Output.Mode': 'Simple',
  'SimpleOutput.VBitrate': '6000',
  'SimpleOutput.ABitrate': '160',
  'SimpleOutput.RecQuality': 'Stream',
  'SimpleOutput.RecFormat2': 'hybrid_mp4',
  'SimpleOutput.RecRB': 'true',
  'Output.Reconnect': 'true',
};

const apply = (obs: FakeObs) => {
  const log: string[] = [];
  return applyRecommendedSettings(obs.call, line => log.push(line)).map(report => ({ ...report, log }));
};

// An OBS already on the recommended settings, with the replay buffer running.
const recommendedObs = (options?: ConstructorParameters<typeof FakeObs>[0]) => {
  const obs = new FakeObs(options);
  for (const [key, value] of Object.entries(RECOMMENDED))
    obs.profileParameters().set(key, value);
  obs.replayBufferAvailable = true;
  obs.replayBufferActive = true;
  return obs;
};

describe('applyRecommendedSettings', () => {
  it('refuses while streaming or recording', async () => {
    const obs = new FakeObs();
    obs.recording = true;
    expect((await apply(obs))._unsafeUnwrapErr()).toMatch(/Stop streaming and recording/);
    expect(obs.requestTypes()).not.toContain('SetProfileParameter');
  });

  it('applies the recommended profile and reloads it so the replay buffer exists', async () => {
    const obs = new FakeObs();

    const report = (await apply(obs))._unsafeUnwrap();

    for (const [key, value] of Object.entries(RECOMMENDED)) {
      const [parameterCategory, parameterName] = key.split('.');
      expect([key, (await obs.call('GetProfileParameter', { parameterCategory, parameterName }))._unsafeUnwrap().parameterValue]).toEqual([key, value]);
    }
    expect(report.changes).toContain('Video bitrate: not set → 6000 kbps');
    expect(report.changes).toContain('Replay buffer: off → on');
    // A new profile is already in Simple output mode.
    expect(report.changes).not.toContainEqual(expect.stringMatching(/^Output mode/));
    expect(obs.replayBufferAvailable).toBe(true);
    expect(obs.currentProfile).toBe('Untitled');
    expect([...obs.profiles.keys()]).toEqual(['Untitled']);
  });

  it('changes nothing when OBS already has the recommended settings', async () => {
    const obs = recommendedObs();
    const report = (await apply(obs))._unsafeUnwrap();
    expect(report.changes).toEqual([]);
    expect(obs.requestTypes().filter(type => type.startsWith('Set') || type.startsWith('Stop'))).toEqual([]);
  });

  it('sets a 1080p30 canvas, pausing the replay buffer while it does', async () => {
    const obs = recommendedObs({ canvas: { width: 1280, height: 720 } });

    const report = (await apply(obs))._unsafeUnwrap();

    expect(report.changes).toEqual(['Resolution: 1280x720 → 1920x1080']);
    expect(obs.video).toMatchObject({ baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080 });
    expect(report.log).toEqual(['Stopping the replay buffer', 'Restarting the replay buffer']);
    expect(obs.replayBufferActive).toBe(true);
  });

  it('records to MKV on OBS older than 30.2', async () => {
    const obs = new FakeObs({ version: '30.1.2' });
    await apply(obs);
    expect(obs.profileParameters().get('SimpleOutput.RecFormat2')).toBe('mkv');
  });

  it('suggests a hardware encoder when the stream uses x264', async () => {
    const obs = recommendedObs();
    obs.profileParameters().set('SimpleOutput.StreamEncoder', 'x264');
    expect((await apply(obs))._unsafeUnwrap().notes).toEqual([expect.stringMatching(/hardware encoder/)]);
  });
});

describe('readOutputSettings', () => {
  it('shows each setting as OBS has it beside the recommendation', async () => {
    const obs = recommendedObs({ canvas: { width: 1280, height: 720 } });
    obs.profileParameters().set('SimpleOutput.VBitrate', '2500');

    const { rows } = (await readOutputSettings(obs.call))._unsafeUnwrap();

    expect(rows.find(row => row.id === 'resolution')).toEqual({ id: 'resolution', label: 'Resolution', current: '1280x720', recommended: '1920x1080', ok: false });
    expect(rows.find(row => row.id === 'frame-rate')).toMatchObject({ current: '30 fps', ok: true });
    expect(rows.find(row => row.id === 'video-bitrate')).toMatchObject({ current: '2500 kbps', recommended: '6000 kbps', ok: false });
    expect(rows.filter(row => !row.ok).map(row => row.id)).toEqual(['resolution', 'video-bitrate']);
  });
});

describe('applyOutputSettings', () => {
  it('changes only the settings asked for', async () => {
    const obs = recommendedObs({ canvas: { width: 1280, height: 720 } });
    obs.profileParameters().set('SimpleOutput.VBitrate', '2500');

    const report = (await applyOutputSettings(obs.call, ['video-bitrate'], () => {}))._unsafeUnwrap();

    expect(report.changes).toEqual(['Video bitrate: 2500 kbps → 6000 kbps']);
    expect(obs.profileParameters().get('SimpleOutput.VBitrate')).toBe('6000');
    expect(obs.video).toMatchObject({ baseWidth: 1280, baseHeight: 720 });
  });

  it('sets the frame rate without touching the resolution', async () => {
    const obs = recommendedObs({ canvas: { width: 1280, height: 720 } });
    obs.video = { ...obs.video, fpsNumerator: 60, fpsDenominator: 1 };

    const report = (await applyOutputSettings(obs.call, ['frame-rate'], () => {}))._unsafeUnwrap();

    expect(report.changes).toEqual(['Frame rate: 60 fps → 30 fps']);
    expect(obs.video).toMatchObject({ baseWidth: 1280, baseHeight: 720, fpsNumerator: 30, fpsDenominator: 1 });
  });
});
