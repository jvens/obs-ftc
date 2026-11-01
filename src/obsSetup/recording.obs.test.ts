// Starting a recording against OBS: a FakeObs in the unit tests, the real OBS Studio in
// `npm run test:obs`.
import { afterAll, afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ObsCall } from './obsCall';
import { startRecording } from './recording';
import { addSomethingToShow, closeObs, eventually, freshObs, setRecordDirectory, unwrap } from '../test/obsUnderTest';

let call: ObsCall;
let recordDirectory: string;

const recording = () => unwrap(call('GetRecordStatus').map(({ outputActive }) => outputActive));

beforeEach(async () => {
  ({ call } = await freshObs());
  await addSomethingToShow(call);
  ({ recordDirectory } = await unwrap(call('GetRecordDirectory')));
});

// The record directory belongs to the profile, which the real OBS tests share.
afterEach(async () => {
  if (await recording()) {
    await unwrap(call('StopRecord'));
    await eventually(async () => !(await recording()), 'recording to stop');
  }
  await unwrap(setRecordDirectory(call, recordDirectory));
});

afterAll(closeObs);

describe('startRecording', () => {
  it('starts recording', async () => {
    await unwrap(startRecording(call));
    expect(await recording()).toBe(true);
  });

  it('reports a recording OBS accepted but could not start', async () => {
    await unwrap(setRecordDirectory(call, 'Q:\\no such drive'));

    const result = await startRecording(call, 3000);

    expect(result._unsafeUnwrapErr()).toBe('OBS did not start recording. Check that OBS can save recordings to '
      + 'Q:\\no such drive (Settings > Output > Recording Path) and that the disk has space.');
    expect(await recording()).toBe(false);
  });

  it('reports OBS refusing to start', async () => {
    await unwrap(startRecording(call));
    expect((await startRecording(call))._unsafeUnwrapErr()).toMatch(/^OBS did not start recording: /);
  });
});
