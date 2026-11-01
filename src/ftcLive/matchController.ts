import { FtcLiveSteamData, UpdateType } from '../types/FtcLive';
import type { MatchRow } from '../store/matchDataSlice';

// What the dashboard does in OBS as FTC Live runs matches: switch to the match's field, take
// screenshots, save a replay of each match from the replay buffer, and record each match.

export const MATCH_TIME_SECONDS = 158; // 2:38

// Start conditions for match recording, in the order FTC Live sends them. Recording starts on the
// selected event or any later one, in case the selected one was missed.
export type RecordStartCondition = 'MATCH_LOAD' | 'SHOW_PREVIEW' | 'SHOW_RANDOM' | 'SHOW_MATCH' | 'MATCH_START';
const RECORD_START_ORDER: RecordStartCondition[] = ['MATCH_LOAD', 'SHOW_PREVIEW', 'SHOW_RANDOM', 'SHOW_MATCH', 'MATCH_START'];

// Stop conditions for match recording. MATCH_END is not an FTC Live event: it is MATCH_TIME_SECONDS
// after MATCH_START.
export type RecordStopCondition = 'MATCH_END' | 'MATCH_COMMIT' | 'MATCH_POST';

export const isAtOrAfterStartCondition = (event: string, startCondition: RecordStartCondition): boolean => {
  const eventIndex = RECORD_START_ORDER.indexOf(event as RecordStartCondition);
  return eventIndex !== -1 && eventIndex >= RECORD_START_ORDER.indexOf(startCondition);
};

// The settings on the dashboard, read when each event arrives. Delays are in milliseconds for
// screenshots and in seconds otherwise, as the dashboard shows them.
export interface MatchSettings {
  transitionTriggers: UpdateType[];
  enableScreenshots: boolean;
  screenshotPreviewDelay: number;
  screenshotRandomDelay: number;
  screenshotResultDelay: number;
  enableReplayBuffer: boolean;
  postMatchReplayTime: number;
  enableMatchRecording: boolean;
  recordStartCondition: RecordStartCondition;
  recordStopCondition: RecordStopCondition;
  recordStopDelay: number;
}

export interface MatchActions {
  setActiveField: (field: number) => void;
  // Starts or stops recording; stopping returns the recording's path.
  setRecording: (start: boolean) => Promise<string | undefined>;
  // Returns the saved replay's path.
  saveReplayBuffer: () => Promise<string>;
  // Returns the screenshot's path, or '' when the field has no scene.
  takeScreenshot: (fileName: string, field: number) => Promise<string>;
  // For the match events table.
  matchEvent: (event: FtcLiveSteamData) => void;
  matchInfo: (info: Partial<MatchRow> & { name: string }) => void;
  // The replay buffer is holding `match` for saving, or (undefined) stopped holding it.
  replayHolding: (match: string | undefined) => void;
}

export interface MatchController {
  handle: (event: FtcLiveSteamData) => Promise<void>;
  // Cancels the timers waiting to stop a recording or save a replay.
  dispose: () => void;
}

type Timer = ReturnType<typeof setTimeout>;

export const createMatchController = (
  settings: () => MatchSettings,
  eventCode: () => string,
  actions: MatchActions,
): MatchController => {
  let recordingMatch: string | null = null;
  let replayMatch: string | null = null;
  let replayTimer: Timer | null = null;
  let matchEndTimer: Timer | null = null;

  const saveReplay = async (match: string) => {
    replayTimer = null;
    actions.replayHolding(undefined);
    const file = await actions.saveReplayBuffer();
    actions.matchInfo({ name: match, replayFile: file });
  };

  const screenshot = (event: FtcLiveSteamData, suffix: string, delay: number, key: 'previewScreenshot' | 'randomScreenshot' | 'scoreScreenshot') => {
    const code = eventCode();
    const fileName = `${code ? `${code}_` : ''}${event.payload.shortName}_${suffix}.png`;
    setTimeout(async () => {
      const file = await actions.takeScreenshot(fileName, event.payload.field);
      actions.matchInfo({ name: event.payload.shortName, [key]: file });
    }, delay);
  };

  const stopRecording = async () => {
    const path = await actions.setRecording(false);
    if (recordingMatch !== null) {
      const match = recordingMatch;
      recordingMatch = null;
      if (path) actions.matchInfo({ name: match, recordingFile: path });
    }
    if (matchEndTimer) {
      clearTimeout(matchEndTimer);
      matchEndTimer = null;
    }
  };

  const handle = async (event: FtcLiveSteamData) => {
    const current = settings();
    const { updateType } = event;
    const match = event.payload.shortName;
    actions.matchEvent(event);

    if (current.transitionTriggers.includes(updateType))
      actions.setActiveField(event.payload.field);

    if (current.enableScreenshots) {
      if (updateType === 'SHOW_PREVIEW') screenshot(event, 'preview', current.screenshotPreviewDelay, 'previewScreenshot');
      else if (updateType === 'SHOW_RANDOM') screenshot(event, 'random', current.screenshotRandomDelay, 'randomScreenshot');
      else if (updateType === 'MATCH_POST') screenshot(event, 'score', current.screenshotResultDelay, 'scoreScreenshot');
    }

    if (current.enableReplayBuffer) {
      if (updateType === 'MATCH_START') {
        // A match that starts before the last one's replay was saved saves that one first.
        if (replayTimer) {
          const pending = replayTimer;
          await saveReplay(replayMatch ?? 'Unknown');
          clearTimeout(pending);
        }
        replayMatch = match;
        actions.replayHolding(match);
        replayTimer = setTimeout(() => saveReplay(match), (MATCH_TIME_SECONDS + current.postMatchReplayTime) * 1000);
      } else if (updateType === 'MATCH_ABORT' && replayTimer) {
        clearTimeout(replayTimer);
        replayTimer = null;
        actions.replayHolding(undefined);
      }
    }

    if (current.enableMatchRecording) {
      if (recordingMatch === null && isAtOrAfterStartCondition(updateType, current.recordStartCondition)) {
        actions.setRecording(true);
        recordingMatch = match;
      }
      if (updateType === 'MATCH_START' && current.recordStopCondition === 'MATCH_END')
        matchEndTimer = setTimeout(stopRecording, (MATCH_TIME_SECONDS + current.recordStopDelay) * 1000);
      if (updateType === 'MATCH_ABORT') {
        if (matchEndTimer) {
          clearTimeout(matchEndTimer);
          matchEndTimer = null;
        }
        await stopRecording();
      }
      if (current.recordStopCondition !== 'MATCH_END' && updateType === current.recordStopCondition) {
        if (current.recordStopDelay > 0) setTimeout(stopRecording, current.recordStopDelay * 1000);
        else await stopRecording();
      }
    }
  };

  return {
    handle,
    dispose: () => {
      if (replayTimer) clearTimeout(replayTimer);
      if (matchEndTimer) clearTimeout(matchEndTimer);
    },
  };
};
