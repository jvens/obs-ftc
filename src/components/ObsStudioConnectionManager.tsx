import React from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';

const ObsStudioManager: React.FC = () => {
  const { obsUrl, setObsUrl, obsPort, setObsPort, obsPassword, setObsPassword, status, connectToObs, disconnectFromObs, error } = useObsStudio();

  // ... UI for setting URL and password
  // ... Button to trigger connectToObs
  // ... Display connection status

  return (
    <div className="section">
      <h2>OBS Studio Connection</h2>
      <input
        type="text"
        placeholder='Enter OBS Studio IP'
        value={obsUrl}
        onChange={(e) => setObsUrl(e.target.value)}
      />
      <input
        type="number"
        placeholder='Port'
        value={obsPort}
        onChange={(e) => setObsPort(parseInt(e.target.value))}
      />
      <br />
      <input
        type="text"
        placeholder='OBS Websocket Password'
        value={obsPassword}
        onChange={(e) => setObsPassword(e.target.value)}
      />

      <button onClick={(e) => status.connected ? disconnectFromObs() : connectToObs()} disabled={!obsUrl || !obsPort}>
        {status.connected ? 'Disconnnect' : 'Connect'}
      </button>

      <div>Connection Status: 
        <span className={`connection-status ${status.connected ? 'connected' : 'disconnected'}`}>
          {status.connected ? 'Connected' : 'Disconnected'}
        </span>
        <span className={`connection-status ${status.streaming ? 'connected' : 'disconnected'}`}>
          {status.streaming ? 'Streaming' : 'Not Streaming'}
        </span>
        <span className={`connection-status ${status.recording ? 'connected' : 'disconnected'}`}>
          {status.recording ? 'Recording' : 'Not Recording'}
        </span>
        <span className={`connection-status ${status.replayBuffer ? 'connected' : 'disconnected'}`}>
          {status.replayBuffer ? 'Replay Ready' : 'Replay Not Ready'}
        </span>
      </div>

      {error && (
        <div className="error-message">
          Error: <p>{error}</p>
        </div>
      )}

    </div>
  );
};

export default ObsStudioManager;