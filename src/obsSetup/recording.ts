import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { ObsCall, delay } from './obsCall';

const isRecording = (call: ObsCall) => call('GetRecordStatus').map(({ outputActive }) => outputActive);

const waitForRecording = (call: ObsCall, deadline: number): ResultAsync<boolean, string> =>
  isRecording(call).andThen(active => active || Date.now() >= deadline
    ? okAsync(active)
    : delay(250).andThen(() => waitForRecording(call, deadline)));

// Starts recording and makes sure it did. OBS accepts StartRecord even when it cannot record (a
// recording path on a missing drive, or a folder it may not write to), then simply never starts,
// without an error or an event.
export const startRecording = (call: ObsCall, timeoutMs = 5000): ResultAsync<void, string> =>
  call('StartRecord')
    .mapErr(error => `OBS did not start recording: ${error}`)
    .andThen(() => waitForRecording(call, Date.now() + timeoutMs))
    .andThen(started => started
      ? okAsync(undefined)
      : call('GetRecordDirectory').andThen(({ recordDirectory }) => errAsync(
        `OBS did not start recording. Check that OBS can save recordings to ${recordDirectory} `
        + '(Settings > Output > Recording Path) and that the disk has space.')));
