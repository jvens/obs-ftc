import { ResultAsync } from 'neverthrow';

// Both computers are on the same network, so host candidates are all that is needed: no STUN or
// TURN servers, and nothing leaves the LAN.
export const RTC_CONFIG: RTCConfiguration = { iceServers: [] };

const GATHER_TIMEOUT_MS = 3000;

const describe = (what: string) => (error: unknown) => `${what}: ${error instanceof Error ? error.message : String(error)}`;

export const rtc = <T>(promise: Promise<T>, what: string): ResultAsync<T, string> =>
  ResultAsync.fromPromise(promise, describe(what));

// Signaling sends the whole description at once, so wait for every local candidate to be in it.
const iceGathered = (pc: RTCPeerConnection) => ResultAsync.fromSafePromise<void, string>(new Promise(resolve => {
  if (pc.iceGatheringState === 'complete') return resolve();
  const done = () => {
    clearTimeout(timer);
    pc.removeEventListener('icegatheringstatechange', onChange);
    resolve();
  };
  const onChange = () => { if (pc.iceGatheringState === 'complete') done(); };
  const timer = setTimeout(done, GATHER_TIMEOUT_MS);
  pc.addEventListener('icegatheringstatechange', onChange);
}));

// Sets the local description and returns its SDP with the gathered candidates.
export const setLocalAndGather = (pc: RTCPeerConnection, description: RTCSessionDescriptionInit, what: string) =>
  rtc(pc.setLocalDescription(description), what)
    .andThen(() => iceGathered(pc))
    .map(() => pc.localDescription?.sdp ?? '');
