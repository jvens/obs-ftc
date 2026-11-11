import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { okAsync } from 'neverthrow';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useAppSelector } from '../store/hooks';
import { selectFieldCount, selectFtcServerUrl, selectObsUrl, selectSelectedEvent } from '../store/connectionSlice';
import { usePersistentState } from '../helpers/persistant';
import { lowerThirdUrl } from '../helpers/lowerThird';
import { AudioMode, CustomCamera, DEFAULT_SAFE_BACKGROUND_URL, SCENE_NAMES, SetupOptions, cameraSceneName, plannedCameras } from '../obsSetup/layout';
import { customCameraNameError, removeCustomCameraScenes, setOverlayShown } from '../obsSetup/customCameras';
import { SetupMode, applySetup } from '../obsSetup/apply';
import { OutputSettings, applyOutputSettings, readOutputSettings } from '../obsSetup/outputSettings';
import { SetupIssue, checkSetup } from '../obsSetup/check';
import ObsSourceMapper from './ObsSourceMapper';
import { SetupStepId, expectedScenes, stepTitle } from '../setup/steps';

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

// What the Setup view's step list shows: how OBS compares with this event and the recommended
// settings. Undefined while it cannot be checked (OBS not connected, no event picked).
export interface SetupChecks {
  issues?: SetupIssue[];
  settings?: OutputSettings;
}

const IssueList: React.FC<{ title: string; issues: SetupIssue[]; children: React.ReactNode }> = ({ title, issues, children }) => (
  <div className="setup-issues" role="status">
    <strong>{title}</strong>
    <ul>{issues.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul>
    {children}
  </div>
);

const SetupOk: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="setup-ok" role="status">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
    {children}
  </p>
);

// Configure OBS Studio, split across the Setup steps it belongs to.
interface Props {
  step: SetupStepId;
  // Held by the Setup view, which shows the choice in the step list too.
  audioMode: AudioMode;
  setAudioMode: (mode: AudioMode) => void;
  customCameras: CustomCamera[];
  setCustomCameras: (cameras: CustomCamera[]) => void;
  onChecks: (checks: SetupChecks) => void;
}

