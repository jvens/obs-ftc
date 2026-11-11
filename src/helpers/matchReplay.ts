import { MATCH_TIME_SECONDS } from '../ftcLive/matchController';

// Individual Match Recording saves each match from the OBS replay buffer, which has to be running
// and hold the time before the match, the match and the time after it.

// A little extra so a save that runs late still has the start of the match.
const SLACK_SECONDS = 5;

export const replayBufferSeconds = (preMatch: number, postMatch: number) => preMatch + MATCH_TIME_SECONDS + postMatch + SLACK_SECONDS;

export interface MatchReplayFacts {
  obsConnected: boolean;
  enabled: boolean;
  // The replay buffer is turned on in the OBS settings, and running.
  bufferEnabled: boolean;
  bufferRunning: boolean;
  // Undefined until read from OBS.
  bufferLength?: number;
  neededLength: number;
  // The match the buffer is holding for saving.
  holding?: string;
}

export interface MatchReplayStatus {
  tone: 'ok' | 'live' | 'warn' | 'off';
  text: string;
}

export const matchReplayStatus = (facts: MatchReplayFacts): MatchReplayStatus =>
  !facts.obsConnected ? { tone: 'off', text: 'OBS not connected' }
    : !facts.enabled ? { tone: 'off', text: 'Off' }
    : !facts.bufferEnabled ? { tone: 'warn', text: 'Replay buffer off in OBS' }
    : !facts.bufferRunning ? { tone: 'warn', text: 'Replay buffer not running' }
    : facts.bufferLength !== undefined && facts.bufferLength !== facts.neededLength ? { tone: 'warn', text: 'Replay buffer length wrong' }
    : facts.holding ? { tone: 'live', text: `Recording ${facts.holding}` }
    : { tone: 'ok', text: 'Waiting for a match' };
