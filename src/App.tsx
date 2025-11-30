// src/App.tsx
import { useState, useEffect } from 'react';
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
import AboutModal from './components/AboutModal';
import { initializeAnalytics, trackPageView } from './helpers/analytics';

function App() {
  const [showAbout, setShowAbout] = useState(false);

  // Initialize analytics on app load
  useEffect(() => {
    initializeAnalytics();
    trackPageView('Home');
  }, []);

  return (
    <ObsStudioProvider>
    <FtcLiveProvider>
    <div className="App">
      <header className="App-header">
        <h1>FTC OBS WebSocket Client</h1>
        <div className="header-links">
          <button className="about-button" onClick={() => setShowAbout(true)} title="About">
            <span className="info-icon">i</span>
          </button>
          <a href="https://github.com/jvens/obs-ftc" target="_blank" rel="noopener noreferrer" className="github-link" title="View on GitHub">
            <svg height="32" width="32" viewBox="0 0 16 16" fill="white">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        </div>
      </header>
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
      <div className="content-container">
        <FtcLiveConnectionManager />
        <ObsStudioManager />
        <SceneMapper />
        <ScreenshotSettings />
        <MatchRecordingSettings />
        <MatchRecordSettings />
        <MatchEventsTable />
      </div>
    </div>
    </FtcLiveProvider>
    </ObsStudioProvider>
  );
}

export default App;
