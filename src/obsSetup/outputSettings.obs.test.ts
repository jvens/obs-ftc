// The recommended settings against OBS: a FakeObs in the unit tests, the real OBS Studio in
// `npm run test:obs`. Each test starts in a new profile.
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { applyRecommendedSettings } from './outputSettings';
import { ObsCall } from './obsCall';
import { addSomethingToShow, closeObs, eventually, freshObs, queries, unwrap } from '../test/obsUnderTest';

let call: ObsCall;
let obs: ReturnType<typeof queries>;

beforeEach(async () => {
  ({ call } = await freshObs({ profile: true }));
  await addSomethingToShow(call);
  obs = queries(call);
});

afterAll(closeObs);

const apply = async () => {
  const log: string[] = [];
  const requests: string[] = [];
  const recorded = ((requestType: string, requestData?: unknown) => {
    requests.push(requestType);
    return (call as (type: string, data?: unknown) => ReturnType<ObsCall>)(requestType, requestData);
  }) as ObsCall;
  const result = await applyRecommendedSettings(recorded, line => log.push(line));
  return { result, log, requests };
};

const replayBufferActive = () => unwrap(call('GetReplayBufferStatus').map(({ outputActive }) => outputActive));

describe('applyRecommendedSettings', () => {
  it('sets up the profile for an event stream, with the replay buffer ready', async () => {
    const { currentProfileName } = await obs.profile();
    const [major, minor] = (await obs.version()).split('.').map(Number);

    const { result } = await apply();

    expect(result._unsafeUnwrap().changes.length).toBeGreaterThan(0);
    const parameters = {
      'Output.Mode': 'Simple',
      'SimpleOutput.VBitrate': '6000',
      'SimpleOutput.ABitrate': '160',
      'SimpleOutput.RecQuality': 'Stream',
      'SimpleOutput.RecFormat2': major > 30 || (major === 30 && minor >= 2) ? 'hybrid_mp4' : 'mkv',
      'SimpleOutput.RecRB': 'true',
      'Output.Reconnect': 'true',
    };
    for (const [key, value] of Object.entries(parameters)) {
      const [category, name] = key.split('.');
      expect([key, await obs.profileParameter(category, name)]).toEqual([key, value]);
    }
    expect(await obs.video()).toMatchObject({ baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080 });
    // OBS only builds the replay buffer when the profile loads, so this shows the reload worked.
    expect(await replayBufferActive()).toBe(false);
    expect(await obs.profile()).toMatchObject({ currentProfileName, profiles: expect.not.arrayContaining(['FTC Settings Reload (temporary)']) });
  });

  it('changes nothing the second time', async () => {
    await apply();
    const { result, requests } = await apply();
    expect(result._unsafeUnwrap().changes).toEqual([]);
    expect(requests.filter(type => /^(Set|Create|Remove|Stop|Start)/.test(type))).toEqual([]);
  });

  it('pauses a running replay buffer while it changes settings', async () => {
    await apply();
    await unwrap(call('StartReplayBuffer'));
    await eventually(replayBufferActive, 'the replay buffer to start');
    await unwrap(call('SetProfileParameter', { parameterCategory: 'SimpleOutput', parameterName: 'VBitrate', parameterValue: '2500' }));

    const { result, log } = await apply();

    expect(result._unsafeUnwrap().changes).toEqual(['Video bitrate: 2500 kbps → 6000 kbps']);
    expect(log).toEqual(['Stopping the replay buffer', 'Reloading the OBS profile so the new settings take effect', 'Restarting the replay buffer']);
    expect(await replayBufferActive()).toBe(true);
    await unwrap(call('StopReplayBuffer'));
    await eventually(async () => !(await replayBufferActive()), 'the replay buffer to stop');
  });

  it('refuses while recording', async () => {
    await unwrap(call('StartRecord'));
    try {
      await eventually(() => unwrap(call('GetRecordStatus').map(({ outputActive }) => outputActive)), 'recording to start');
      const { result, requests } = await apply();
      expect(result._unsafeUnwrapErr()).toBe('Stop streaming and recording before changing these settings.');
      expect(requests.filter(type => type.startsWith('Set'))).toEqual([]);
    } finally {
      await unwrap(call('StopRecord'));
      // OBS finishes the file in the background; the next test may want to record.
      await eventually(async () => !(await unwrap(call('GetRecordStatus').map(({ outputActive }) => outputActive))), 'recording to stop');
    }
  });
});
