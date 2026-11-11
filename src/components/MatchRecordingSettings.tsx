import React, { useState } from 'react';
import OutputCard from './OutputCard';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useFtcLive } from '../contexts/FtcLiveContext';
import { MATCH_TIME_SECONDS } from '../ftcLive/matchController';
import { useMatchReplay } from '../helpers/useMatchReplay';


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
    preMatchReplayTime: preMatchTime,
    setPreMatchReplayTime: setPreMatchTime,
  } = useFtcLive();
  const { neededLength: recommendedBufferLength, status: replayStatus } = useMatchReplay();
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


  const formula = <small>(Pre-match: {preMatchTime}s + Match: {MATCH_TIME_SECONDS}s + Post-match: {postMatchReplayTime}s + Buffer: 5s)</small>;

  return (
    <OutputCard
      title="Individual Match Recording"
      hint={<><strong>Recommended.</strong> Saves each match as a video of its own from the OBS replay buffer, which keeps the last few minutes in memory. The stream and any recording of the whole event carry on untouched.</>}
      status={replayStatus}
      toggle={{ label: 'Save each match', checked: enableReplayBuffer, onChange: setEnableReplayBuffer, disabled: !status.connected }}
    >
      {!status.connected ? (
        <div className="error-message">
          <p>Connect to OBS Studio first to check replay buffer status.</p>
        </div>
      ) : !status.replayBufferEnabled ? (
        <div className="error-message">
          <p>The replay buffer is not turned on in OBS. <a href="#setup/settings">Apply the recommended settings</a>, or in OBS:</p>
          <ol>
            <li>Go to <strong>Settings → Output</strong></li>
            <li>Select the <strong>Replay Buffer</strong> tab</li>
            <li>Check <strong>Enable Replay Buffer</strong>, then <strong>Apply</strong> and <strong>OK</strong></li>
            <li>Reconnect to OBS Studio</li>
          </ol>
        </div>
      ) : (
        <>
          <p className="output-card-note">How much before and after the match to keep in each replay.</p>
          <div className="output-fields">
            <label>
              Before the match (seconds)
              <input type="number" value={preMatchTime} onChange={(e) => setPreMatchTime(parseInt(e.target.value) || 0)} min={0} />
            </label>
            <label>
              After the match (seconds)
              <input type="number" value={postMatchReplayTime} onChange={(e) => setPostMatchReplayTime(parseInt(e.target.value) || 0)} min={0} />
            </label>
          </div>

          {replayBufferLength !== null ? (
            replayBufferLength === recommendedBufferLength ? (
              <div className="info-box">
                <strong>OBS Replay Buffer: {replayBufferLength} seconds</strong>
                <span className="success-indicator"> (OK)</span>
                {outputMode && <><br /><small>Output Mode: {outputMode}</small></>}
                <div className="output-card-actions">
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
                {formula}
                {outputMode && <p><small>Output Mode: {outputMode}</small></p>}
                <div className="output-card-actions">
                  <button onClick={handleFixBufferLength} disabled={fixing}>
                    {fixing ? 'Applying...' : `Set to ${recommendedBufferLength} seconds`}
                  </button>
                  <button onClick={handleRefreshBufferLength} disabled={refreshing}>
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
              {formula}
              <div className="output-card-actions">
                <button onClick={handleRefreshBufferLength} disabled={refreshing}>
                  {refreshing ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            </div>
          ) : (
            <div className="info-box">
              <strong>Checking OBS Replay Buffer Length...</strong>
              <br />
              <small>Recommended: {recommendedBufferLength}s</small> {formula}
              <div className="output-card-actions">
                <button onClick={handleRefreshBufferLength} disabled={refreshing}>
                  {refreshing ? 'Checking...' : 'Check Now'}
                </button>
              </div>
            </div>
          )}
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
    </OutputCard>
  );
};

export default MatchRecordingSettings;
