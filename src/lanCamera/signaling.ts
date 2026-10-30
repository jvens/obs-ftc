import { ResultAsync } from 'neverthrow';
import { LanCameraMessage, LanCameraPayload } from './protocol';

// How LAN camera pages reach each other to set up a connection. The video itself goes directly
// between the two computers; this only carries the few messages that set it up. The OBS WebSocket
// is the transport today (obsSignaling.ts); anything that can pass small JSON messages between the
// pages, such as a cloud relay, can take its place.
export interface SignalingChannel {
  // Unique to this page; other pages address it with `to`.
  readonly peerId: string;
  send: (payload: LanCameraPayload) => ResultAsync<void, string>;
  // Delivers messages from other pages that are broadcast or addressed to this one.
  subscribe: (handler: (message: LanCameraMessage) => void) => () => void;
}
