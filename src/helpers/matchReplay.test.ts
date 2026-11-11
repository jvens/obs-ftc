import { describe, expect, it } from '@jest/globals';
import { MatchReplayFacts, matchReplayStatus, replayBufferSeconds } from './matchReplay';

const ready: MatchReplayFacts = {
  obsConnected: true, enabled: true, bufferEnabled: true, bufferRunning: true, bufferLength: 185, neededLength: 185,
};

describe('replayBufferSeconds', () => {
  it('holds the time before, the match, the time after, and a little extra', () => {
    expect(replayBufferSeconds(15, 15)).toBe(15 + 158 + 15 + 5);
  });
});

describe('matchReplayStatus', () => {
  it('waits for a match, then records it', () => {
    expect(matchReplayStatus(ready)).toEqual({ tone: 'ok', text: 'Waiting for a match' });
    expect(matchReplayStatus({ ...ready, holding: 'Q12' })).toEqual({ tone: 'live', text: 'Recording Q12' });
  });

  it('warns when the replay buffer cannot save the match', () => {
    expect(matchReplayStatus({ ...ready, bufferEnabled: false, bufferRunning: false })).toEqual({ tone: 'warn', text: 'Replay buffer off in OBS' });
    expect(matchReplayStatus({ ...ready, bufferRunning: false, holding: 'Q12' })).toEqual({ tone: 'warn', text: 'Replay buffer not running' });
    expect(matchReplayStatus({ ...ready, bufferLength: 20 })).toEqual({ tone: 'warn', text: 'Replay buffer length wrong' });
  });

  it('is off when turned off, or without OBS', () => {
    expect(matchReplayStatus({ ...ready, enabled: false }).tone).toBe('off');
    expect(matchReplayStatus({ ...ready, obsConnected: false })).toEqual({ tone: 'off', text: 'OBS not connected' });
  });
});
