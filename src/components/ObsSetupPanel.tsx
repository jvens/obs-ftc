import React, { useEffect, useMemo, useState } from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useAppSelector } from '../store/hooks';
import { selectFtcServerUrl, selectObsUrl, selectSelectedEvent } from '../store/connectionSlice';
import { usePersistentState } from '../helpers/persistant';
import { lowerThirdUrl } from '../helpers/lowerThird';
import {
  AudioMode, CAMERA_TYPE_LABELS, CameraType, DEFAULT_SAFE_BACKGROUND_URL, SCENE_NAMES, SetupOptions, plannedCameras,
} from '../obsSetup/layout';
import { SetupMode, applySetup } from '../obsSetup/apply';
import ObsSourceMapper from './ObsSourceMapper';

const AUDIO_MODE_LABELS: Record<AudioMode, string> = {
  device: 'Audio input device (capture card, mixer, Dante Virtual Soundcard, mic)',
  camera: 'Audio from the cameras',
  none: 'No event audio',
};

const isLocalHost = (host: string) => /^(localhost|127\.|\[?::1\]?)/i.test(host.trim());

const ObsSetupPanel: React.FC = () => {
  const { status, callObs, setField0Scene, setField1Scene, setField2Scene, setField3Scene } = useObsStudio();
  const selectedEvent = useAppSelector(selectSelectedEvent);
  const ftcHost = useAppSelector(selectFtcServerUrl);
  const obsHost = useAppSelector(selectObsUrl);
  const [cameraType, setCameraType] = usePersistentState<CameraType>('obsSetupCameraType', 'ndi');
  const [audioMode, setAudioMode] = usePersistentState<AudioMode>('obsSetupAudioMode', 'device');
  const [overlaySounds, setOverlaySounds] = usePersistentState<boolean>('obsSetupOverlaySounds', true);
  const [safeBackgroundUrl, setSafeBackgroundUrl] = usePersistentState<string>('obsSetupSafeBackgroundUrl', DEFAULT_SAFE_BACKGROUND_URL);
  // Shared with the Lower Thirds panel.
  const [lowerThirdChannel] = usePersistentState<string>('lowerThirdsChannel', '');
  const [fieldCount, setFieldCount] = useState(selectedEvent?.fieldCount ?? 1);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => setFieldCount(selectedEvent?.fieldCount ?? 1), [selectedEvent?.fieldCount]);

  const cameras = useMemo(() => plannedCameras(fieldCount), [fieldCount]);
  const live = status.streaming || status.recording;
  const canRun = status.connected && !!selectedEvent && !running;

  const hostWarning = isLocalHost(ftcHost) && !isLocalHost(obsHost)
    ? `FTC Live is set to "${ftcHost}", but OBS is on another computer (${obsHost}). OBS would look for FTC Live on its own computer; connect to FTC Live by its IP address instead.`
    : undefined;

  // Point the automatic scene switching at the scenes that were just built.
  const assignFieldScenes = () => {
    setField1Scene(SCENE_NAMES.field(1));
    if (fieldCount >= 2) setField2Scene(SCENE_NAMES.field(2));
    if (fieldCount >= 3) setField3Scene(SCENE_NAMES.field(3));
    // Finals are played on one field; field 1 is the usual choice and can be changed above.
    if (fieldCount >= 2) setField0Scene(previous => previous ?? SCENE_NAMES.field(1));
  };

  const run = (mode: SetupMode) => {
    if (!selectedEvent) return;
    if (mode === 'wipe' && !window.confirm('Delete every scene and source in the current OBS scene collection and set it up again? This cannot be undone.'))
      return;
    const options: SetupOptions = {
      ftcHost,
      eventCode: selectedEvent.eventCode,
      fieldCount,
      cameraType,
      audioMode,
      overlaySounds,
      safeBackgroundUrl,
      lowerThirdUrl: lowerThirdUrl({ channel: lowerThirdChannel }),
    };
    setRunning(true);
    setLog([]);
    setWarnings([]);
    setError(undefined);
    applySetup(callObs, options, mode, line => setLog(lines => [...lines, line]))
      .match(
        report => {
          setWarnings(report.warnings);
          setLog(lines => [...lines, `Scene collection: ${report.sceneCollection}`]);
          assignFieldScenes();
        },
        message => setError(message)
      )
      .finally(() => {
        setRunning(false);
        setRefreshKey(key => key + 1);
      });
  };

  return (
    <div className="section">
      <h2>Configure OBS Studio</h2>
      <p>
        Builds the scenes and sources for streaming this event in OBS: one scene per field, Ceremony, Alliance Selection,
        Pit Display, Sponsor Loop, and a Camera Map for matching cameras up.
      </p>

      <div className="obs-setup-options">
        <div>
          Event: <strong>{selectedEvent ? `${selectedEvent.eventCode} (${selectedEvent.name})` : 'select an event in FTC Live Connection'}</strong>
          {' '}on <code>{ftcHost}</code>
        </div>
        <label>
          Fields:
          <input
            type="number"
            min={1}
            max={4}
            value={fieldCount}
            onChange={(e) => setFieldCount(Math.min(4, Math.max(1, parseInt(e.target.value, 10) || 1)))}
          />
        </label>
        <label>
          New cameras use:
          <select value={cameraType} onChange={(e) => setCameraType(e.target.value as CameraType)}>
            {(Object.keys(CAMERA_TYPE_LABELS) as CameraType[]).map(type => (
              <option key={type} value={type}>{CAMERA_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label>
          Stream audio:
          <select value={audioMode} onChange={(e) => setAudioMode(e.target.value as AudioMode)}>
            {(Object.keys(AUDIO_MODE_LABELS) as AudioMode[]).map(mode => (
              <option key={mode} value={mode}>{AUDIO_MODE_LABELS[mode]}</option>
            ))}
          </select>
        </label>
        <label title="Plays the FTC Live match sounds (start, end, buzzers) on the stream. Turn off if the venue audio feed already includes them.">
          <input type="checkbox" checked={overlaySounds} onChange={(e) => setOverlaySounds(e.target.checked)} />
          FTC Live match sounds on stream
        </label>
        <details>
          <summary>Advanced</summary>
          <label>
            Safe background image URL:
            <input type="text" className="obs-setup-url" value={safeBackgroundUrl} onChange={(e) => setSafeBackgroundUrl(e.target.value.trim())} />
          </label>
          <button onClick={() => setSafeBackgroundUrl(DEFAULT_SAFE_BACKGROUND_URL)}>Default</button>
        </details>
      </div>

      {hostWarning && <div className="error-message"><p>{hostWarning}</p></div>}

      <div className="obs-setup-actions">
        <button onClick={() => run('update')} disabled={!canRun}
          title="Adds anything missing and points FTC Live sources at the selected event. Camera choices, audio devices, positions and anything you added are kept.">
          Update for this event
        </button>
        <button onClick={() => run('newCollection')} disabled={!canRun || live}
          title="Builds everything from scratch in a new OBS scene collection. The current collection stays available in OBS (Scene Collection menu).">
          Set up in a new scene collection
        </button>
        <button className="danger" onClick={() => run('wipe')} disabled={!canRun || live}
          title="Deletes every scene and source in the current scene collection, then builds everything from scratch.">
          Wipe and set up
        </button>
      </div>
      {live && <p><em>Stop streaming and recording to set up from scratch.</em></p>}

      {error && <div className="error-message"><p>Setup stopped: {error}</p><p>Fix the problem and run "Update for this event" to finish.</p></div>}
      {warnings.length > 0 && (
        <ul className="obs-setup-warnings">
          {warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      {log.length > 0 && <pre className="obs-setup-log">{log.join('\n')}</pre>}

      <ObsSourceMapper cameras={cameras} audioMode={audioMode} refreshKey={refreshKey} />
    </div>
  );
};

export default ObsSetupPanel;
