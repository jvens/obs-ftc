import { okAsync } from 'neverthrow';
import { LanCameraMessage, ReceiverState } from './protocol';
import { RTC_CONFIG, rtc, setLocalAndGather } from './rtc';
import { SignalingChannel } from './signaling';

const WANT_INTERVAL_MS = 3000;
const STATUS_INTERVAL_MS = 5000;
// Give up on a connection that has not come up, or has dropped, for this long and ask again.
const STALL_MS = 10000;

export interface CameraReceiverOptions {
  // The camera to show, as named on its camera page.
  camera: string;
  // The camera slot (scene) this receiver is in, for the camera page and the dashboard.
  slot: string;
  onStream: (stream: MediaStream | undefined) => void;
  onState: (state: ReceiverState) => void;
}

export interface CameraReceiver {
  stop: () => void;
}

interface Current {
  senderId: string;
  pc: RTCPeerConnection;
  // When the connection last stopped making progress; undefined while live.
  stalledSince: number | undefined;
}

// Shows one camera. Keeps asking for it until a sender connects, and again whenever the sender goes
// away. One sender at a time: a sender that starts later takes over (it says hello), but when two
// answer the same request the first one stays and the other stands by.
export const startCameraReceiver = (channel: SignalingChannel, options: CameraReceiverOptions): CameraReceiver => {
  const { camera, slot } = options;
  let current: Current | undefined;
  // The sender that most recently started for this camera; its offer replaces the current one.
  let preferred: string | undefined;

  const state = (): ReceiverState => !current ? 'waiting' : current.stalledSince === undefined ? 'live' : 'connecting';

  let lastState: ReceiverState | undefined;
  const sendStatus = () => channel.send({ type: 'status', camera, slot, state: state() });
  const report = () => {
    if (state() === lastState) return;
    lastState = state();
    options.onState(state());
    sendStatus();
  };

  const want = (to?: string) => channel.send({ type: 'want', camera, slot, to });

  const close = () => {
    if (!current) return;
    current.pc.close();
    current = undefined;
    options.onStream(undefined);
    report();
  };

  const accept = (senderId: string, sdp: string) => {
    if (current && current.senderId !== senderId)
      channel.send({ type: 'bye', camera, to: current.senderId, reason: 'replaced' });
    close();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const mine: Current = { senderId, pc, stalledSince: Date.now() };
    current = mine;
    pc.addEventListener('track', event => {
      if (current === mine) options.onStream(event.streams[0] ?? new MediaStream([event.track]));
    });
    pc.addEventListener('connectionstatechange', () => {
      if (current !== mine) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        close();
        want();
        return;
      }
      if (pc.connectionState === 'connected') mine.stalledSince = undefined;
      else if (mine.stalledSince === undefined) mine.stalledSince = Date.now();
      report();
    });
    report();
    rtc(pc.setRemoteDescription({ type: 'offer', sdp }), 'Unable to accept the offer')
      .andThen(() => rtc(pc.createAnswer(), 'Unable to create an answer'))
      .andThen(description => setLocalAndGather(pc, description, 'Unable to set up the connection'))
      .andThen(answer => current === mine ? channel.send({ type: 'answer', camera, to: senderId, sdp: answer }) : okAsync<void, string>(undefined))
      .mapErr(error => {
        console.error(error);
        if (current === mine) close();
      });
  };

  const onMessage = (message: LanCameraMessage) => {
    if (message.camera !== camera) return;
    if (message.type === 'hello') {
      preferred = message.from;
      if (current?.senderId !== message.from) want(message.from);
    } else if (message.type === 'offer') {
      if (current && current.senderId !== message.from && message.from !== preferred)
        channel.send({ type: 'bye', camera, to: message.from, reason: 'busy' });
      else
        accept(message.from, message.sdp);
    } else if (message.type === 'bye' && message.from === current?.senderId) {
      if (preferred === message.from) preferred = undefined;
      close();
      want();
    }
  };

  const unsubscribe = channel.subscribe(onMessage);
  report();
  want();

  const timers = [
    setInterval(() => {
      if (current?.stalledSince !== undefined && Date.now() - current.stalledSince > STALL_MS) close();
      if (!current) want();
    }, WANT_INTERVAL_MS),
    // Repeated so a dashboard that connects later learns the state too.
    setInterval(sendStatus, STATUS_INTERVAL_MS),
  ];

  return {
    stop: () => {
      timers.forEach(clearInterval);
      unsubscribe();
      if (current) channel.send({ type: 'bye', camera, to: current.senderId, reason: 'stopped' });
      close();
    },
  };
};
