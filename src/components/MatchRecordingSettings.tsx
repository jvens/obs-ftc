import React, { useState } from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useFtcLive } from '../contexts/FtcLiveContext';
import { usePersistentState } from '../helpers/persistant';

const MATCH_TIME_SECONDS = 158; // 2:38 in seconds

const MatchRecordingSettings: React.FC = () => {
  const {
    status,
    startReplayBuffer,
    replayBufferLength,
    outputMode,
    replayBufferConfigError,
    getReplayBufferLength,
    setReplayBufferLengthValue
  } = useObsStudio();
  const {
    enableReplayBuffer,
    setEnableReplayBuffer,
    postMatchReplayTime,
    setPostMatchReplayTime,
    isRecordingReplay,
    currentRecordingMatch
  } = useFtcLive();

  const [preMatchTime, setPreMatchTime] = usePersistentState<number>('Replay_PreMatchTime', 15);
  const [starting, setStarting] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleStartReplayBuffer = async () => {
    setStarting(true);
    await startReplayBuffer();
    setStarting(false);
  };

  const handleRefreshBufferLength = async () => {
    setRefreshing(true);
    await getReplayBufferLength();
    setRefreshing(false);
  };

  const handleFixBufferLength = async () => {
    setFixing(true);
    await setReplayBufferLengthValue(recommendedBufferLength);
    setFixing(false);
  };

  // Calculate recommended buffer length: pre + match + post + 5 seconds buffer
  const recommendedBufferLength = preMatchTime + MATCH_TIME_SECONDS + postMatchReplayTime + 5;

  // Check if buffer length is correctly configured (must be exact match)
  const isBufferLengthOk = replayBufferLength !== null && replayBufferLength === recommendedBufferLength;

  // Ready only when connected, replay buffer enabled in OBS, feature enabled, buffer is actively running, AND buffer length is correct
  const isReady = status.connected && status.replayBufferEnabled && enableReplayBuffer && status.replayBufferRecording && isBufferLengthOk;

  return (
    <div className="section">
      <h2>Match Replay Recording Settings</h2>
      <p>Use OBS built-in replay buffer to record individual matches.</p>

      <div>
        <label>
          <input
            type="checkbox"
            checked={enableReplayBuffer}
            onChange={(e) => setEnableReplayBuffer(e.target.checked)}
            disabled={!status.connected}
          />
          Enable Match Recording
        </label>
      </div>

      {enableReplayBuffer && (
        <>
          {!status.connected ? (
            <div className="error-message">
              <p>Connect to OBS Studio first to check replay buffer status.</p>
            </div>
          ) : !status.replayBufferEnabled ? (
            <div className="error-message">
              <p>Replay Buffer is not enabled in OBS Studio.</p>
              <p>To enable it:</p>
              <ol>
                <li>Open OBS Studio</li>
                <li>Go to <strong>Settings → Output</strong></li>
                <li>Select the <strong>Replay Buffer</strong> tab</li>
                <li>Check <strong>Enable Replay Buffer</strong></li>
                <li>Set the buffer length (see recommendation below)</li>
                <li>Click <strong>Apply</strong> and <strong>OK</strong></li>
                <li>Reconnect to OBS Studio</li>
              </ol>
            </div>
          ) : (
            <>
              <div>
                <h3>Buffer Timing Settings</h3>
                <p>
                  Configure how much time before and after the match to include in recordings.
                </p>

                <div>
                  <label>
                    Pre-Match Time (seconds):
                    <input
                      type="number"
                      value={preMatchTime}
                      onChange={(e) => setPreMatchTime(parseInt(e.target.value) || 0)}
                      min={0}
                      style={{ marginLeft: '10px', width: '60px' }}
                    />
                  </label>
                </div>
                <div>
                  <label>
                    Post-Match Time (seconds):
                    <input
                      type="number"
                      value={postMatchReplayTime}
                      onChange={(e) => setPostMatchReplayTime(parseInt(e.target.value) || 0)}
                      min={0}
                      style={{ marginLeft: '10px', width: '60px' }}
                    />
                  </label>
                </div>
                {/* Replay Buffer Length Validation */}
                {replayBufferLength !== null ? (
                  replayBufferLength === recommendedBufferLength ? (
                    <div className="info-box">
                      <strong>OBS Replay Buffer: {replayBufferLength} seconds</strong>
                      <span className="success-indicator"> (OK)</span>
                      {outputMode && <><br /><small>Output Mode: {outputMode}</small></>}
                      <div style={{ marginTop: '10px' }}>
                        <button onClick={handleRefreshBufferLength} disabled={refreshing}>
                          {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="warning-box">
                      <p>
                        <strong>OBS Replay Buffer Mismatch!</strong>
                        <span className="warning-indicator"> (Warning)</span>
                      </p>
                      <p>
                        Current: <strong>{replayBufferLength} seconds</strong>
                        <br />
                        Required: <strong>{recommendedBufferLength} seconds</strong>
                      </p>
                      <small>
                        (Pre-match: {preMatchTime}s + Match: {MATCH_TIME_SECONDS}s + Post-match: {postMatchReplayTime}s + Buffer: 5s)
                      </small>
                      {outputMode && <p><small>Output Mode: {outputMode}</small></p>}
                      <div style={{ marginTop: '10px' }}>
                        <button onClick={handleFixBufferLength} disabled={fixing}>
                          {fixing ? 'Applying...' : `Set to ${recommendedBufferLength} seconds`}
                        </button>
                        <button onClick={handleRefreshBufferLength} disabled={refreshing} style={{ marginLeft: '10px' }}>
                          {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                      {status.replayBufferRecording && (
                        <p><small>Note: Replay buffer will be restarted for changes to take effect.</small></p>
                      )}
                    </div>
                  )
                ) : replayBufferConfigError ? (
                  <div className="error-message">
                    <p><strong>Could not read OBS replay buffer setting</strong></p>
                    <p><small>{replayBufferConfigError}</small></p>
                    <p>
                      Set OBS Replay Buffer Length to <strong>{recommendedBufferLength} seconds</strong> manually:
                    </p>
                    <small>
                      (Pre-match: {preMatchTime}s + Match: {MATCH_TIME_SECONDS}s + Post-match: {postMatchReplayTime}s + Buffer: 5s)
                    </small>
                    <div style={{ marginTop: '10px' }}>
                      <button onClick={handleRefreshBufferLength} disabled={refreshing}>
                        {refreshing ? 'Retrying...' : 'Retry'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="info-box">
                    <strong>Checking OBS Replay Buffer Length...</strong>
                    <br />
                    <small>
                      Recommended: {recommendedBufferLength}s
                      (Pre-match: {preMatchTime}s + Match: {MATCH_TIME_SECONDS}s + Post-match: {postMatchReplayTime}s + Buffer: 5s)
                    </small>
                    <div style={{ marginTop: '10px' }}>
                      <button onClick={handleRefreshBufferLength} disabled={refreshing}>
                        {refreshing ? 'Checking...' : 'Check Now'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {!status.replayBufferRecording && (
                <div className="error-message">
                  <p>Replay Buffer is not running.</p>
                  <button onClick={handleStartReplayBuffer} disabled={starting}>
                    {starting ? 'Starting...' : 'Start Replay Buffer'}
                  </button>
                </div>
              )}
            </>
          )}
          <div>
            Status:
            <span className={`connection-status ${isReady ? 'connected' : 'disconnected'}`}>
              {isReady ? 'Ready' : 'Not Ready'}
            </span>
            {isReady && (
              <span className={`connection-status ${isRecordingReplay ? 'connected' : 'connected'}`}>
                {isRecordingReplay ? `Recording: ${currentRecordingMatch}` : 'Waiting for Match'}
              </span>
            )}
          </div>
        </>
      )}

    </div>
  );
};

export default MatchRecordingSettings;
