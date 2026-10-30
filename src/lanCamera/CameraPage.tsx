import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import { ResultAsync } from 'neverthrow';
import { usePersistentState } from '../helpers/persistant';
import { cameraSceneName } from '../obsSetup/layout';
import { connectObs, obsSignaling } from './obsSignaling';
import { SignalingChannel } from './signaling';
import { CameraSender, SenderPeer, startCameraSender } from './sender';

const RECONNECT_MS = 3000;
const CAMERA_SCENE_PREFIX = cameraSceneName('');

const QUALITIES = {
  '1080p30': { label: '1080p, 30 fps', width: 1920, height: 1080, frameRate: 30 },
  '1080p60': { label: '1080p, 60 fps', width: 1920, height: 1080, frameRate: 60 },
  '720p30': { label: '720p, 30 fps', width: 1280, height: 720, frameRate: 30 },
  '720p60': { label: '720p, 60 fps', width: 1280, height: 720, frameRate: 60 },
};
type Quality = keyof typeof QUALITIES;

const BITRATES_KBPS = [4000, 8000, 12000, 20000];

type ObsState = 'disconnected' | 'connecting' | 'connected';

const obs = new OBSWebSocket();

const describe = (error: unknown) => error instanceof Error ? error.message : String(error);

const getUserMedia = (constraints: MediaStreamConstraints) =>
  ResultAsync.fromPromise(navigator.mediaDevices.getUserMedia(constraints), error => `Unable to open the camera: ${describe(error)}`);

const listDevices = () =>
  ResultAsync.fromPromise(navigator.mediaDevices.enumerateDevices(), error => `Unable to list cameras: ${describe(error)}`);

// Camera scenes in OBS, as camera labels ("Field 1", "Ceremony").
const listCameraSlots = () =>
  ResultAsync.fromPromise(obs.call('GetSceneList'), describe).map(({ scenes }) => scenes
    .map(scene => String(scene.sceneName))
    .filter(name => name.startsWith(CAMERA_SCENE_PREFIX))
    .map(name => name.slice(CAMERA_SCENE_PREFIX.length))
    .reverse());

// Keeps the screen (and so the camera) awake while sending.
const useWakeLock = (active: boolean) => {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let released = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      ResultAsync.fromPromise(navigator.wakeLock.request('screen'), describe).map(sentinel => {
        if (released) sentinel.release();
        else lock = sentinel;
      });
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', request);
      lock?.release();
    };
  }, [active]);
};

const PEER_STATE_LABELS: Partial<Record<RTCPeerConnectionState, string>> = {
  new: 'connecting',
  connecting: 'connecting',
  connected: 'live',
  disconnected: 'interrupted, reconnecting',
};

