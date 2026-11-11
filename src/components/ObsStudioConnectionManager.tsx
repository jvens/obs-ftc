import React from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import NetworkAccessHelp from './NetworkAccessHelp';

const ObsStudioManager: React.FC = () => {
  const {
    obsUrl, setObsUrl,
    obsPort, setObsPort,
    obsPassword, setObsPassword,
    status,
    connectToObs, disconnectFromObs,
    error,
    connectionFailed,
    isReconnecting, reconnectCountdown, cancelReconnect
  } = useObsStudio();

  return (
    <div className="section setup-card">
      <div className="form-grid">
        <label>
          OBS computer
          <input type="text" placeholder='Enter OBS Studio IP' value={obsUrl} onChange={(e) => setObsUrl(e.target.value)} />
        </label>
        <label>
          Port
          <input type="number" placeholder='Port' value={obsPort} onChange={(e) => setObsPort(parseInt(e.target.value))} />
        </label>
        <label>
          Password
          <input type="text" placeholder='OBS Websocket Password' value={obsPassword} onChange={(e) => setObsPassword(e.target.value)} />
        </label>
      </div>

      <div className="setup-card-actions">
        <button className={status.connected ? undefined : 'btn-primary'} onClick={() => status.connected ? disconnectFromObs() : connectToObs()} disabled={!obsUrl || !obsPort}>
          {status.connected ? 'Disconnect' : 'Connect'}
        </button>
        <span className={`status-pill ${status.connected ? 'ok' : 'off'}`}>
          {status.connected && <span className="status-dot" aria-hidden="true" />}
          {status.connected ? 'Connected' : 'Disconnected'}
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
          <p>{error}</p>
        </div>
      )}

      {!status.connected && <NetworkAccessHelp service="OBS" address={obsUrl} failed={connectionFailed} />}
    </div>
  );
};

export default ObsStudioManager;