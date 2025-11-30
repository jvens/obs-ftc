import React from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useFtcLive, RecordStartConditions, RecordStopConditions, RecordStartCondition, RecordStopCondition } from '../contexts/FtcLiveContext';

const MatchRecordSettings: React.FC = () => {
  const { status } = useObsStudio();
  const {
    enableMatchRecording,
    setEnableMatchRecording,
    recordStartCondition,
    setRecordStartCondition,
    recordStopCondition,
    setRecordStopCondition,
    recordStopDelay,
    setRecordStopDelay
  } = useFtcLive();

  return (
    <div className="section">
      <h2>Match Record Settings</h2>
      <p>Control OBS recording start/stop based on match events.</p>

      <div className="error-message">
        <strong>Warning:</strong> Enabling this will automatically start and stop OBS recording
        for each match. Do not use this if you want an uninterrupted recording of the entire event.
      </div>

      <div>
        <label>
          <input
            type="checkbox"
            checked={enableMatchRecording}
            onChange={(e) => setEnableMatchRecording(e.target.checked)}
            disabled={!status.connected}
          />
          Enable Match Recording Control
        </label>
      </div>

      {enableMatchRecording && (
        <>
          <div>
            <h3>Recording Triggers</h3>

            <div>
              <label>
                Start Recording On:
                <select
                  value={recordStartCondition}
                  onChange={(e) => setRecordStartCondition(e.target.value as RecordStartCondition)}
                  style={{ marginLeft: '10px' }}
                >
                  {RecordStartConditions.map((condition) => (
                    <option key={condition.value} value={condition.value}>
                      {condition.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label>
                Stop Recording On:
                <select
                  value={recordStopCondition}
                  onChange={(e) => setRecordStopCondition(e.target.value as RecordStopCondition)}
                  style={{ marginLeft: '10px' }}
                >
                  {RecordStopConditions.map((condition) => (
                    <option key={condition.value} value={condition.value}>
                      {condition.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label>
                Time After Stop Condition (seconds):
                <input
                  type="number"
                  value={recordStopDelay}
                  onChange={(e) => setRecordStopDelay(parseInt(e.target.value) || 0)}
                  min={0}
                  style={{ marginLeft: '10px', width: '60px' }}
                />
              </label>
            </div>
          </div>

          <div>
            Status:
            <span className={`connection-status ${status.connected ? 'connected' : 'disconnected'}`}>
              {status.connected ? 'Ready' : 'Not Connected'}
            </span>
            {status.connected && (
              <span className={`connection-status ${status.recording ? 'connected' : 'disconnected'}`}>
                {status.recording ? 'Recording' : 'Not Recording'}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MatchRecordSettings;