const CameraPage: React.FC = () => {
  const [obsHost, setObsHost] = usePersistentState<string>('lanCameraObsHost', '');
  const [obsPort, setObsPort] = usePersistentState<number>('lanCameraObsPort', 4455);
  const [obsPassword, setObsPassword] = usePersistentState<string>('lanCameraObsPassword', '');
  const [name, setName] = usePersistentState<string>('lanCameraName', '');
  const [slot, setSlot] = usePersistentState<string>('lanCameraSlot', '');
  const [videoDevice, setVideoDevice] = usePersistentState<string>('lanCameraVideoDevice', '');
  const [audioDevice, setAudioDevice] = usePersistentState<string>('lanCameraAudioDevice', '');
  const [withAudio, setWithAudio] = usePersistentState<boolean>('lanCameraAudio', false);
  const [quality, setQuality] = usePersistentState<Quality>('lanCameraQuality', '1080p30');
  const [bitrate, setBitrate] = usePersistentState<number>('lanCameraBitrateKbps', 8000);

  const [obsState, setObsState] = useState<ObsState>('disconnected');
  const [obsError, setObsError] = useState<string>();
  // Set while the user wants to be connected, so a dropped connection is retried.
  const [wantConnected, setWantConnected] = useState(false);
  const [channel, setChannel] = useState<SignalingChannel>();
  const [slots, setSlots] = useState<string[]>([]);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [stream, setStream] = useState<MediaStream>();
  const [mediaError, setMediaError] = useState<string>();

  const [sending, setSending] = useState(false);
  const [peers, setPeers] = useState<SenderPeer[]>([]);
  const [notice, setNotice] = useState<string>();
  const preview = useRef<HTMLVideoElement>(null);

  // A link from the dashboard names the camera.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('camera');
    if (fromLink) setSlot(fromLink);
  }, [setSlot]);

  // Open the camera (and microphone) whenever the choice changes.
  useEffect(() => {
    const { width, height, frameRate } = QUALITIES[quality];
    let current: MediaStream | undefined;
    let cancelled = false;
    getUserMedia({
      video: { deviceId: videoDevice ? { exact: videoDevice } : undefined, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate } },
      audio: withAudio ? { deviceId: audioDevice ? { exact: audioDevice } : undefined } : false,
    })
      .andThen(opened => listDevices().map(list => ({ opened, list })))
      .match(({ opened, list }) => {
        if (cancelled) { opened.getTracks().forEach(track => track.stop()); return; }
        current = opened;
        setDevices(list);
        setStream(opened);
        setMediaError(undefined);
      }, error => { if (!cancelled) setMediaError(error); });
    return () => {
      cancelled = true;
      current?.getTracks().forEach(track => track.stop());
      setStream(undefined);
    };
  }, [videoDevice, audioDevice, withAudio, quality]);

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream ?? null;
  }, [stream]);

  const connect = useCallback(() => {
    setObsState('connecting');
    connectObs(obs, obsHost, obsPort, obsPassword)
      .andThen(() => listCameraSlots())
      .match(cameraSlots => {
        setSlots(cameraSlots);
        setChannel(obsSignaling(obs));
        setObsState('connected');
        setObsError(undefined);
      }, error => {
        setObsState('disconnected');
        setObsError(error);
      });
  }, [obsHost, obsPort, obsPassword]);

  useEffect(() => {
    const onClosed = () => {
      setObsState('disconnected');
      setChannel(undefined);
    };
    obs.on('ConnectionClosed', onClosed);
    return () => { obs.off('ConnectionClosed', onClosed); };
  }, []);

  // Retry while disconnected and wanted, e.g. after OBS restarts.
  useEffect(() => {
    if (!wantConnected || obsState !== 'disconnected') return;
    const timer = setTimeout(connect, obsError ? RECONNECT_MS : 0);
    return () => clearTimeout(timer);
  }, [wantConnected, obsState, obsError, connect]);

  const disconnect = () => {
    setWantConnected(false);
    setSending(false);
    obs.disconnect();
  };

  // Send for as long as everything needed is there; any change starts over with the new settings.
  useEffect(() => {
    if (!sending || !channel || !stream || !slot) return;
    setNotice(undefined);
    const sender: CameraSender = startCameraSender(channel, {
      camera: slot,
      name: name || 'Camera computer',
      stream,
      maxBitrateKbps: bitrate,
      onPeers: setPeers,
      onNotice: setNotice,
    });
    return () => {
      sender.stop();
      setPeers([]);
    };
  }, [sending, channel, stream, slot, name, bitrate]);

  useWakeLock(sending);

  const videoDevices = useMemo(() => devices.filter(device => device.kind === 'videoinput'), [devices]);
  const audioDevices = useMemo(() => devices.filter(device => device.kind === 'audioinput'), [devices]);
  const slotChoices = slot && !slots.includes(slot) ? [slot, ...slots] : slots;
  const live = peers.some(peer => peer.state === 'connected');

  return (
    <div className="App">
      <header className="App-header">
        <h1>FTC LAN Camera</h1>
      </header>
      <div className="content-container lan-camera">
        <div className="section">
          <h2>1. Connect to OBS</h2>
          <p>
            Enter the address of the computer running OBS on this network. The port and password are in OBS under
            Tools &gt; WebSocket Server Settings.
          </p>
          <div className="lan-camera-row">
            <label>OBS computer: <input type="text" value={obsHost} placeholder="192.168.1.10" onChange={(e) => setObsHost(e.target.value.trim())} disabled={obsState !== 'disconnected'} /></label>
            <label>Port: <input type="number" value={obsPort} onChange={(e) => setObsPort(Number(e.target.value))} disabled={obsState !== 'disconnected'} /></label>
            <label>Password: <input type="password" value={obsPassword} onChange={(e) => setObsPassword(e.target.value)} disabled={obsState !== 'disconnected'} /></label>
            {obsState === 'disconnected' && !wantConnected
              ? <button onClick={() => { setObsError(undefined); setWantConnected(true); }} disabled={!obsHost}>Connect</button>
              : <button onClick={disconnect}>Disconnect</button>}
          </div>
          <p>
            {obsState === 'connected' ? 'Connected to OBS.'
              : obsState === 'connecting' ? 'Connecting...'
              : wantConnected ? 'Not connected, retrying...' : 'Not connected.'}
          </p>
          {obsError && <div className="error-message"><p>{obsError}</p></div>}
        </div>

        <div className="section">
          <h2>2. Pick the camera</h2>
          <div className="lan-camera-row">
            <label>
              Send as:
              <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                <option value="">{slots.length === 0 ? 'Connect to OBS to see the cameras' : 'Select camera'}</option>
                {slotChoices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
              </select>
            </label>
            <button onClick={() => listCameraSlots().map(setSlots)} disabled={obsState !== 'connected'}>Refresh</button>
            <label>This computer: <input type="text" value={name} placeholder="e.g. Field 1 cart laptop" onChange={(e) => setName(e.target.value)} disabled={sending} /></label>
          </div>
          <div className="lan-camera-row">
            <label>
              Camera:
              <select value={videoDevice} onChange={(e) => setVideoDevice(e.target.value)}>
                <option value="">Default camera</option>
                {videoDevices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || device.deviceId}</option>)}
              </select>
            </label>
            <label>
              Quality:
              <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
                {(Object.keys(QUALITIES) as Quality[]).map(key => <option key={key} value={key}>{QUALITIES[key].label}</option>)}
              </select>
            </label>
            <label>
              Bitrate:
              <select value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>
                {BITRATES_KBPS.map(kbps => <option key={kbps} value={kbps}>{kbps / 1000} Mbps</option>)}
              </select>
            </label>
          </div>
          <div className="lan-camera-row">
            <label>
              <input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} />
              Send audio
            </label>
            {withAudio && (
              <select value={audioDevice} onChange={(e) => setAudioDevice(e.target.value)}>
                <option value="">Default microphone</option>
                {audioDevices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || device.deviceId}</option>)}
              </select>
            )}
          </div>
          {mediaError && <div className="error-message"><p>{mediaError}</p></div>}
          <video ref={preview} className="lan-camera-preview" autoPlay playsInline muted />
        </div>

        <div className="section">
          <h2>3. Send</h2>
          {sending
            ? <button className="danger" onClick={() => setSending(false)}>Stop sending</button>
            : <button onClick={() => setSending(true)} disabled={obsState !== 'connected' || !stream || !slot}>Start sending</button>}
          <p className={live ? 'lan-camera-live' : undefined}>
            {!sending ? 'Not sending.'
              : obsState !== 'connected' ? 'Waiting for the connection to OBS.'
              : live ? `Live: OBS is showing this camera as ${slot}.`
              : peers.length > 0 ? 'Connecting to OBS...'
              : `Waiting for OBS. In the FTC OBS dashboard, set the ${slot} camera to "LAN Camera".`}
          </p>
          {sending && peers.length > 1 && (
            <ul>{peers.map(peer => <li key={peer.receiverId}>{PEER_STATE_LABELS[peer.state] ?? peer.state}</li>)}</ul>
          )}
          {notice && <p><em>{notice}</em></p>}
          <p>Keep this page open, and keep the computer from sleeping, for as long as the camera is needed.</p>
        </div>
      </div>
    </div>
  );
};

export default CameraPage;
