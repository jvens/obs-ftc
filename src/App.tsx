import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import './App.css';
import { FtcLiveProvider } from './contexts/FtcLiveContext';
import { ObsStudioProvider } from './contexts/ObsStudioContext';
import MatchRecordingSettings from './components/MatchRecordingSettings';
import MatchRecordSettings from './components/MatchRecordSettings';
import ScreenshotSettings from './components/ScreenshotSettings';
import MatchEventsTable from './components/MatchEventsTable';
import ChaptersSettings from './components/ChaptersSettings';
import LowerThirdsPanel from './components/LowerThirdsPanel';
import ObsBrowserSourceWarning, { isRunningInObs } from './components/ObsBrowserSourceWarning';
import { initializeAnalytics, trackPageView } from './helpers/analytics';
import AppHeader from './components/AppHeader';
import { useLocation } from './helpers/views';
import { useTheme } from './helpers/theme';
import { usePersistentState } from './helpers/persistant';
import SetupView from './setup/SetupView';
import AboutView from './about/AboutView';
import SceneButtons from './run/SceneButtons';
import FieldStatus from './run/FieldStatus';
import WarningsBanner from './components/WarningsBanner';
import HelpPanel from './components/HelpPanel';
import RunHelp from './run/RunHelp';
import OutputsHelp from './components/OutputsHelp';

// Checked once at load: when OBS has the dashboard open as a browser source, show only the
// warning so the hidden copy never connects to FTC Live or OBS.
const inObsBrowserSource = isRunningInObs();

function App() {
  if (inObsBrowserSource) return <ObsBrowserSourceWarning />;
  return <Dashboard />;
}

function Dashboard() {
  const { view, sub } = useLocation();
  const [theme, setTheme] = useTheme();
  // One setting for the help on every view that has it.
  const [helpOpen, setHelpOpen] = usePersistentState('setupHelpOpen', true);
  const help = { open: helpOpen, onOpen: () => setHelpOpen(true), onClose: () => setHelpOpen(false) };

  // Initialize analytics on app load
  useEffect(() => {
    initializeAnalytics();
    trackPageView('Home');
  }, []);

  return (
    <Provider store={store}>
    <ObsStudioProvider>
    <FtcLiveProvider>
    <div className="App">
      <AppHeader view={view} theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
      <WarningsBanner />
      {/* Every view stays mounted, so switching views keeps what each panel holds. */}
      <main>
        <section className="view" aria-label="About" hidden={view !== 'about'}>
          <AboutView sub={view === 'about' ? sub : ''} active={view === 'about'} />
        </section>
        <section className="view" aria-label="Setup" hidden={view !== 'setup'}>
          <SetupView sub={view === 'setup' ? sub : ''} helpOpen={help.open} onOpenHelp={help.onOpen} onCloseHelp={help.onClose} />
        </section>
        <section className="view" aria-labelledby="view-run" hidden={view !== 'run'}>
          <div className="help-layout">
            <div className="help-layout-main">
              <div className="view-intro">
                <h2 id="view-run">Run</h2>
                <p>During the event: put scenes on the stream, show lower thirds, and see what each field is doing.</p>
              </div>
              <div className="content-container">
                <SceneButtons active={view === 'run'} />
                <LowerThirdsPanel />
                <FieldStatus />
              </div>
            </div>
            <HelpPanel title="Running the event" {...help}><RunHelp /></HelpPanel>
          </div>
        </section>
        <section className="view" aria-labelledby="view-outputs" hidden={view !== 'outputs'}>
          <div className="help-layout">
            <div className="help-layout-main">
              <div className="view-intro">
                <h2 id="view-outputs">Outputs</h2>
                <p>What is saved for each match: a video of each match, screenshots, and chapters for the stream's video.</p>
              </div>
              <div className="content-container">
                <MatchRecordingSettings />
                <ScreenshotSettings />
                <ChaptersSettings />
                <MatchRecordSettings />
              </div>
            </div>
            <HelpPanel title="What each output saves" {...help}><OutputsHelp /></HelpPanel>
          </div>
        </section>
        <section className="view" aria-labelledby="view-matches" hidden={view !== 'matches'}>
          <div className="view-intro wide">
            <h2 id="view-matches">Matches</h2>
            <p>Every match FTC Live has sent events for: when each event happened, and the replay, recording and screenshots saved for it.</p>
          </div>
          <div className="content-container wide">
            <MatchEventsTable />
          </div>
        </section>
      </main>
    </div>
    </FtcLiveProvider>
    </ObsStudioProvider>
    </Provider>
  );
}

export default App;
