import React, { useMemo, useState } from 'react';
import { okAsync } from 'neverthrow';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useAppSelector } from '../store/hooks';
import { selectFieldCount, selectFtcServerUrl, selectObsUrl, selectSelectedEvent } from '../store/connectionSlice';
import { usePersistentState } from '../helpers/persistant';
import { lowerThirdUrl } from '../helpers/lowerThird';
import { AudioMode, CustomCamera, DEFAULT_SAFE_BACKGROUND_URL, SCENE_NAMES, SetupOptions, cameraSceneName, plannedCameras } from '../obsSetup/layout';
import { customCameraNameError, removeCustomCameraScenes, setOverlayShown } from '../obsSetup/customCameras';
import { SetupMode, applySetup } from '../obsSetup/apply';
import { applyRecommendedSettings } from '../obsSetup/outputSettings';
import ObsSourceMapper from './ObsSourceMapper';
import { SetupStepId } from '../setup/steps';

const AUDIO_MODE_LABELS: Record<AudioMode, string> = {
  device: 'Audio input device (capture card, mixer, Dante Virtual Soundcard, mic)',
  camera: 'Audio from the cameras',
  none: 'No event audio',
};

const isLocalHost = (host: string) => /^(localhost|127\.|\[?::1\]?)/i.test(host.trim());

interface Outcome {
  error?: string;
  warnings: string[];
  log: string[];
}

const emptyOutcome: Outcome = { warnings: [], log: [] };

const OutcomeView: React.FC<{ outcome: Outcome; errorHint?: string }> = ({ outcome, errorHint }) => (
  <>
    {outcome.error && <div className="error-message"><p>{outcome.error}</p>{errorHint && <p>{errorHint}</p>}</div>}
    {outcome.warnings.length > 0 && (
      <ul className="obs-setup-warnings">
        {outcome.warnings.map(warning => <li key={warning}>{warning}</li>)}
      </ul>
    )}
    {outcome.log.length > 0 && <pre className="obs-setup-log">{outcome.log.join('\n')}</pre>}
  </>
);

// Configure OBS Studio, split across the Setup steps it belongs to.
interface Props {
  step: SetupStepId;
  // Held by the Setup view, which shows the choice in the step list too.
  audioMode: AudioMode;
  setAudioMode: (mode: AudioMode) => void;
  customCameras: CustomCamera[];
  setCustomCameras: (cameras: CustomCamera[]) => void;
}

