import React from 'react';
import OutputCard from './OutputCard';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useFtcLive, RecordStartConditions, RecordStopConditions, RecordStartCondition, RecordStopCondition } from '../contexts/FtcLiveContext';

const MatchRecordSettings: React.FC = () => {
  const { status, recordingError } = useObsStudio();
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

  const recordingStatus = !status.connected ? { tone: 'off' as const, text: 'OBS not connected' }
    : !enableMatchRecording ? { tone: 'off' as const, text: 'Off' }
    : status.recording ? { tone: 'live' as const, text: 'Recording' }
    : { tone: 'ok' as const, text: 'Waiting for a match' };

  return (
    <OutputCard
      title="Match Recording"
      hint={<><strong>Not recommended:</strong> use Individual Match Recording instead. This starts and stops OBS's own recording for each match, so there is no recording of the whole event, and it stops a recording started in OBS by hand.</>}
      status={recordingStatus}
      toggle={{ label: 'Record each match', checked: enableMatchRecording, onChange: setEnableMatchRecording, disabled: !status.connected }}
    >
      <div className="output-fields">
        <label>
          Start recording on
          <select value={recordStartCondition} onChange={(e) => setRecordStartCondition(e.target.value as RecordStartCondition)}>
            {RecordStartConditions.map((condition) => (
              <option key={condition.value} value={condition.value}>{condition.label}</option>
            ))}
          </select>
        </label>
        <label>
          Stop recording on
          <select value={recordStopCondition} onChange={(e) => setRecordStopCondition(e.target.value as RecordStopCondition)}>
            {RecordStopConditions.map((condition) => (
              <option key={condition.value} value={condition.value}>{condition.label}</option>
            ))}
          </select>
        </label>
        <label>
          Stop delay (seconds)
          <input type="number" value={recordStopDelay} onChange={(e) => setRecordStopDelay(parseInt(e.target.value) || 0)} min={0} />
        </label>
      </div>
      {recordingError && (
        <div className="error-message" role="alert">
          {recordingError}
        </div>
      )}
    </OutputCard>
  );
};

export default MatchRecordSettings;
