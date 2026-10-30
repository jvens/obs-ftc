import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ResultAsync, okAsync } from 'neverthrow';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { AudioMode, CAMERA_TYPE_LABELS, CameraType, PlannedCamera, SOURCE_NAMES } from '../obsSetup/layout';
import {
  CameraSource, CameraStatus, cameraMuted, cameraThumbnail, getCameraStatus, listCameraDevices, setCameraDevice, setCameraSource,
  setLanCameraSender,
} from '../obsSetup/cameras';
import { ListItem, listPropertyItems } from '../obsSetup/obsCall';
import { ReceiverState, parseLanCameraMessage, stampLanCameraMessage } from '../lanCamera/protocol';
import { lanCameraPageUrl, lanReceiverCamera, lanReceiverUrl } from '../lanCamera/urls';

const PREVIEW_INTERVAL_MS = 2000;
// LAN camera receivers and senders report every few seconds; one that has gone quiet is not running.
const LAN_STALE_MS = 12000;

interface LanStatus {
  camera: string;
  state: ReceiverState;
  at: number;
}

const DASHBOARD_ID = crypto.randomUUID();

const CameraPageLink: React.FC = () =>
  <a href={lanCameraPageUrl()} target="_blank" rel="noopener noreferrer">camera page</a>;

const lanStatusText = (camera: string, status: LanStatus | undefined, sending: boolean, now: number): React.ReactNode => {
  if (!camera)
    return <>Pick the camera computer to show. To add one, open the <CameraPageLink /> on that computer (the "Create LAN Camera" button at the top of this site), name the camera and click Start sending; it appears in this list.</>;
  if (!status || status.camera !== camera || now - status.at > LAN_STALE_MS)
    return 'OBS is not running the receiver for this camera.';
  if (status.state === 'live')
    return 'Live.';
  if (status.state === 'connecting')
    return `Connecting to ${camera}...`;
  return sending ? `Waiting for ${camera}.` : <>{camera} is not sending. Click Start sending on its <CameraPageLink />.</>;
};

interface CameraRow {
  camera: PlannedCamera;
  status: CameraStatus;
  devices: ListItem[];
}

interface AudioRow {
  device: string;
  devices: ListItem[];
}

interface Props {
  cameras: PlannedCamera[];
  audioMode: AudioMode;
  // Bumped by the parent after it changes OBS, so the table reloads.
  refreshKey: number;
}

const typeOf = (status: CameraStatus): CameraType | '' =>
  status.state === 'input' ? status.type : status.state === 'shared' ? 'shared' : '';

