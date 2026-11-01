import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MatchSettings, createMatchController, isAtOrAfterStartCondition } from './matchController';
import { FtcLiveSteamData, UpdateType } from '../types/FtcLive';

// The dashboard's defaults.
const DEFAULTS: MatchSettings = {
  transitionTriggers: ['SHOW_PREVIEW', 'SHOW_MATCH', 'SHOW_RANDOM', 'MATCH_START', 'MATCH_POST'],
  enableScreenshots: true,
  screenshotPreviewDelay: 1500,
  screenshotRandomDelay: 1500,
  screenshotResultDelay: 11000,
  enableReplayBuffer: true,
  postMatchReplayTime: 15,
  enableMatchRecording: false,
  recordStartCondition: 'SHOW_PREVIEW',
  recordStopCondition: 'MATCH_POST',
  recordStopDelay: 15,
};

const REPLAY_WAIT_MS = (158 + 15) * 1000;

const event = (updateType: UpdateType, number = 1, field = 1): FtcLiveSteamData =>
  ({ updateTime: 1700000000000, updateType, payload: { number, shortName: `Q${number}`, field } });

// A controller whose OBS actions and table updates are written to `log`, in order.
const controller = (settings: Partial<MatchSettings> = {}, eventCode = 'usmnrq1') => {
  const log: string[] = [];
  let replays = 0;
  const matchController = createMatchController(() => ({ ...DEFAULTS, ...settings }), () => eventCode, {
    setActiveField: field => log.push(`show field ${field}`),
    setRecording: async start => {
      log.push(start ? 'start recording' : 'stop recording');
      return start ? undefined : 'C:/Videos/recording.mp4';
    },
    saveReplayBuffer: async () => {
      log.push('save replay');
      return `C:/Videos/replay ${++replays}.mp4`;
    },
    takeScreenshot: async (fileName, field) => {
      log.push(`screenshot ${fileName} of field ${field}`);
      return `C:/Videos/${fileName}`;
    },
    matchEvent: () => undefined,
    matchInfo: ({ name, ...info }) => log.push(`${name}: ${JSON.stringify(info)}`),
    replayHolding: match => log.push(match ? `replay buffer holding ${match}` : 'replay buffer holding nothing'),
  });
  const send = async (...events: FtcLiveSteamData[]) => {
    for (const next of events) await matchController.handle(next);
  };
  const after = (ms: number) => jest.advanceTimersByTimeAsync(ms);
  return { log, send, after, dispose: matchController.dispose };
};

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('scene switching', () => {
  it('shows the match\'s field on the events chosen as transition triggers', async () => {
    const { log, send } = controller({ enableScreenshots: false, enableReplayBuffer: false });
    await send(event('MATCH_LOAD', 1, 2), event('SHOW_PREVIEW', 1, 2), event('MATCH_COMMIT', 1, 2), event('MATCH_POST', 1, 2));
    expect(log).toEqual(['show field 2', 'show field 2']);
  });

  it('follows the triggers the user picked', async () => {
    const { log, send } = controller({ enableScreenshots: false, enableReplayBuffer: false, transitionTriggers: ['MATCH_LOAD'] });
    await send(event('MATCH_LOAD', 1, 2), event('SHOW_PREVIEW', 1, 2));
    expect(log).toEqual(['show field 2']);
  });
});

