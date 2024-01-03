import React from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';

const ObsStudioManager: React.FC = () => {
  const { obsUrl, setObsUrl, obsPort, setObsPort, obsPassword, setObsPassword, isConnected, connectToObs, disconnectFromObs, error } = useObsStudio();

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
      <br /><br />
      <input
        type="text"
        placeholder='OBS Websocket Password'
        value={obsPassword}
        onChange={(e) => setObsPassword(e.target.value)}
      />

      <button onClick={(e) => isConnected ? disconnectFromObs : connectToObs()} disabled={!obsUrl || !obsPort}>
        {isConnected ? 'Disconnnect' : 'Connect'}
      </button>

      {error && <div className="error">Error: {error}</div>}

      <div><br />Connection Status:
        <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  );
};

export default ObsStudioManager;