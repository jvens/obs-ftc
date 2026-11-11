import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type OBSWebSocket from 'obs-websocket-js';
import { describeConnectError, obsSignaling } from './obsSignaling';
import { LanCameraMessage, stampLanCameraMessage } from './protocol';

// Stands in for obs-websocket-js: BroadcastCustomEvent reaches every other client as a CustomEvent.
const fakeObs = () => {
  const events = new EventEmitter();
  const call = jest.fn(async (_requestType: string, _requestData?: unknown) => ({}));
  const obs = { on: events.on.bind(events), off: events.off.bind(events), call } as unknown as OBSWebSocket;
  return { obs, call, deliver: (data: unknown) => events.emit('CustomEvent', data) };
};

describe('obsSignaling', () => {
  it('broadcasts stamped messages', async () => {
    const { obs, call } = fakeObs();
    const channel = obsSignaling(obs);
    await channel.send({ type: 'hello', camera: 'Pit Cam' });
    expect(call).toHaveBeenCalledWith('BroadcastCustomEvent', { eventData: stampLanCameraMessage({ type: 'hello', camera: 'Pit Cam' }, channel.peerId) });
  });

  it('delivers broadcasts and messages to this page, and nothing else', () => {
    const { obs, deliver } = fakeObs();
    const channel = obsSignaling(obs);
    const received: LanCameraMessage[] = [];
    const unsubscribe = channel.subscribe(message => received.push(message));

    const broadcast = stampLanCameraMessage({ type: 'hello', camera: 'c' }, 'other');
    const toMe = stampLanCameraMessage({ type: 'bye', camera: 'c', to: channel.peerId, reason: 'busy' }, 'other');
    deliver(broadcast);
    deliver(toMe);
    deliver(stampLanCameraMessage({ type: 'bye', camera: 'c', to: 'someone-else', reason: 'busy' }, 'other'));
    deliver(stampLanCameraMessage({ type: 'hello', camera: 'c' }, channel.peerId));
    deliver({ app: 'another-app' });
    unsubscribe();
    deliver(broadcast);

    expect(received).toEqual([broadcast, toMe]);
  });

  it('reports a failed send', async () => {
    const { obs, call } = fakeObs();
    call.mockRejectedValueOnce(new Error('Not connected'));
    expect((await obsSignaling(obs).send({ type: 'discover', camera: '' }))._unsafeUnwrapErr()).toBe('Unable to send to OBS: Not connected');
  });
});

describe('describeConnectError', () => {
  it('tells a wrong password apart from OBS being unreachable', () => {
    expect(describeConnectError('192.168.1.10')({ code: 4009 })).toEqual({
      unreachable: false,
      message: 'OBS rejected the password. Check the password in OBS (Tools > WebSocket Server Settings).',
    });
    expect(describeConnectError('192.168.1.10')({ code: 1006 })).toEqual({
      unreachable: true,
      message: 'Unable to reach OBS at 192.168.1.10. Check the address, that the OBS WebSocket server is on, and that the OBS computer\'s firewall allows the port.',
    });
    expect(describeConnectError('localhost')({ code: 1006 }).message).toBe('Unable to reach OBS. Check that the OBS WebSocket server is on (Tools > WebSocket Server Settings).');
    expect(describeConnectError('192.168.1.10')(new DOMException('insecure', 'SecurityError'))).toEqual({
      unreachable: true,
      message: 'The browser blocked the connection to OBS.',
    });
  });
});
