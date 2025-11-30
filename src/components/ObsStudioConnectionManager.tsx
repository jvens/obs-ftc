import React from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';

const ObsStudioManager: React.FC = () => {
  const {
    obsUrl, setObsUrl,
    obsPort, setObsPort,
    obsPassword, setObsPassword,
    status,
    connectToObs, disconnectFromObs,
    error,
    isReconnecting, reconnectCountdown, cancelReconnect
  } = useObsStudio();

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

      <button onClick={() => status.connected ? disconnectFromObs() : connectToObs()} disabled={!obsUrl || !obsPort}>
        {status.connected ? 'Disconnect' : 'Connect'}
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
      </div>

      {isReconnecting && (
        <div className="reconnect-status">
          <span>Attempting to reconnect in {reconnectCountdown}s...</span>
          <button onClick={cancelReconnect}>Cancel</button>
        </div>
      )}

      {error && (
        <div className="error-message">
          Error: <p>{error}</p>
        </div>
      )}

    </div>
  );
};

export default ObsStudioManager;