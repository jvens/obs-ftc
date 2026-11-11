import { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import './App.css';
import FtcLiveConnectionManager from './components/FtcLiveConnectionManager';
import { FtcLiveProvider } from './contexts/FtcLiveContext';
import { ObsStudioProvider } from './contexts/ObsStudioContext';
import ObsStudioManager from './components/ObsStudioConnectionManager';
import MatchRecordingSettings from './components/MatchRecordingSettings';
import MatchRecordSettings from './components/MatchRecordSettings';
import SceneMapper from './components/SceneMapper';
import ScreenshotSettings from './components/ScreenshotSettings';
import MatchEventsTable from './components/MatchEventsTable';
import ChaptersSettings from './components/ChaptersSettings';
import LowerThirdsPanel from './components/LowerThirdsPanel';
import ObsSetupPanel from './components/ObsSetupPanel';
import AboutModal from './components/AboutModal';
import ObsBrowserSourceWarning, { isRunningInObs } from './components/ObsBrowserSourceWarning';
import { initializeAnalytics, trackPageView } from './helpers/analytics';
import AppHeader from './components/AppHeader';
import { applyThemeFromUrl, useView } from './helpers/views';

// Checked once at load: when OBS has the dashboard open as a browser source, show only the
// warning so the hidden copy never connects to FTC Live or OBS.
const inObsBrowserSource = isRunningInObs();

applyThemeFromUrl(window.location.search, document.documentElement);

function App() {
  if (inObsBrowserSource) return <ObsBrowserSourceWarning />;
  return <Dashboard />;
}

function Dashboard() {
  const [showAbout, setShowAbout] = useState(false);
  const view = useView();

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
      <AppHeader view={view} onAbout={() => setShowAbout(true)} />
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
      {/* Every view stays mounted, so switching views keeps what each panel holds. */}
      <main>
        <section className="view" aria-labelledby="view-setup" hidden={view !== 'setup'}>
          <div className="view-intro">
            <h2 id="view-setup">Setup</h2>
            <p>Before going live: connect to FTC Live and OBS, build the scenes, and choose which match events switch scenes.</p>
          </div>
          <div className="content-container">
            <FtcLiveConnectionManager />
            <ObsStudioManager />
            <ObsSetupPanel />
            <SceneMapper />
          </div>
        </section>
        <section className="view" aria-labelledby="view-run" hidden={view !== 'run'}>
          <div className="view-intro">
            <h2 id="view-run">Run</h2>
            <p>During the event: lower thirds, and what happened in each match.</p>
          </div>
          <div className="content-container">
            <LowerThirdsPanel />
            <MatchEventsTable />
          </div>
        </section>
        <section className="view" aria-labelledby="view-outputs" hidden={view !== 'outputs'}>
          <div className="view-intro">
            <h2 id="view-outputs">Outputs</h2>
            <p>What is saved for each match: recordings, replays, screenshots and YouTube chapters.</p>
          </div>
          <div className="content-container">
            <MatchRecordSettings />
            <MatchRecordingSettings />
            <ScreenshotSettings />
            <ChaptersSettings />
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
