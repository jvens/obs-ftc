// The replay buffer length against OBS: a FakeObs in the unit tests, the real OBS Studio in
// `npm run test:obs`. Each test starts in a new profile.
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ObsCall } from './obsCall';
import { applyRecommendedSettings } from './outputSettings';
import { getReplayBufferLength, setReplayBufferLength } from './replayBuffer';
import { addSomethingToShow, closeObs, eventually, freshObs, unwrap } from '../test/obsUnderTest';

let call: ObsCall;

beforeEach(async () => {
  ({ call } = await freshObs({ profile: true }));
});

afterAll(closeObs);

const replayBufferActive = () => unwrap(call('GetReplayBufferStatus').map(({ outputActive }) => outputActive));
// What the running replay buffer holds, as OBS reports it.
const runningLength = () => unwrap(call('GetOutputList')
  .map(({ outputs }) => String(outputs.find(output => output.outputKind === 'replay_buffer')?.outputName))
  .andThen(outputName => call('GetOutputSettings', { outputName }))
  .map(({ outputSettings }) => outputSettings.max_time_sec));

describe('replay buffer length', () => {
  it('reads OBS\'s 20 s default in a new profile', async () => {
    expect(await unwrap(getReplayBufferLength(call))).toEqual({ mode: 'Simple', seconds: 20 });
  });

  it('changes the length in Simple output mode', async () => {
    await unwrap(setReplayBufferLength(call, 190));
    expect(await unwrap(getReplayBufferLength(call))).toEqual({ mode: 'Simple', seconds: 190 });
  });

  it('changes the length in Advanced output mode', async () => {
    await unwrap(call('SetProfileParameter', { parameterCategory: 'Output', parameterName: 'Mode', parameterValue: 'Advanced' }));
    await unwrap(setReplayBufferLength(call, 200));
    expect(await unwrap(getReplayBufferLength(call))).toEqual({ mode: 'Advanced', seconds: 200 });
    const simple = await unwrap(call('GetProfileParameter', { parameterCategory: 'SimpleOutput', parameterName: 'RecRBTime' }));
    expect(simple.parameterValue).toBe('20');
  });

  it('restarts a running replay buffer so it holds the new length', async () => {
    await unwrap(applyRecommendedSettings(call, () => {}));
    await addSomethingToShow(call);
    await unwrap(call('StartReplayBuffer'));
    await eventually(replayBufferActive, 'the replay buffer to start');
    expect(await runningLength()).toBe(20);

    await unwrap(setReplayBufferLength(call, 190));

    await eventually(replayBufferActive, 'the replay buffer to start again');
    expect(await runningLength()).toBe(190);
    await unwrap(call('StopReplayBuffer'));
    await eventually(async () => !(await replayBufferActive()), 'the replay buffer to stop');
  });

  it('leaves a stopped replay buffer stopped', async () => {
    await unwrap(applyRecommendedSettings(call, () => {}));
    await unwrap(setReplayBufferLength(call, 190));
    expect(await replayBufferActive()).toBe(false);
  });
});