describe('screenshots', () => {
  it('takes the preview, randomization and score screenshots after their delays', async () => {
    const { log, send, after } = controller({ transitionTriggers: [], enableReplayBuffer: false });

    await send(event('SHOW_PREVIEW', 3, 2));
    await after(1499);
    expect(log).toEqual([]);
    await after(1);
    await send(event('SHOW_RANDOM', 3, 2), event('MATCH_POST', 3, 2));
    await after(11000);

    expect(log).toEqual([
      'screenshot usmnrq1_Q3_preview.png of field 2',
      'Q3: {"previewScreenshot":"C:/Videos/usmnrq1_Q3_preview.png"}',
      'screenshot usmnrq1_Q3_random.png of field 2',
      'Q3: {"randomScreenshot":"C:/Videos/usmnrq1_Q3_random.png"}',
      'screenshot usmnrq1_Q3_score.png of field 2',
      'Q3: {"scoreScreenshot":"C:/Videos/usmnrq1_Q3_score.png"}',
    ]);
  });

  it('leaves the event code off the file name when no event is selected', async () => {
    const { log, send, after } = controller({ transitionTriggers: [], enableReplayBuffer: false }, '');
    await send(event('SHOW_PREVIEW'));
    await after(1500);
    expect(log[0]).toBe('screenshot Q1_preview.png of field 1');
  });

  it('takes none when turned off', async () => {
    const { log, send, after } = controller({ transitionTriggers: [], enableReplayBuffer: false, enableScreenshots: false });
    await send(event('SHOW_PREVIEW'), event('SHOW_RANDOM'), event('MATCH_POST'));
    await after(60_000);
    expect(log).toEqual([]);
  });
});

describe('match replays', () => {
  const replayOnly: Partial<MatchSettings> = { transitionTriggers: [], enableScreenshots: false };

  it('saves the replay buffer the post-match time after the match ends', async () => {
    const { log, send, after } = controller(replayOnly);

    await send(event('MATCH_START', 4));
    await after(REPLAY_WAIT_MS - 1);
    expect(log).toEqual(['replay buffer holding Q4']);
    await after(1);

    expect(log).toEqual([
      'replay buffer holding Q4',
      'replay buffer holding nothing',
      'save replay',
      'Q4: {"replayFile":"C:/Videos/replay 1.mp4"}',
    ]);
  });

  it('waits for the post-match time the user picked', async () => {
    const { log, send, after } = controller({ ...replayOnly, postMatchReplayTime: 30 });
    await send(event('MATCH_START'));
    await after(REPLAY_WAIT_MS);
    expect(log).not.toContain('save replay');
    await after(15_000);
    expect(log).toContain('save replay');
  });

  it('saves nothing for an aborted match', async () => {
    const { log, send, after } = controller(replayOnly);
    await send(event('MATCH_START'), event('MATCH_ABORT'));
    await after(REPLAY_WAIT_MS);
    expect(log).toEqual(['replay buffer holding Q1', 'replay buffer holding nothing']);
  });

  it('saves the last match\'s replay, once, when the next match starts before it was saved', async () => {
    const { log, send, after } = controller(replayOnly);
    await send(event('MATCH_START', 1));
    await after(60_000);

    await send(event('MATCH_START', 2));
    await after(REPLAY_WAIT_MS);

    expect(log.filter(line => line.includes('replayFile'))).toEqual([
      'Q1: {"replayFile":"C:/Videos/replay 1.mp4"}',
      'Q2: {"replayFile":"C:/Videos/replay 2.mp4"}',
    ]);
  });

  it('does nothing when turned off', async () => {
    const { log, send, after } = controller({ ...replayOnly, enableReplayBuffer: false });
    await send(event('MATCH_START'));
    await after(REPLAY_WAIT_MS);
    expect(log).toEqual([]);
  });
});

