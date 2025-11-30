import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { UpdateType, FtcMatch } from '../types/FtcLive';
import * as ftcLiveApi from '../services/ftcLiveApi';
import type { RootState } from './index';

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
  loading: boolean;
  error: string | null;
}

// Helper to convert FtcMatch to MatchRow
const ftcMatchToRow = (match: FtcMatch, existingRow?: MatchRow): MatchRow => {
  const row: MatchRow = existingRow
    ? { ...existingRow }
    : { name: match.matchName, number: match.matchNumber };

  row.number = match.matchNumber;
  row.blue1 = match.blue.team1;
  row.blue2 = match.blue.team2;
  row.blue3 = match.blue.team3;
  row.red1 = match.red.team1;
  row.red2 = match.red.team2;
  row.red3 = match.red.team3;
  row.scheduledTime = match.time;

  return row;
};

// Load initial state from localStorage
const loadState = (): MatchDataState => {
  try {
    const matches = localStorage.getItem('Match_Events');
    return {
      matches: matches ? JSON.parse(matches) : [],
      loading: false,
      error: null,
    };
  } catch {
    return { matches: [], loading: false, error: null };
  }
};

// Async thunk to fetch all matches for an event
export const fetchMatchList = createAsyncThunk(
  'matchData/fetchMatchList',
  async ({ eventCode, serverUrl }: { eventCode: string; serverUrl?: string }, { getState }) => {
    const matches = await ftcLiveApi.fetchMatches(eventCode, serverUrl);
    const state = getState() as RootState;
    const existingMatches = state.matchData.matches;

    // Merge with existing match data (preserve timestamps, recordings, etc.)
    return matches.map(match => {
      const existing = existingMatches.find(m => m.name === match.matchName);
      return ftcMatchToRow(match, existing);
    });
  }
);

// Async thunk to fetch a single match by number
export const fetchSingleMatch = createAsyncThunk(
  'matchData/fetchSingleMatch',
  async ({ eventCode, matchNumber, serverUrl }: { eventCode: string; matchNumber: number; serverUrl?: string }) => {
    const match = await ftcLiveApi.fetchMatch(eventCode, matchNumber, serverUrl);
    return match;
  }
);

// Async thunk to fetch match info if we receive an event for an unknown match
export const fetchMatchIfUnknown = createAsyncThunk(
  'matchData/fetchMatchIfUnknown',
  async (
    { eventCode, matchName, serverUrl }: { eventCode: string; matchName: string; serverUrl?: string },
    { getState }
  ) => {
    const state = getState() as RootState;
    const existingMatch = state.matchData.matches.find(m => m.name === matchName);

    // If we already have team info for this match, skip fetching
    if (existingMatch && existingMatch.blue1 !== undefined) {
      return null;
    }

    // Fetch the match info
    console.log(`Fetching info for unknown match ${matchName}`);
    const matches = await ftcLiveApi.fetchActiveMatches(eventCode, serverUrl);
    const match = matches?.find(m => m.matchName === matchName);
    if (!match) {
      return null;
    }
    return match;
  }
);

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
      state.error = null;
    },

    // Clear error
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // fetchMatchList
    builder
      .addCase(fetchMatchList.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMatchList.fulfilled, (state, action) => {
        state.loading = false;
        state.matches = action.payload;
      })
      .addCase(fetchMatchList.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch matches';
      });

    // fetchSingleMatch
    builder
      .addCase(fetchSingleMatch.fulfilled, (state, action) => {
        if (action.payload) {
          const match = action.payload;
          const existingIndex = state.matches.findIndex(m => m.name === match.matchName);
          const newRow = ftcMatchToRow(match, existingIndex !== -1 ? state.matches[existingIndex] : undefined);

          if (existingIndex !== -1) {
            state.matches[existingIndex] = newRow;
          } else {
            state.matches.push(newRow);
          }
        }
      });

    // fetchMatchIfUnknown
    builder
      .addCase(fetchMatchIfUnknown.fulfilled, (state, action) => {
        if (action.payload) {
          const match = action.payload;
          const existingIndex = state.matches.findIndex(m => m.name === match.matchName);
          const newRow = ftcMatchToRow(match, existingIndex !== -1 ? state.matches[existingIndex] : undefined);

          if (existingIndex !== -1) {
            state.matches[existingIndex] = newRow;
          } else {
            state.matches.push(newRow);
          }
        }
      });
  },
});

export const {
  updateMatchEvent,
  setMatches,
  updateMatchInfo,
  clearAllData,
  clearError,
} = matchDataSlice.actions;

// Selectors
export const selectMatches = (state: RootState) => state.matchData.matches;
export const selectMatchByName = (name: string) => (state: RootState) =>
  state.matchData.matches.find(m => m.name === name);
export const selectLoading = (state: RootState) => state.matchData.loading;
export const selectError = (state: RootState) => state.matchData.error;

export default matchDataSlice.reducer;
