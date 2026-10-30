import { okAsync } from 'neverthrow';
import { LanCameraMessage } from './protocol';
import { RTC_CONFIG, rtc, setLocalAndGather } from './rtc';
import { SignalingChannel } from './signaling';

export interface SenderPeer {
  receiverId: string;
  state: RTCPeerConnectionState;
}

export interface CameraSenderOptions {
  camera: string;
  // Shown in the dashboard so the operator knows which computer feeds the camera.
  name: string;
  stream: MediaStream;
  maxBitrateKbps: number;
  onPeers: (peers: SenderPeer[]) => void;
  onNotice: (notice: string) => void;
}

export interface CameraSender {
  stop: () => void;
}

// A receiver repeats its request until it gets a stream; an offer still on its way answers those too.
const OFFER_PENDING_MS = 5000;

// Sends `stream` to every receiver (OBS browser source) that asks for `options.camera`. Each receiver
// gets its own connection, so the same camera can also be previewed elsewhere.
export const startCameraSender = (channel: SignalingChannel, options: CameraSenderOptions): CameraSender => {
  const { camera, name, stream } = options;
  const peers = new Map<string, RTCPeerConnection>();
  const offeredAt = new Map<RTCPeerConnection, number>();

  const report = () => options.onPeers([...peers].map(([receiverId, pc]) => ({ receiverId, state: pc.connectionState })));

  const drop = (receiverId: string) => {
    peers.get(receiverId)?.close();
    if (peers.delete(receiverId)) report();
  };

  const offering = (receiverId: string) => {
    const pc = peers.get(receiverId);
    return pc !== undefined && pc.connectionState === 'new' && Date.now() - (offeredAt.get(pc) ?? 0) < OFFER_PENDING_MS;
  };

  const offer = (receiverId: string) => {
    if (offering(receiverId)) return;
    drop(receiverId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peers.set(receiverId, pc);
    offeredAt.set(pc, Date.now());
    stream.getTracks().forEach(track => {
      const { sender } = pc.addTransceiver(track, {
        direction: 'sendonly',
        streams: [stream],
        // The LAN has room for far more than WebRTC's default of a couple of Mbps.
        sendEncodings: track.kind === 'video' ? [{ maxBitrate: options.maxBitrateKbps * 1000 }] : undefined,
      });
      // A broadcast wants the full picture; when short of bandwidth or CPU, drop frames rather than resolution.
      if (track.kind === 'video')
        rtc(sender.setParameters({ ...sender.getParameters(), degradationPreference: 'maintain-resolution' } as RTCRtpSendParameters), 'Unable to set video preferences')
          .mapErr(console.warn);
    });
    pc.addEventListener('connectionstatechange', () => {
      if (peers.get(receiverId) !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(receiverId);
      else report();
    });
    report();
    rtc(pc.createOffer(), 'Unable to create an offer')
      .andThen(description => setLocalAndGather(pc, description, 'Unable to set up the connection'))
      // A newer offer may have replaced this one while candidates were gathered.
      .andThen(sdp => peers.get(receiverId) === pc ? channel.send({ type: 'offer', camera, to: receiverId, sdp, name }) : okAsync(undefined))
      .mapErr(error => { if (peers.get(receiverId) === pc) drop(receiverId); options.onNotice(error); });
  };

  const onAnswer = (receiverId: string, sdp: string) => {
    const pc = peers.get(receiverId);
    if (!pc || pc.signalingState !== 'have-local-offer') return;
    rtc(pc.setRemoteDescription({ type: 'answer', sdp }), 'Unable to accept the answer from OBS')
      .mapErr(error => { drop(receiverId); options.onNotice(error); });
  };

  const onMessage = (message: LanCameraMessage) => {
    if (message.camera !== camera) return;
    if (message.type === 'want') offer(message.from);
    else if (message.type === 'answer') onAnswer(message.from, message.sdp);
    else if (message.type === 'bye' && peers.has(message.from)) {
      drop(message.from);
      if (message.reason === 'replaced')
        options.onNotice('Another computer took over this camera. This one is standing by and takes over again if that one stops.');
      else if (message.reason === 'busy')
        options.onNotice('OBS is already showing another computer for this camera. This one is standing by and takes over if that one stops.');
    }
  };

  const unsubscribe = channel.subscribe(onMessage);
  channel.send({ type: 'hello', camera, name }).mapErr(options.onNotice);

  return {
    stop: () => {
      unsubscribe();
      channel.send({ type: 'bye', camera, reason: 'stopped' });
      [...peers.keys()].forEach(drop);
    },
  };
};
