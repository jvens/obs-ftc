import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UpdateType } from '../types/FtcLive';

export interface MatchRow {
  number: number;
  name: string;
  scheduledTime?: number;
  blue1?: number;
  blue2?: number;
  blue3?: number;
  red1?: number;
  red2?: number;
  red3?: number;
  MATCH_LOAD?: number;
  SHOW_PREVIEW?: number;
  SHOW_RANDOM?: number;
  SHOW_MATCH?: number;
  MATCH_START?: number;
  MATCH_ABORT?: number;
  MATCH_COMMIT?: number;
  MATCH_POST?: number;
  replayFile?: string;
  recordingFile?: string;
  previewScreenshot?: string;
  randomScreenshot?: string;
  scoreScreenshot?: string;
}

interface MatchDataState {
  matches: MatchRow[];
}

// Load initial state from localStorage
const loadState = (): MatchDataState => {
  try {
    const matches = localStorage.getItem('Match_Events');
    return {
      matches: matches ? JSON.parse(matches) : [],
    };
  } catch {
    return { matches: [] };
  }
};

const initialState: MatchDataState = loadState();

const matchDataSlice = createSlice({
  name: 'matchData',
  initialState,
  reducers: {
    // Update or add a match event timestamp
    updateMatchEvent(state, action: PayloadAction<{
      shortName: string;
      number: number;
      updateType: UpdateType;
      updateTime: number;
    }>) {
      const { shortName, number, updateType, updateTime } = action.payload;
      const existingIndex = state.matches.findIndex(m => m.name === shortName);

      if (existingIndex !== -1) {
        state.matches[existingIndex][updateType] = updateTime;
      } else {
        const newMatch: MatchRow = {
          number,
          name: shortName,
          [updateType]: updateTime,
        };
        state.matches.push(newMatch);
      }
    },

    // Set matches from fetched match list (with team info)
    setMatches(state, action: PayloadAction<MatchRow[]>) {
      state.matches = action.payload;
    },

    // Update a single match's team/schedule info (merge with existing)
    updateMatchInfo(state, action: PayloadAction<Partial<MatchRow> & { name: string }>) {
      const { name, ...updates } = action.payload;
      const existingIndex = state.matches.findIndex(m => m.name === name);

      if (existingIndex !== -1) {
        state.matches[existingIndex] = { ...state.matches[existingIndex], ...updates };
      } else {
        state.matches.push({ name, number: 0, ...updates } as MatchRow);
      }
    },

    // Clear all match data
    clearAllData(state) {
      state.matches = [];
    },
  },
});

export const {
  updateMatchEvent,
  setMatches,
  updateMatchInfo,
  clearAllData,
} = matchDataSlice.actions;

export default matchDataSlice.reducer;
