import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { ObsCall, delay } from './obsCall';

// How long the replay buffer holds, which decides how much of each match its replay keeps. The
// setting lives in the OBS profile, under a different section in each output mode.

export type OutputMode = 'Simple' | 'Advanced';

const SECTION: Record<OutputMode, string> = { Simple: 'SimpleOutput', Advanced: 'AdvOut' };

export interface ReplayBufferLength {
  mode: OutputMode;
  seconds: number;
}

const profileValue = (call: ObsCall, parameterCategory: string, parameterName: string) =>
  call('GetProfileParameter', { parameterCategory, parameterName })
    .map(({ parameterValue, defaultParameterValue }) => parameterValue ?? defaultParameterValue);

export const getOutputMode = (call: ObsCall): ResultAsync<OutputMode, string> =>
  profileValue(call, 'Output', 'Mode').andThen(mode => mode === 'Simple' || mode === 'Advanced'
    ? okAsync<OutputMode, string>(mode)
    : errAsync('Could not detect OBS output mode'));

export const getReplayBufferLength = (call: ObsCall): ResultAsync<ReplayBufferLength, string> =>
  getOutputMode(call).andThen(mode => profileValue(call, SECTION[mode], 'RecRBTime').andThen(value => {
    const seconds = parseInt(value ?? '', 10);
    return Number.isNaN(seconds)
      ? errAsync<ReplayBufferLength, string>('Could not read replay buffer length from OBS profile')
      : okAsync({ mode, seconds });
  }));

const replayBufferActive = (call: ObsCall) =>
  call('GetReplayBufferStatus').map(({ outputActive }) => outputActive)
    // Fails when the replay buffer is turned off in the profile.
    .orElse(() => okAsync<boolean, string>(false));

const waitUntilStopped = (call: ObsCall, attempts = 40): ResultAsync<void, string> =>
  replayBufferActive(call).andThen(active => !active ? okAsync(undefined)
    : attempts <= 0 ? errAsync('Timed out waiting for the OBS replay buffer to stop')
    : delay(100).andThen(() => waitUntilStopped(call, attempts - 1)));

// A running replay buffer only picks the new length up when it starts again, so it is restarted.
export const setReplayBufferLength = (call: ObsCall, seconds: number): ResultAsync<ReplayBufferLength, string> =>
  getOutputMode(call)
    .andThen(mode => call('SetProfileParameter', { parameterCategory: SECTION[mode], parameterName: 'RecRBTime', parameterValue: String(seconds) })
      .map(() => ({ mode, seconds })))
    .andThen(length => replayBufferActive(call).andThen(active => active
      ? call('StopReplayBuffer')
        .andThen(() => waitUntilStopped(call))
        .andThen(() => call('StartReplayBuffer'))
        .map(() => length)
      : okAsync(length)));
