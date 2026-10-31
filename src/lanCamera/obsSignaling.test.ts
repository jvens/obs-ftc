import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type OBSWebSocket from 'obs-websocket-js';
import { obsSignaling } from './obsSignaling';
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
