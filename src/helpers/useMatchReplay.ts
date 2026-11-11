import { useObsStudio } from '../contexts/ObsStudioContext';
import { useFtcLive } from '../contexts/FtcLiveContext';
import { MatchReplayStatus, matchReplayStatus, replayBufferSeconds } from './matchReplay';

// Individual Match Recording as the header and the Outputs card show it.
export const useMatchReplay = (): { enabled: boolean; neededLength: number; status: MatchReplayStatus } => {
  const { status, replayBufferLength } = useObsStudio();
  const { enableReplayBuffer, preMatchReplayTime, postMatchReplayTime, isRecordingReplay, currentRecordingMatch } = useFtcLive();
  const neededLength = replayBufferSeconds(preMatchReplayTime, postMatchReplayTime);
  return {
    enabled: enableReplayBuffer,
    neededLength,
    status: matchReplayStatus({
      obsConnected: status.connected,
      enabled: enableReplayBuffer,
      bufferEnabled: status.replayBufferEnabled,
      bufferRunning: status.replayBufferRecording,
      bufferLength: replayBufferLength ?? undefined,
      neededLength,
      holding: isRecordingReplay ? currentRecordingMatch ?? undefined : undefined,
    }),
  };
};
