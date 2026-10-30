// Messages LAN camera pages exchange to set up a WebRTC connection. A sender is the camera page on a
// computer near the camera, sending under the camera name typed there; a receiver is the page an OBS
// browser source loads for one camera slot (a "Camera - " scene), told by the dashboard which camera
// to show. The sender always makes the offer; the receiver answers. ICE candidates travel inside the
// offer and answer (gathering finishes before they are sent), which on a LAN takes well under a second.

export const LAN_CAMERA_APP = 'ftc-lan-camera';
export const LAN_CAMERA_VERSION = 2;

export type ReceiverState = 'waiting' | 'connecting' | 'live';

// stopped: the sender or receiver went away. replaced: another camera computer took over.
// busy: the receiver already shows another camera computer and kept it.
export type ByeReason = 'stopped' | 'replaced' | 'busy';

export type LanCameraPayload =
  // Sender started sending `camera`; receivers for it ask the sender for an offer.
  | { type: 'hello'; camera: string }
  // Sender is sending `camera`, repeated so the dashboard can list it.
  | { type: 'presence'; camera: string }
  // Dashboard asks every sender for its presence now. `camera` is empty.
  | { type: 'discover'; camera: string }
  // Receiver for `slot` has no stream and asks for an offer, from one sender or (without `to`) any sender.
  | { type: 'want'; camera: string; slot: string; to?: string }
  | { type: 'offer'; camera: string; to: string; sdp: string }
  | { type: 'answer'; camera: string; to: string; sdp: string }
  | { type: 'bye'; camera: string; to?: string; reason: ByeReason }
  // Receiver state, for the dashboard. `camera` is empty while the dashboard has picked none.
  | { type: 'status'; camera: string; slot: string; state: ReceiverState };

export type LanCameraMessage = LanCameraPayload & { app: typeof LAN_CAMERA_APP; v: number; from: string };

const TYPES: ReadonlySet<string> = new Set<LanCameraPayload['type']>(
  ['hello', 'presence', 'discover', 'want', 'offer', 'answer', 'bye', 'status']);

export const stampLanCameraMessage = (payload: LanCameraPayload, from: string): LanCameraMessage =>
  ({ ...payload, app: LAN_CAMERA_APP, v: LAN_CAMERA_VERSION, from });

// Custom events reach every obs-websocket client, so anything that is not ours is ignored.
export const parseLanCameraMessage = (data: unknown): LanCameraMessage | undefined => {
  if (typeof data !== 'object' || data === null) return undefined;
  const message = data as Record<string, unknown>;
  return message.app === LAN_CAMERA_APP && message.v === LAN_CAMERA_VERSION
    && typeof message.from === 'string' && typeof message.camera === 'string'
    && typeof message.type === 'string' && TYPES.has(message.type)
    ? message as unknown as LanCameraMessage
    : undefined;
};