const ObsSetupPanel: React.FC<Props> = ({ step, audioMode, setAudioMode, customCameras, setCustomCameras }) => {
  const { status, callObs, refreshReplayBufferStatus, obsPort, obsPassword } = useObsStudio();
  const selectedEvent = useAppSelector(selectSelectedEvent);
  const ftcHost = useAppSelector(selectFtcServerUrl);
  const obsHost = useAppSelector(selectObsUrl);
  const [overlaySounds, setOverlaySounds] = usePersistentState<boolean>('obsSetupOverlaySounds', true);
  const [safeBackgroundUrl, setSafeBackgroundUrl] = usePersistentState<string>('obsSetupSafeBackgroundUrl', DEFAULT_SAFE_BACKGROUND_URL);
  // Shared with the Lower Thirds panel.
  const [lowerThirdChannel] = usePersistentState<string>('lowerThirdsChannel', '');
  const fieldCount = useAppSelector(selectFieldCount);
  const [running, setRunning] = useState(false);
  const [setup, setSetup] = useState<Outcome>(emptyOutcome);
  const [settings, setSettings] = useState<Outcome>(emptyOutcome);
  const [refreshKey, setRefreshKey] = useState(0);

  const cameras = useMemo(() => plannedCameras(fieldCount, customCameras), [fieldCount, customCameras]);
  const [newCameraName, setNewCameraName] = useState('');
  const [customMessage, setCustomMessage] = useState<string>();
  const live = status.streaming || status.recording;
  const canRun = status.connected && !!selectedEvent && !running;

  // OBS loads FTC Live and the lower third with the addresses this dashboard uses, which only works
  // when both run on the same computer.
  const remoteObs = !isLocalHost(obsHost);

  // `withCameras` builds with a custom camera list that has just changed and is not in state yet.
  const run = (mode: SetupMode, withCameras: CustomCamera[] = customCameras) => {
    if (!selectedEvent) return;
    if (mode === 'wipe' && !window.confirm('Delete every scene and source in the current OBS scene collection and set it up again? This cannot be undone.'))
      return;
    const options: SetupOptions = {
      ftcHost,
      eventCode: selectedEvent.eventCode,
      fieldCount,
      audioMode,
      overlaySounds,
      safeBackgroundUrl,
      lowerThirdUrl: lowerThirdUrl({ channel: lowerThirdChannel }),
      lanReceiver: { port: obsPort, password: obsPassword },
      customCameras: withCameras,
    };
    setRunning(true);
    setSetup(emptyOutcome);
    const log = (line: string) => setSetup(outcome => ({ ...outcome, log: [...outcome.log, line] }));
    applySetup(callObs, options, mode, log)
      .match(
        report => {
          setSetup(outcome => ({ ...outcome, warnings: report.warnings }));
          log(`Scene collection: ${report.sceneCollection}`);
        },
        error => setSetup(outcome => ({ ...outcome, error: `Setup stopped: ${error}` }))
      )
      .finally(() => {
        setRunning(false);
        setRefreshKey(key => key + 1);
      });
  };

  const applySettings = () => {
    setRunning(true);
    setSettings(emptyOutcome);
    const log = (line: string) => setSettings(outcome => ({ ...outcome, log: [...outcome.log, line] }));
    applyRecommendedSettings(callObs, log)
      .match(
        report => setSettings(outcome => ({
          ...outcome,
          warnings: report.notes,
          log: report.changes.length === 0
            ? ['OBS already uses the recommended settings.']
            : ['Changed:', ...report.changes.map(change => `  ${change}`), ...outcome.log],
        })),
        error => setSettings(outcome => ({ ...outcome, error: `Settings not applied: ${error}` }))
      )
      .finally(() => {
        setRunning(false);
        refreshReplayBufferStatus();
      });
  };

  // Adding a custom camera builds its scenes straight away when OBS and the event are ready.
  const addCustomCamera = () => {
    const error = customCameraNameError(newCameraName, customCameras, fieldCount);
    if (error) {
      setCustomMessage(error);
      return;
    }
    const next = [...customCameras, { name: newCameraName.trim(), overlay: true }];
    setCustomCameras(next);
    setNewCameraName('');
    setCustomMessage(canRun ? undefined : 'Added. Its scenes are built the next time you set up OBS.');
    if (canRun) run('update', next);
  };

  const setCustomOverlay = (camera: CustomCamera, overlay: boolean) => {
    setCustomCameras(customCameras.map(other => other.name === camera.name ? { ...other, overlay } : other));
    if (status.connected)
      setOverlayShown(callObs, camera, overlay).mapErr(error => setCustomMessage(`Unable to change the overlay in OBS: ${error}`));
  };

  const removeCustomCamera = (camera: CustomCamera) => {
    if (!window.confirm(`Remove the ${camera.name} camera? Its scenes, "${camera.name}" and "${cameraSceneName(camera.name)}", are deleted from OBS.`))
      return;
    const remove = status.connected ? removeCustomCameraScenes(callObs, camera) : okAsync(undefined);
    remove.match(
      () => {
        setCustomCameras(customCameras.filter(other => other.name !== camera.name));
        setCustomMessage(status.connected ? undefined : `Removed. OBS was not connected: delete its scenes in OBS if they are there.`);
        setRefreshKey(key => key + 1);
      },
      error => setCustomMessage(`Unable to remove the ${camera.name} scenes from OBS: ${error}`),
    );
  };

  const updateButton = (label: string) => (
    <button onClick={() => run('update')} disabled={!canRun}
      title="Adds anything missing and points FTC Live sources at the selected event. Camera choices, audio devices, positions and anything you added are kept.">
      {label}
    </button>
  );

  // One card per Setup step; the step on screen shows its card, the others stay mounted but hidden.
  return (
    <>
      <div className="section" hidden={step !== 'scenes'}>
        <h2>Scenes and Cameras</h2>
        <p>
          Builds the scenes and sources for streaming this event in OBS: one scene per field, Ceremony, Alliance Selection,
          Pit Display and Sponsor Loop, plus a scene for each camera.
        </p>
        {remoteObs && (
          <p><em>
            OBS is on another computer. Run this dashboard on the OBS computer and connect to OBS as localhost, so OBS
            can reach FTC Live at the address in FTC Live Server.
          </em></p>
        )}

        <div className="obs-setup-options">
          <div>
            Event: <strong>{selectedEvent ? `${selectedEvent.eventCode} (${selectedEvent.name})` : 'select an event in Connect to FTC Live'}</strong>
            {selectedEvent && `, ${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'},`}
            {' '}on <code>{ftcHost}</code>
          </div>
          <details>
            <summary>Advanced</summary>
            <label>
              Safe background image URL:
              <input type="text" className="obs-setup-url" value={safeBackgroundUrl} onChange={(e) => setSafeBackgroundUrl(e.target.value.trim())} />
            </label>
            <button onClick={() => setSafeBackgroundUrl(DEFAULT_SAFE_BACKGROUND_URL)}>Default</button>
          </details>
        </div>

        <div className="obs-setup-actions">
          {updateButton('Update for this event')}
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

        <OutcomeView outcome={setup} errorHint='Fix the problem and run "Update for this event" to finish.' />

        <ObsSourceMapper part="cameras" cameras={cameras} audioMode={audioMode} refreshKey={refreshKey} active={step === 'scenes'} />

        <div className="custom-cameras">
          <h3>Custom Cameras</h3>
          <p>
            More cameras, such as the audience or a camera in the pits. Each gets a scene of its own named after it,
            with a button on Run, and its camera is picked above like the others.
          </p>
          {customCameras.length > 0 && (
            <ul>
              {customCameras.map(camera => (
                <li key={camera.name} className="custom-camera-row">
                  <span className="custom-camera-name">{camera.name}</span>
                  <label title="The FTC Live score bar and graphics on top of the camera. A pit camera during a long field delay may look better without them.">
                    <input type="checkbox" checked={camera.overlay} onChange={(e) => setCustomOverlay(camera, e.target.checked)} />
                    FTC Live overlay
                  </label>
                  <button onClick={() => removeCustomCamera(camera)} disabled={running}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="custom-camera-add">
            <input type="text" aria-label="New camera name" placeholder="Name, e.g. Audience or Pit Camera" value={newCameraName}
              onChange={(e) => { setNewCameraName(e.target.value); setCustomMessage(undefined); }}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustomCamera(); }} />
            <button onClick={addCustomCamera} disabled={running}>Add camera</button>
          </div>
          {customMessage && <p className="custom-camera-message" role="status">{customMessage}</p>}
        </div>
      </div>

      <div className="section" hidden={step !== 'audio'}>
        <h2>Audio</h2>
        <div className="obs-setup-options">
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
        </div>
        <ObsSourceMapper part="audio" cameras={cameras} audioMode={audioMode} refreshKey={refreshKey} active={step === 'audio'} />
        <p>OBS gets these choices when the scenes are built. After changing them, update OBS.</p>
        <div className="obs-setup-actions">{updateButton('Update OBS')}</div>
        <OutcomeView outcome={setup} errorHint='Fix the problem and click "Update OBS" to finish.' />
      </div>

      <div className="section" hidden={step !== 'settings'}>
        <h2>Stream and Recording Settings</h2>
        <p>
          1080p at 30 fps, 6000 kbps video and 160 kbps audio, recordings at stream quality, and the replay buffer turned on
          for match replays. The stream key and encoder are left as they are.
        </p>
        <div className="obs-setup-actions">
          <button onClick={applySettings} disabled={!status.connected || running || live}>Apply recommended settings</button>
        </div>
        {live && <p><em>Stop streaming and recording to change the settings.</em></p>}
        <OutcomeView outcome={settings} />
      </div>
    </>
  );
};

export default ObsSetupPanel;