describe('match recording', () => {
  const recordingOnly: Partial<MatchSettings> = { transitionTriggers: [], enableScreenshots: false, enableReplayBuffer: false, enableMatchRecording: true };
  const RECORDED = 'Q1: {"recordingFile":"C:/Videos/recording.mp4"}';

  it('is off unless turned on', async () => {
    const { log, send } = controller({ ...recordingOnly, enableMatchRecording: false });
    await send(event('SHOW_PREVIEW'), event('MATCH_POST'));
    expect(log).toEqual([]);
  });

  it('records from Show Preview until the stop delay after Match Post', async () => {
    const { log, send, after } = controller(recordingOnly);

    await send(event('MATCH_LOAD'));
    expect(log).toEqual([]);
    await send(event('SHOW_PREVIEW'), event('SHOW_RANDOM'), event('MATCH_START'), event('MATCH_POST'));
    expect(log).toEqual(['start recording']);
    await after(14_999);
    expect(log).toEqual(['start recording']);
    await after(1);

    expect(log).toEqual(['start recording', 'stop recording', RECORDED]);
  });

  it('starts on a later event when the chosen one was missed', async () => {
    const { log, send } = controller({ ...recordingOnly, recordStartCondition: 'SHOW_RANDOM' });
    await send(event('SHOW_PREVIEW'));
    expect(log).toEqual([]);
    await send(event('MATCH_START'));
    expect(log).toEqual(['start recording']);
  });

  it('stops at once with no stop delay', async () => {
    const { log, send } = controller({ ...recordingOnly, recordStopDelay: 0 });
    await send(event('SHOW_PREVIEW'), event('MATCH_POST'));
    expect(log).toEqual(['start recording', 'stop recording', RECORDED]);
  });

  it('can stop on Match Commit', async () => {
    const { log, send } = controller({ ...recordingOnly, recordStopCondition: 'MATCH_COMMIT', recordStopDelay: 0 });
    await send(event('SHOW_PREVIEW'), event('MATCH_POST'));
    expect(log).toEqual(['start recording']);
    await send(event('MATCH_COMMIT'));
    expect(log).toEqual(['start recording', 'stop recording', RECORDED]);
  });

  it('can stop the stop delay after the match ends, timed from Match Start', async () => {
    const { log, send, after } = controller({ ...recordingOnly, recordStopCondition: 'MATCH_END', recordStopDelay: 10 });
    await send(event('SHOW_PREVIEW'), event('MATCH_START'), event('MATCH_POST'));
    await after((158 + 10) * 1000 - 1);
    expect(log).toEqual(['start recording']);
    await after(1);
    expect(log).toEqual(['start recording', 'stop recording', RECORDED]);
  });

  it('stops at once when the match is aborted, and not again when it would have ended', async () => {
    const { log, send, after } = controller({ ...recordingOnly, recordStopCondition: 'MATCH_END' });
    await send(event('SHOW_PREVIEW'), event('MATCH_START'), event('MATCH_ABORT'));
    expect(log).toEqual(['start recording', 'stop recording', RECORDED]);
    await after(REPLAY_WAIT_MS);
    expect(log).toEqual(['start recording', 'stop recording', RECORDED]);
  });

  it('records each match in turn', async () => {
    const { log, send } = controller({ ...recordingOnly, recordStopDelay: 0 });
    await send(event('SHOW_PREVIEW', 1), event('MATCH_POST', 1), event('SHOW_PREVIEW', 2), event('MATCH_POST', 2));
    expect(log).toEqual([
      'start recording', 'stop recording', RECORDED,
      'start recording', 'stop recording', 'Q2: {"recordingFile":"C:/Videos/recording.mp4"}',
    ]);
  });
});

describe('dispose', () => {
  it('cancels the waiting replay save and recording stop', async () => {
    const { log, send, after, dispose } = controller({
      transitionTriggers: [], enableScreenshots: false, enableMatchRecording: true, recordStopCondition: 'MATCH_END',
    });
    await send(event('SHOW_PREVIEW'), event('MATCH_START'));
    dispose();
    await after(REPLAY_WAIT_MS * 2);
    expect(log).toEqual(['start recording', 'replay buffer holding Q1']);
  });
});

describe('isAtOrAfterStartCondition', () => {
  it('follows the order FTC Live sends events in', () => {
    expect(isAtOrAfterStartCondition('SHOW_MATCH', 'SHOW_PREVIEW')).toBe(true);
    expect(isAtOrAfterStartCondition('MATCH_LOAD', 'SHOW_PREVIEW')).toBe(false);
    expect(isAtOrAfterStartCondition('MATCH_POST', 'MATCH_LOAD')).toBe(false);
  });
});
