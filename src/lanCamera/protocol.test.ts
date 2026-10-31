import { describe, expect, it } from '@jest/globals';
import { LAN_CAMERA_APP, LAN_CAMERA_VERSION, parseLanCameraMessage, stampLanCameraMessage } from './protocol';

describe('LAN camera messages', () => {
  it('reads back a stamped message', () => {
    const message = stampLanCameraMessage({ type: 'want', camera: 'Pit Cam', slot: 'Field 1' }, 'peer-1');
    expect(message).toEqual({ type: 'want', camera: 'Pit Cam', slot: 'Field 1', app: LAN_CAMERA_APP, v: LAN_CAMERA_VERSION, from: 'peer-1' });
    expect(parseLanCameraMessage(message)).toEqual(message);
  });

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['another app\'s custom event', { app: 'other', v: LAN_CAMERA_VERSION, from: 'a', camera: 'c', type: 'hello' }],
    ['an older version', { app: LAN_CAMERA_APP, v: 1, from: 'a', camera: 'c', type: 'hello' }],
    ['an unknown type', { app: LAN_CAMERA_APP, v: LAN_CAMERA_VERSION, from: 'a', camera: 'c', type: 'reboot' }],
    ['no sender', { app: LAN_CAMERA_APP, v: LAN_CAMERA_VERSION, camera: 'c', type: 'hello' }],
    ['no camera', { app: LAN_CAMERA_APP, v: LAN_CAMERA_VERSION, from: 'a', type: 'hello' }],
  ])('ignores %s', (_, data) => {
    expect(parseLanCameraMessage(data)).toBeUndefined();
  });
});