const ObsSourceMapper: React.FC<Props> = ({ cameras, audioMode, refreshKey }) => {
  const { status, callObs, obsPort, obsPassword, onCustomEvent } = useObsStudio();
  const lan = useMemo(() => ({ port: obsPort, password: obsPassword }), [obsPort, obsPassword]);
  // By camera slot (label).
  const [lanStatus, setLanStatus] = useState<Record<string, LanStatus>>({});
  // Camera computers sending now, by name, with when they were last heard from.
  const [lanSenders, setLanSenders] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [rows, setRows] = useState<CameraRow[]>([]);
  const [audio, setAudio] = useState<AudioRow>();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [livePreviews, setLivePreviews] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const sendingLanCameras = useMemo(() => Object.keys(lanSenders)
    .filter(name => now - lanSenders[name] <= LAN_STALE_MS)
    .sort((a, b) => a.localeCompare(b)), [lanSenders, now]);

  const loadRow = useCallback((camera: PlannedCamera): ResultAsync<CameraRow, string> =>
    getCameraStatus(callObs, camera).andThen(cameraStatus => cameraStatus.state === 'input'
      ? listCameraDevices(callObs, cameraStatus.inputName, cameraStatus.type)
          .map(devices => ({ camera, status: cameraStatus, devices }))
      : okAsync({ camera, status: cameraStatus, devices: [] })), [callObs]);

  const loadAudio = useCallback((): ResultAsync<AudioRow | undefined, string> =>
    callObs('GetInputList').andThen(({ inputs }) => inputs.some(input => input.inputName === SOURCE_NAMES.audio)
      ? ResultAsync.combine([
          callObs('GetInputSettings', { inputName: SOURCE_NAMES.audio }),
          listPropertyItems(callObs, SOURCE_NAMES.audio, 'device_id'),
        ]).map(([{ inputSettings }, devices]) => ({ device: String(inputSettings.device_id ?? ''), devices }))
      : okAsync(undefined)), [callObs]);

  const load = useCallback(() =>
    ResultAsync.combine([ResultAsync.combine(cameras.map(loadRow)), loadAudio()])
      .map(([cameraRows, audioRow]) => { setRows(cameraRows); setAudio(audioRow); }), [cameras, loadRow, loadAudio]);

  // Senders also announce themselves every few seconds; asking saves waiting for that.
  const discoverLanSenders = useCallback(() => callObs('BroadcastCustomEvent', {
    eventData: { ...stampLanCameraMessage({ type: 'discover', camera: '' }, DASHBOARD_ID) },
  }), [callObs]);

  const reload = useCallback(() => {
    if (!status.connected) return;
    discoverLanSenders();
    load().match(() => setMessage(undefined), error => setMessage(`Unable to read cameras from OBS: ${error}`));
  }, [status.connected, load, discoverLanSenders]);

  useEffect(reload, [reload, refreshKey]);

  useEffect(() => {
    if (!status.connected || !livePreviews) return;
    const scenes = rows.filter(row => row.status.state !== 'missing').map(row => row.camera.scene);
    const capture = () => scenes.forEach(scene =>
      cameraThumbnail(callObs, scene).map(image => setThumbnails(previous => ({ ...previous, [scene]: image }))));
    capture();
    const timer = setInterval(capture, PREVIEW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status.connected, livePreviews, rows, callObs]);

  useEffect(() => onCustomEvent(data => {
    const message = parseLanCameraMessage(data);
    if (message?.type === 'status')
      setLanStatus(previous => ({ ...previous, [message.slot]: { camera: message.camera, state: message.state, at: Date.now() } }));
    else if (message?.type === 'presence' || message?.type === 'hello')
      setLanSenders(previous => ({ ...previous, [message.camera]: Date.now() }));
    else if (message?.type === 'bye' && message.reason === 'stopped' && message.to === undefined)
      setLanSenders(previous => {
        const { [message.camera]: _gone, ...rest } = previous;
        return rest;
      });
  }), [onCustomEvent]);

  useEffect(() => {
    if (!status.connected) return;
    const timer = setInterval(() => setNow(Date.now()), LAN_STALE_MS / 4);
    return () => clearInterval(timer);
  }, [status.connected]);

  // Runs a change, then re-reads every camera, since a shared camera depends on the one it shows.
  const change = (camera: PlannedCamera, action: ResultAsync<unknown, string>) => {
    setBusy(true);
    action.andThen(load).match(
      () => { setMessage(undefined); setBusy(false); },
      error => { setMessage(`Unable to change ${camera.scene}: ${error}`); setBusy(false); }
    );
  };

  // A camera can show any other camera that has its own input, which also rules out loops.
  const shareableFrom = (row: CameraRow) =>
    rows.filter(other => other.camera.scene !== row.camera.scene && (other.status.state === 'input' || other.status.state === 'custom'));

  const changeType = (row: CameraRow, type: CameraType) => {
    const source: CameraSource | undefined = type === 'shared'
      ? (target => target && { type, scene: target.camera.scene })(shareableFrom(row)[0])
      : { type };
    if (source) change(row.camera, setCameraSource(callObs, row.camera, source, cameraMuted(audioMode), lan));
  };

  const changeAudioDevice = (device: string) =>
    callObs('SetInputSettings', { inputName: SOURCE_NAMES.audio, inputSettings: { device_id: device } })
      .andThen(loadAudio)
      .match(setAudio, error => setMessage(`Unable to change ${SOURCE_NAMES.audio}: ${error}`));

  const renderSource = (row: CameraRow) => {
    const cameraStatus = row.status;
    if (cameraStatus.state === 'missing')
      return <em>Not set up yet</em>;
    if (cameraStatus.state === 'custom')
      return <em>Custom: {cameraStatus.sources.join(', ') || 'empty'} (edit the "{row.camera.scene}" scene in OBS)</em>;
    if (cameraStatus.state === 'shared')
      return (
        <select
          value={cameraStatus.scene}
          disabled={busy}
          onChange={(e) => change(row.camera, setCameraSource(callObs, row.camera, { type: 'shared', scene: e.target.value }, cameraMuted(audioMode), lan))}
        >
          {!shareableFrom(row).some(other => other.camera.scene === cameraStatus.scene) && (
            <option value={cameraStatus.scene}>{cameraStatus.scene}</option>
          )}
          {shareableFrom(row).map(other => <option key={other.camera.scene} value={other.camera.scene}>{other.camera.label}</option>)}
        </select>
      );
    if (cameraStatus.type === 'lan') {
      const sender = lanReceiverCamera(cameraStatus.device);
      const sending = sendingLanCameras.includes(sender);
      return (
        <div className="obs-lan-camera">
          <select
            value={sender}
            disabled={busy}
            onChange={(e) => change(row.camera, setLanCameraSender(callObs, row.camera, cameraStatus.inputName, e.target.value, lan))}
          >
            <option value="">{sendingLanCameras.length === 0 ? 'No camera computers sending' : 'Select camera computer'}</option>
            {sender !== '' && !sending && <option value={sender}>{sender} (not sending)</option>}
            {sendingLanCameras.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <div>{lanStatusText(sender, lanStatus[row.camera.label], sending, now)}</div>
          {cameraStatus.device !== lanReceiverUrl(row.camera.label, sender, lan) && (
            <div><em>The OBS port, password or dashboard address changed. Run "Update for this event" to update the receiver.</em></div>
          )}
        </div>
      );
    }
    const known = row.devices.some(device => device.value === cameraStatus.device);
    return (
      <select
        value={cameraStatus.device}
        disabled={busy}
        onChange={(e) => change(row.camera, setCameraDevice(callObs, cameraStatus.inputName, cameraStatus.type, e.target.value))}
      >
        <option value="">
          {row.devices.length === 0 ? `No ${CAMERA_TYPE_LABELS[cameraStatus.type]}s found` : 'Select source'}
        </option>
        {!known && cameraStatus.device !== '' && <option value={cameraStatus.device}>{cameraStatus.device} (not found)</option>}
        {row.devices.map(device => <option key={device.value} value={device.value}>{device.name}</option>)}
      </select>
    );
  };

  return (
    <div>
      <h3>Cameras</h3>
      <p>Pick the source for each camera. Every scene that shows a camera follows this choice.</p>
      <details className="obs-camera-help">
        <summary>More about cameras</summary>
        <p>When one camera covers two roles, set the second to "{CAMERA_TYPE_LABELS.shared}".</p>
        <p>
          For a webcam plugged into another computer on the event network, open the <CameraPageLink /> on that
          computer (the "Create LAN Camera" button at the top of this site), name the camera and click Start sending. Then set the
          camera here to "{CAMERA_TYPE_LABELS.lan}" and pick that name.
        </p>
        <p>To use something else (a switcher, a second capture card, a media file), put it in the camera's scene in OBS.</p>
      </details>
      <div className="obs-setup-actions">
        <button onClick={reload} disabled={!status.connected || busy} title="Reads the cameras from OBS again and looks for new devices and NDI sources.">
          Refresh
        </button>
        <label>
          <input type="checkbox" checked={livePreviews} onChange={(e) => setLivePreviews(e.target.checked)} />
          Live previews
        </label>
      </div>
      {message && <div className="error-message"><p>{message}</p></div>}
      <div className="obs-camera-grid">
        {rows.map(row => (
          <div key={row.camera.scene} className="obs-camera-card">
            <div className="obs-camera-preview">
              {thumbnails[row.camera.scene] && livePreviews
                ? <img src={thumbnails[row.camera.scene]} alt={`${row.camera.label} camera preview`} />
                : <span>No preview</span>}
            </div>
            <strong>{row.camera.label}</strong>
            <div>
              <select
                value={typeOf(row.status)}
                disabled={busy || row.status.state === 'missing'}
                onChange={(e) => changeType(row, e.target.value as CameraType)}
              >
                {typeOf(row.status) === '' && <option value="">{row.status.state === 'custom' ? 'Custom' : '-'}</option>}
                {(Object.keys(CAMERA_TYPE_LABELS) as CameraType[]).map(type => (
                  <option key={type} value={type} disabled={type === 'shared' && shareableFrom(row).length === 0}>
                    {CAMERA_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>{renderSource(row)}</div>
          </div>
        ))}
      </div>

      <h3>Audio</h3>
      {audioMode !== 'device' ? (
        <p>{audioMode === 'camera' ? 'Stream audio comes from each scene\'s camera.' : 'No event audio source is set up.'}</p>
      ) : audio ? (
        <label>
          {SOURCE_NAMES.audio} device:
          <select value={audio.device} onChange={(e) => changeAudioDevice(e.target.value)} disabled={!status.connected}>
            {audio.devices.map(device => <option key={device.value} value={device.value}>{device.name}</option>)}
          </select>
        </label>
      ) : (
        <p><em>Not set up yet</em></p>
      )}
    </div>
  );
};

export default ObsSourceMapper;
