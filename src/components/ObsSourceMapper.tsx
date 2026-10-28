import React, { useCallback, useEffect, useState } from 'react';
import { ResultAsync, okAsync } from 'neverthrow';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { AudioMode, CAMERA_TYPE_LABELS, CameraType, PlannedCamera, SOURCE_NAMES } from '../obsSetup/layout';
import {
  CameraSource, CameraStatus, cameraMuted, cameraThumbnail, getCameraStatus, listCameraDevices, setCameraDevice, setCameraSource,
} from '../obsSetup/cameras';
import { ListItem, listPropertyItems } from '../obsSetup/obsCall';

const PREVIEW_INTERVAL_MS = 2000;

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
  const { status, callObs } = useObsStudio();
  const [rows, setRows] = useState<CameraRow[]>([]);
  const [audio, setAudio] = useState<AudioRow>();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [livePreviews, setLivePreviews] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

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

  const reload = useCallback(() => {
    if (!status.connected) return;
    load().match(() => setMessage(undefined), error => setMessage(`Unable to read cameras from OBS: ${error}`));
  }, [status.connected, load]);

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
    if (source) change(row.camera, setCameraSource(callObs, row.camera, source, cameraMuted(audioMode)));
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
          onChange={(e) => change(row.camera, setCameraSource(callObs, row.camera, { type: 'shared', scene: e.target.value }, cameraMuted(audioMode)))}
        >
          {!shareableFrom(row).some(other => other.camera.scene === cameraStatus.scene) && (
            <option value={cameraStatus.scene}>{cameraStatus.scene}</option>
          )}
          {shareableFrom(row).map(other => <option key={other.camera.scene} value={other.camera.scene}>{other.camera.label}</option>)}
        </select>
      );
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
      <p>
        Pick the source for each camera. Every scene that shows a camera follows this choice. When one camera covers
        two roles, set the second to "{CAMERA_TYPE_LABELS.shared}". To use something else (a switcher, a second capture
        card, a media file), put it in the camera's scene in OBS.
      </p>
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
