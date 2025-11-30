// src/App.tsx
import React from 'react';
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

function App() {
  return (
    <ObsStudioProvider>
    <FtcLiveProvider>
    <div className="App">
      <header className="App-header">
        <h1>OBS WebSocket Client</h1>
      </header>
      <div className="content-container">
        <div className="section-row">
          <FtcLiveConnectionManager />
          <ObsStudioManager />
        </div>
        <div className="section-row">
          <MatchRecordingSettings />
          <MatchRecordSettings />
        </div>
        <div className="section-row">
          <SceneMapper />
          <ScreenshotSettings />
        </div>
        <MatchEventsTable />
      </div>
    </div>
    </FtcLiveProvider>
    </ObsStudioProvider>
  );
}

export default App;
