import React, { useState } from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useFtcLive } from '../contexts/FtcLiveContext';

const MATCH_TIME_SECONDS = 158; // 2:38 in seconds

const MatchRecordingSettings: React.FC = () => {
  const { status, startReplayBuffer } = useObsStudio();
  const {
    enableReplayBuffer,
    setEnableReplayBuffer,
    postMatchReplayTime,
    setPostMatchReplayTime,
    isRecordingReplay,
    currentRecordingMatch
  } = useFtcLive();

  const [preMatchTime, setPreMatchTime] = useState<number>(15);
  const [starting, setStarting] = useState(false);

  const handleStartReplayBuffer = async () => {
    setStarting(true);
    await startReplayBuffer();
    setStarting(false);
  };

  // Calculate recommended buffer length: pre + match + post + 5 seconds buffer
  const recommendedBufferLength = preMatchTime + MATCH_TIME_SECONDS + postMatchReplayTime + 5;

  // Ready only when connected, replay buffer enabled in OBS, feature enabled, AND buffer is actively running
  const isReady = status.connected && status.replayBufferEnabled && enableReplayBuffer && status.replayBufferRecording;

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
                <div className="info-box">
                  <strong>Set OBS Replay Buffer Length to {recommendedBufferLength} seconds</strong>
                  <br />
                  <small>
                    (Pre-match: {preMatchTime}s + Match: {MATCH_TIME_SECONDS}s + Post-match: {postMatchReplayTime}s + Buffer: 5s)
                  </small>
                </div>
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
    </div>
  );
};

export default MatchRecordingSettings;
