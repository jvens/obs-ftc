import React, { useCallback, useEffect, useState } from 'react';
import { ResultAsync, okAsync } from 'neverthrow';
import { useObsStudio } from '../contexts/ObsStudioContext';
import {
  AudioMode, CAMERA_TYPE_LABELS, CameraType, PlannedCamera, SCENE_NAMES, SOURCE_NAMES,
} from '../obsSetup/layout';
import {
  CameraStatus, cameraMuted, cameraThumbnail, getCameraStatus, listCameraDevices, setCameraDevice, setCameraType,
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

// NDI names are discovered on the network and may not be listed yet, so they can also be typed in.
const NdiNameInput: React.FC<{ id: string; value: string; devices: ListItem[]; onCommit: (value: string) => void; disabled: boolean }> =
  ({ id, value, devices, onCommit, disabled }) => {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    const commit = () => text !== value && onCommit(text);
    return (
      <>
        <input
          type="text"
          list={id}
          value={text}
          placeholder="MACHINE (Source)"
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            // Picking from the list commits straight away; typing commits on Enter or leaving the box.
            if (devices.some(device => device.value === e.target.value)) onCommit(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        <datalist id={id}>
          {devices.map(device => <option key={device.value} value={device.value}>{device.name}</option>)}
        </datalist>
      </>
    );
  };

const ObsSourceMapper: React.FC<Props> = ({ cameras, audioMode, refreshKey }) => {
  const { status, callObs } = useObsStudio();
  const [rows, setRows] = useState<CameraRow[]>([]);
  const [audio, setAudio] = useState<AudioRow>();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [livePreviews, setLivePreviews] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const loadRow = useCallback((camera: PlannedCamera): ResultAsync<CameraRow, string> =>
    getCameraStatus(callObs, camera).andThen(cameraStatus => cameraStatus.state === 'managed'
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

  const reload = useCallback(() => {
    if (!status.connected) return;
    ResultAsync.combine([ResultAsync.combine(cameras.map(loadRow)), loadAudio()]).match(
      ([cameraRows, audioRow]) => { setRows(cameraRows); setAudio(audioRow); setMessage(undefined); },
      error => setMessage(`Unable to read cameras from OBS: ${error}`)
    );
  }, [status.connected, cameras, loadRow, loadAudio]);

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

  // Runs a change, then re-reads the affected row.
  const change = (camera: PlannedCamera, action: ResultAsync<unknown, string>) => {
    setBusy(true);
    action.andThen(() => loadRow(camera)).match(
      row => {
        setRows(previous => previous.map(r => r.camera.scene === camera.scene ? row : r));
        setMessage(undefined);
        setBusy(false);
      },
      error => { setMessage(`Unable to change ${camera.scene}: ${error}`); setBusy(false); }
    );
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
    if (cameraStatus.type === 'ndi')
      return (
        <NdiNameInput
          id={`ndi-${row.camera.label}`}
          value={cameraStatus.device}
          devices={row.devices}
          disabled={busy}
          onCommit={(value) => change(row.camera, setCameraDevice(callObs, cameraStatus.inputName, 'ndi', value))}
        />
      );
    const known = row.devices.some(device => device.value === cameraStatus.device);
    return (
      <select
        value={cameraStatus.device}
        disabled={busy}
        onChange={(e) => change(row.camera, setCameraDevice(callObs, cameraStatus.inputName, 'capture', e.target.value))}
      >
        <option value="">Select device</option>
        {!known && cameraStatus.device !== '' && <option value={cameraStatus.device}>(not connected)</option>}
        {row.devices.map(device => <option key={device.value} value={device.value}>{device.name}</option>)}
      </select>
    );
  };

  return (
    <div>
      <h3>Cameras</h3>
      <p>
        Pick the source for each camera here, or in OBS from the "{SCENE_NAMES.cameraMap}" scene. Every scene that shows a camera
        follows this choice. To use something else (a switcher, a second capture card, a media file), put it in that camera's scene in OBS.
      </p>
      <div className="obs-setup-actions">
        <button onClick={reload} disabled={!status.connected}>Refresh</button>
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
                value={row.status.state === 'managed' ? row.status.type : ''}
                disabled={busy || row.status.state === 'missing'}
                onChange={(e) => change(row.camera, setCameraType(callObs, row.camera, e.target.value as CameraType, cameraMuted(audioMode)))}
              >
                {row.status.state !== 'managed' && <option value="">{row.status.state === 'custom' ? 'Custom' : '-'}</option>}
                {(Object.keys(CAMERA_TYPE_LABELS) as CameraType[]).map(type => (
                  <option key={type} value={type}>{CAMERA_TYPE_LABELS[type]}</option>
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
