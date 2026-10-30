import OBSWebSocket, { EventSubscription } from 'obs-websocket-js';
import { ResultAsync } from 'neverthrow';
import { LAN_CAMERA_APP, LAN_CAMERA_VERSION, LanCameraMessage, parseLanCameraMessage } from './protocol';
import { SignalingChannel } from './signaling';

const isLocalHost = (host: string) => /^(localhost|127\.|\[?::1\]?$)/i.test(host.trim());

const describeConnectError = (host: string) => (error: unknown): string => {
  const code = (error as { code?: unknown })?.code;
  if (code === 4009)
    return 'OBS rejected the password. Check the password in OBS (Tools > WebSocket Server Settings).';
  // Browsers refuse ws:// from an https page unless the page is allowed insecure content.
  if (error instanceof DOMException && error.name === 'SecurityError')
    return 'The browser blocked the connection to OBS. Allow "Insecure content" for this site (click the icon left of the address, then Site settings).';
  if (!isLocalHost(host))
    return `Unable to reach OBS at ${host}. Check the address, that the OBS WebSocket server is on, that the OBS computer's firewall allows the port, that "Insecure content" is allowed for this site, and allow local network access if the browser asks.`;
  return 'Unable to reach OBS. Check that the OBS WebSocket server is on (Tools > WebSocket Server Settings).';
};

// Connects only to the General events, which carry the custom events signaling uses.
export const connectObs = (obs: OBSWebSocket, host: string, port: number, password: string): ResultAsync<void, string> =>
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
      obs.call('BroadcastCustomEvent', { eventData: { ...payload, app: LAN_CAMERA_APP, v: LAN_CAMERA_VERSION, from: peerId } }),
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