const ObsSetupPanel: React.FC<Props> = ({ step, audioMode, setAudioMode, customCameras, setCustomCameras, onChecks }) => {
  const { status, scenes, callObs, refreshReplayBufferStatus, obsPort, obsPassword } = useObsStudio();
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
  // The scenes the stream shows (not the camera scenes), to list which OBS has.
  const programScenes = useMemo(() => expectedScenes(fieldCount, customCameras).filter(scene => !scene.startsWith('Camera - ')), [fieldCount, customCameras]);
  const [newCameraName, setNewCameraName] = useState('');
  const [customMessage, setCustomMessage] = useState<string>();
  const live = status.streaming || status.recording;
  const canRun = status.connected && !!selectedEvent && !running;

  // OBS loads FTC Live and the lower third with the addresses this dashboard uses, which only works
  // when both run on the same computer.
  const remoteObs = !isLocalHost(obsHost);

  // What setup builds for this event, also what OBS is checked against.
  const options = useMemo((): SetupOptions | undefined => selectedEvent ? {
    ftcHost,
    eventCode: selectedEvent.eventCode,
    fieldCount,
    audioMode,
    overlaySounds,
    safeBackgroundUrl,
    lowerThirdUrl: lowerThirdUrl({ channel: lowerThirdChannel }),
    lanReceiver: { port: obsPort, password: obsPassword },
    customCameras,
  } : undefined, [selectedEvent, ftcHost, fieldCount, audioMode, overlaySounds, safeBackgroundUrl, lowerThirdChannel, obsPort, obsPassword, customCameras]);

  // OBS is checked again after every change made here, when its scene list changes, on another
  // step, and when the window comes back into focus (after changing something in OBS itself).
  const [issues, setIssues] = useState<SetupIssue[]>();
  const [outputSettings, setOutputSettings] = useState<OutputSettings>();
  const [checkKey, setCheckKey] = useState(0);
  const recheck = useCallback(() => setCheckKey(key => key + 1), []);
  useEffect(() => {
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, [recheck]);

  useEffect(() => {
    if (!status.connected || !options) {
      setIssues(undefined);
      return;
    }
    if (running) return;
    let latest = true;
    checkSetup(callObs, options).match(found => { if (latest) setIssues(found); }, () => { if (latest) setIssues(undefined); });
    return () => { latest = false; };
  }, [status.connected, options, running, scenes, checkKey, step, callObs]);

  useEffect(() => {
    if (!status.connected) {
      setOutputSettings(undefined);
      return;
    }
    if (running) return;
    let latest = true;
    readOutputSettings(callObs).match(found => { if (latest) setOutputSettings(found); }, () => { if (latest) setOutputSettings(undefined); });
    return () => { latest = false; };
  }, [status.connected, running, checkKey, step, callObs]);

  useEffect(() => onChecks({ issues, settings: outputSettings }), [issues, outputSettings, onChecks]);

  // `withCameras` builds with a custom camera list that has just changed and is not in state yet.
  const run = (mode: SetupMode, withCameras: CustomCamera[] = customCameras) => {
    if (!options) return;
    if (mode === 'wipe' && !window.confirm('Delete every scene and source in the current OBS scene collection and set it up again? This cannot be undone.'))
      return;
    setRunning(true);
    setSetup(emptyOutcome);
    const log = (line: string) => setSetup(outcome => ({ ...outcome, log: [...outcome.log, line] }));
    applySetup(callObs, { ...options, customCameras: withCameras }, mode, log)
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
        recheck();
      });
  };

  const applySettings = (ids: readonly string[] | 'all') => {
    setRunning(true);
    setSettings(emptyOutcome);
    const log = (line: string) => setSettings(outcome => ({ ...outcome, log: [...outcome.log, line] }));
    applyOutputSettings(callObs, ids, log)
      .match(
        report => setSettings(outcome => ({
          ...outcome,
          log: report.changes.length === 0
            ? ['OBS already uses the recommended settings.']
            : ['Changed:', ...report.changes.map(change => `  ${change}`), ...outcome.log],
        })),
        error => setSettings(outcome => ({ ...outcome, error: `Settings not applied: ${error}` }))
      )
      .finally(() => {
        setRunning(false);
        refreshReplayBufferStatus();
        recheck();
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

  const updateButton = (label: string, primary: boolean) => (
    <button className={primary ? 'btn-primary' : undefined} onClick={() => run('update')} disabled={!canRun}
      title="Adds anything missing and points FTC Live sources at the selected event. Camera choices, audio devices, positions and anything you added are kept.">
      {label}
    </button>
  );

  const sceneIssues = issues?.filter(issue => issue.area === 'scenes') ?? [];
  const audioIssues = issues?.filter(issue => issue.area === 'audio') ?? [];
  // A collection with none of the scenes yet is set up from scratch; one with some is updated.
  const hasOurScenes = programScenes.some(scene => scenes.includes(scene));
  const fresh = status.connected && !hasOurScenes;
  const settingsToChange = outputSettings?.rows.filter(row => !row.ok) ?? [];

  // One card per Setup step; the step on screen shows its card, the others stay mounted but hidden.
  return (
    <>
      <div className="section setup-card" role="region" aria-label={stepTitle('scenes')} hidden={step !== 'scenes'}>
        <h3>Scenes in OBS</h3>
        <p className="setup-card-note">
          One scene per field, Ceremony, Alliance Selection, Pit Display and Sponsor Loop, plus a scene for each camera.
        </p>
        {status.connected && (
          <ul className="scene-pills" aria-label="Scenes setup builds">
            {programScenes.map(scene => (
              <li key={scene} className={`status-pill ${scenes.includes(scene) ? 'ok' : 'off'}`}>
                {scene}{scenes.includes(scene) ? '' : ' (missing)'}
              </li>
            ))}
          </ul>
        )}
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

        {sceneIssues.length > 0 ? (
          <IssueList title={fresh ? 'OBS has none of the scenes yet' : 'OBS does not match this event'} issues={sceneIssues}>
            <p>Click <strong>{fresh ? 'Set up in a new scene collection' : 'Update for this event'}</strong> to fix {sceneIssues.length === 1 ? 'it' : 'them'}.</p>
          </IssueList>
        ) : issues && <SetupOk>OBS has every scene, set up for {options?.eventCode}.</SetupOk>}

        <div className="obs-setup-actions setup-main-actions">
          {updateButton('Update for this event', !fresh)}
          <button className={fresh ? 'btn-primary' : undefined} onClick={() => run('newCollection')} disabled={!canRun || live}
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

        <ObsSourceMapper part="cameras" cameras={cameras} audioMode={audioMode} refreshKey={refreshKey} active={step === 'scenes'} onChanged={recheck} />

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

      <div className="section setup-card" role="region" aria-label={stepTitle('audio')} hidden={step !== 'audio'}>
        <div className="form-grid">
          <label>
            Stream audio
            <select value={audioMode} onChange={(e) => setAudioMode(e.target.value as AudioMode)}>
              {(Object.keys(AUDIO_MODE_LABELS) as AudioMode[]).map(mode => (
                <option key={mode} value={mode}>{AUDIO_MODE_LABELS[mode]}</option>
              ))}
            </select>
          </label>
          <ObsSourceMapper part="audio" cameras={cameras} audioMode={audioMode} refreshKey={refreshKey} active={step === 'audio'} onChanged={recheck} />
        </div>
        <div className="check-grid">
          <label title="Plays the FTC Live match sounds (start, end, buzzers) on the stream. Turn off if the venue audio feed already includes them.">
            <input type="checkbox" checked={overlaySounds} onChange={(e) => setOverlaySounds(e.target.checked)} />
            FTC Live match sounds on stream
          </label>
        </div>
        <p className="setup-card-note">OBS gets these choices when the scenes are built. After changing them, update OBS.</p>
        {audioIssues.length > 0 ? (
          <IssueList title="The audio in OBS does not match these choices" issues={audioIssues}>
            <p>Click <strong>Update OBS</strong> to fix {audioIssues.length === 1 ? 'it' : 'them'}.</p>
          </IssueList>
        ) : issues && <SetupOk>The audio in OBS matches these choices.</SetupOk>}
        <div className="obs-setup-actions setup-main-actions">{updateButton('Update OBS', audioIssues.length > 0)}</div>
        <OutcomeView outcome={setup} errorHint='Fix the problem and click "Update OBS" to finish.' />
      </div>

      <div className="section setup-card" role="region" aria-label={stepTitle('settings')} hidden={step !== 'settings'}>
        <p className="setup-card-note">
          Settings that suit an event stream. The stream key and the encoder are left as they are.
        </p>
        {!outputSettings ? (
          <p><em>{status.connected ? 'Reading the settings from OBS...' : 'Connect to OBS Studio to see its settings.'}</em></p>
        ) : (
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">In OBS now</th>
                  <th scope="col">Recommended</th>
                  <th scope="col"><span className="visually-hidden">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {outputSettings.rows.map(row => (
                  <tr key={row.id} className={row.ok ? undefined : 'differs'}>
                    <th scope="row">{row.label}</th>
                    <td>{row.current}</td>
                    <td>{row.recommended}</td>
                    <td>
                      {row.ok ? (
                        <span className="settings-ok">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                          Matches
                        </span>
                      ) : (
                        <button onClick={() => applySettings([row.id])} disabled={running || live} aria-label={`Use the recommended ${row.label.toLowerCase()}`}>
                          Use {row.recommended}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {outputSettings && outputSettings.notes.length > 0 && (
          <ul className="obs-setup-warnings">{outputSettings.notes.map(note => <li key={note}>{note}</li>)}</ul>
        )}
        <div className="obs-setup-actions setup-main-actions">
          <button className={settingsToChange.length > 0 ? 'btn-primary' : undefined} onClick={() => applySettings('all')}
            disabled={!status.connected || running || live || settingsToChange.length === 0}>
            Apply all recommended settings
          </button>
          {outputSettings && settingsToChange.length === 0 && <SetupOk>OBS has every recommended setting.</SetupOk>}
        </div>
        {live && <p><em>Stop streaming and recording to change the settings.</em></p>}
        <OutcomeView outcome={settings} />
      </div>
    </>
  );
};

export default ObsSetupPanel;
