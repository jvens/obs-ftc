import React, { useEffect } from 'react';
import FtcLiveConnectionManager from '../components/FtcLiveConnectionManager';
import ObsStudioManager from '../components/ObsStudioConnectionManager';
import ObsSetupPanel from '../components/ObsSetupPanel';
import SceneMapper from '../components/SceneMapper';
import { useFtcLive } from '../contexts/FtcLiveContext';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { usePersistentState } from '../helpers/persistant';
import { AudioMode, CustomCamera } from '../obsSetup/layout';
import { useAppSelector } from '../store/hooks';
import { selectFieldCount, selectSelectedEvent } from '../store/connectionSlice';
import SetupHelp from './SetupHelp';
import { DEFAULT_STEP, SETUP_STEPS, StepState, setupStepStates, stepFromId, stepTitle } from './steps';

interface Props {
  // The step in the URL (#setup/<step>); empty for the last step shown.
  sub: string;
  helpOpen: boolean;
  onOpenHelp: () => void;
  onCloseHelp: () => void;
}

const StepMarker: React.FC<{ number: number; state: StepState; current: boolean }> = ({ number, state, current }) =>
  state.status === 'done' ? (
    <span className="step-marker done" aria-label="Done">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
    </span>
  ) : (
    <span className={`step-marker${current ? ' current' : ''}`} aria-hidden="true">{number}</span>
  );

// The Setup view: the steps before going live down the side, the current step's settings in the
// middle, and help for it on the right. Every step stays mounted; only the current one shows.
const SetupView: React.FC<Props> = ({ sub, helpOpen, onOpenHelp, onCloseHelp }) => {
  const [rememberedStep, setRememberedStep] = usePersistentState<string>('setupStep', DEFAULT_STEP);
  const fromUrl = stepFromId(sub);
  const step = fromUrl ?? stepFromId(rememberedStep) ?? DEFAULT_STEP;
  useEffect(() => { if (fromUrl) setRememberedStep(fromUrl); }, [fromUrl, setRememberedStep]);

  const [audioMode, setAudioMode] = usePersistentState<AudioMode>('obsSetupAudioMode', 'device');
  const [customCameras, setCustomCameras] = usePersistentState<CustomCamera[]>('obsSetupCustomCameras', []);
  const { isConnected: ftcConnected } = useFtcLive();
  const { status, scenes, obsUrl, obsPort, field0Scene, field1Scene, field2Scene, field3Scene } = useObsStudio();
  const event = useAppSelector(selectSelectedEvent);
  const fieldCount = useAppSelector(selectFieldCount);

  const states = setupStepStates({
    ftcConnected,
    event: event ? { name: event.name, fieldCount } : undefined,
    obsConnected: status.connected,
    obsAddress: `${obsUrl}:${obsPort}`,
    scenes,
    fieldCount,
    audioMode,
    customCameras,
    fieldScenes: [field1Scene ?? '', field2Scene ?? '', field3Scene ?? ''],
    finalsScene: field0Scene ?? '',
  });

  const index = SETUP_STEPS.findIndex(candidate => candidate.id === step);
  const current = SETUP_STEPS[index];
  const previous = SETUP_STEPS[index - 1];
  const next = SETUP_STEPS[index + 1];

  return (
    <div className="setup-layout">
      <nav className="setup-steps" aria-label="Setup steps">
        <p className="setup-steps-heading">Before going live</p>
        <ol>
          {SETUP_STEPS.map(({ id, title }, stepIndex) => (
            <li key={id}>
              <a className="setup-step" href={`#setup/${id}`} aria-current={id === step ? 'step' : undefined}>
                <StepMarker number={stepIndex + 1} state={states[id]} current={id === step} />
                <span className="setup-step-text">
                  <span className="setup-step-title">{title}</span>
                  <span className="setup-step-detail">{states[id].detail}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
        <hr />
        <a className="setup-step" href="/camera">
          <svg className="setup-step-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          <span className="setup-step-text">
            <span className="setup-step-title">Set up a camera computer</span>
            <span className="setup-step-detail">Opens the LAN camera page</span>
          </span>
        </a>
      </nav>

      <div className="setup-main">
        <div className="setup-step-header">
          <p>Step {index + 1} of {SETUP_STEPS.length}</p>
          <h2>{current.title}</h2>
        </div>

        <section aria-label={stepTitle('ftc-live')} hidden={step !== 'ftc-live'}><FtcLiveConnectionManager /></section>
        <section aria-label={stepTitle('obs')} hidden={step !== 'obs'}><ObsStudioManager /></section>
        <ObsSetupPanel step={step} audioMode={audioMode} setAudioMode={setAudioMode} customCameras={customCameras} setCustomCameras={setCustomCameras} />
        <section aria-label={stepTitle('switching')} hidden={step !== 'switching'}><SceneMapper /></section>

        <div className="setup-step-nav">
          {previous ? <a className="button-link" href={`#setup/${previous.id}`}>Back: {previous.title}</a> : <span />}
          {next && <a className="button-link primary" href={`#setup/${next.id}`}>Next: {next.title}</a>}
        </div>
      </div>

      {helpOpen ? <SetupHelp step={step} title={current.title} onClose={onCloseHelp} /> : (
        // Closed, the help folds into a tab on the edge that opens it again.
        <div className="help-tab-strip">
          <button className="help-tab" onClick={onOpenHelp} aria-label="Show help" title="Show help">
            <span className="help-tab-icon" aria-hidden="true">?</span>
            <span className="help-tab-label" aria-hidden="true">Help</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default SetupView;
