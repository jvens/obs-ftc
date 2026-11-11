import OBSWebSocket, { EventSubscription } from 'obs-websocket-js';
import { ResultAsync } from 'neverthrow';
import { LanCameraMessage, parseLanCameraMessage, stampLanCameraMessage } from './protocol';
import { SignalingChannel } from './signaling';
import { hostKind } from '../helpers/browserNetwork';

export interface ObsConnectError {
  message: string;
  // OBS was not reached at all, which the browser may have blocked (as opposed to a wrong password).
  unreachable: boolean;
}

export const describeConnectError = (host: string) => (error: unknown): ObsConnectError => {
  const code = (error as { code?: unknown })?.code;
  if (code === 4009)
    return { unreachable: false, message: 'OBS rejected the password. Check the password in OBS (Tools > WebSocket Server Settings).' };
  // Some browsers refuse ws:// from an https page by throwing rather than failing to connect.
  if (error instanceof DOMException && error.name === 'SecurityError')
    return { unreachable: true, message: 'The browser blocked the connection to OBS.' };
  if (hostKind(host) !== 'loopback')
    return { unreachable: true, message: `Unable to reach OBS at ${host}. Check the address, that the OBS WebSocket server is on, and that the OBS computer's firewall allows the port.` };
  return { unreachable: true, message: 'Unable to reach OBS. Check that the OBS WebSocket server is on (Tools > WebSocket Server Settings).' };
};

// Connects only to the General events, which carry the custom events signaling uses.
export const connectObs = (obs: OBSWebSocket, host: string, port: number, password: string): ResultAsync<void, ObsConnectError> =>
  ResultAsync.fromPromise(
    obs.connect(`ws://${host.trim()}:${port}`, password || undefined, { eventSubscriptions: EventSubscription.General }),
    describeConnectError(host)
  ).map(() => undefined);

// Signaling over the OBS WebSocket: every message is a BroadcastCustomEvent, which OBS hands to every
// other connected client. OBS is already on the event network and every camera page has to reach it
// anyway, so nothing else needs hosting.
export const obsSignaling = (obs: OBSWebSocket): SignalingChannel => {
  const peerId = crypto.randomUUID();
  return {
    peerId,
    send: payload => ResultAsync.fromPromise(
      obs.call('BroadcastCustomEvent', { eventData: { ...stampLanCameraMessage(payload, peerId) } }),
      error => `Unable to send to OBS: ${error instanceof Error ? error.message : String(error)}`
    ).map(() => undefined),
    subscribe: handler => {
      // OBS delivers the broadcast data itself as the event, not inside `eventData` as the
      // obs-websocket-js types say.
      const onCustomEvent = (eventData: unknown) => {
        const message: LanCameraMessage | undefined = parseLanCameraMessage(eventData);
        if (message && message.from !== peerId && (!('to' in message) || message.to === undefined || message.to === peerId))
          handler(message);
      };
      obs.on('CustomEvent', onCustomEvent);
      return () => { obs.off('CustomEvent', onCustomEvent); };
    },
  };
};
