import { describe, expect, it } from '@jest/globals';
import { errAsync, okAsync } from 'neverthrow';
import { ignoreError, listPropertyItems, sequence, transformFor, waitForInputsRemoved } from './obsCall';
import { FakeObs } from '../test/fakeObs';

describe('transformFor', () => {
  it('scales the 1920x1080 layout to a smaller canvas', () => {
    expect(transformFor({ x: 119, y: 357, width: 912, height: 513 }, 'contain', { width: 1280, height: 720 })).toMatchObject({
      positionX: 119 * 2 / 3,
      positionY: 357 * 2 / 3,
      boundsWidth: 608,
      boundsHeight: 342,
      boundsType: 'OBS_BOUNDS_SCALE_INNER',
      cropToBounds: false,
    });
  });

  it('crops to the bounds when covering', () => {
    expect(transformFor({ x: 0, y: 0, width: 1920, height: 1080 }, 'cover', { width: 1920, height: 1080 }))
      .toMatchObject({ boundsType: 'OBS_BOUNDS_SCALE_OUTER', cropToBounds: true });
  });
});

describe('sequence', () => {
  it('runs the steps in order and stops at the first error', async () => {
    const ran: number[] = [];
    const result = await sequence([1, 2, 3], item => {
      ran.push(item);
      return item === 2 ? errAsync('two failed') : okAsync(item);
    });
    expect(result._unsafeUnwrapErr()).toBe('two failed');
    expect(ran).toEqual([1, 2]);
  });
});

describe('ignoreError', () => {
  it('turns an error into success', async () => {
    expect((await ignoreError(errAsync('gone'))).isOk()).toBe(true);
  });
});

describe('waitForInputsRemoved', () => {
  it('waits until OBS stops listing the removed inputs', async () => {
    const obs = new FakeObs({ removalLag: 2 });
    obs.addInput('Scene', 'Camera', 'dshow_input');
    await obs.call('RemoveInput', { inputName: 'Camera' });
    expect((await waitForInputsRemoved(obs.call, ['Camera'])).isOk()).toBe(true);
    expect(obs.requestTypes().filter(type => type === 'GetInputList')).toHaveLength(3);
  });

  it('gives up after the last attempt', async () => {
    const obs = new FakeObs({ removalLag: 10 });
    obs.addInput('Scene', 'Camera', 'dshow_input');
    await obs.call('RemoveInput', { inputName: 'Camera' });
    expect((await waitForInputsRemoved(obs.call, ['Camera'], 1))._unsafeUnwrapErr()).toMatch(/"Camera"/);
  });
});

describe('listPropertyItems', () => {
  it('lists the enabled choices', async () => {
    const obs = new FakeObs({
      propertyItems: {
        dshow_input: {
          video_device_id: [
            { itemName: 'Webcam', itemValue: 'cam:1' },
            { itemName: 'Unplugged', itemValue: 'cam:2', itemEnabled: false },
          ],
        },
      },
    });
    obs.addInput('Scene', 'Camera', 'dshow_input');
    expect((await listPropertyItems(obs.call, 'Camera', 'video_device_id'))._unsafeUnwrap())
      .toEqual([{ name: 'Webcam', value: 'cam:1' }]);
  });
});
