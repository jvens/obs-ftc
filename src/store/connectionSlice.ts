import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Event } from '../types/FtcLive';
import type { RootState } from './index';

export interface ConnectionState {
  // FTC Live connection
  ftcServerUrl: string;
  selectedEvent: Event | null;

  // OBS connection
  obsUrl: string;
  obsPort: number;
  obsPassword: string;
}

// Load initial state from localStorage
const loadState = (): ConnectionState => {
  try {
    const ftcUrl = localStorage.getItem('FTC_URL');
    const ftcEvent = localStorage.getItem('FTC_Event');
    const obsUrl = localStorage.getItem('OBS_URL');
    const obsPort = localStorage.getItem('OBS_Port');
    const obsPassword = localStorage.getItem('OBS_Password');

    return {
      ftcServerUrl: ftcUrl ? JSON.parse(ftcUrl) : 'localhost',
      selectedEvent: ftcEvent ? JSON.parse(ftcEvent) : null,
      obsUrl: obsUrl ? JSON.parse(obsUrl) : 'localhost',
      obsPort: obsPort ? JSON.parse(obsPort) : 4455,
      obsPassword: obsPassword ? JSON.parse(obsPassword) : '',
    };
  } catch {
    return {
      ftcServerUrl: 'localhost',
      selectedEvent: null,
      obsUrl: 'localhost',
      obsPort: 4455,
      obsPassword: '',
    };
  }
};

const initialState: ConnectionState = loadState();

const connectionSlice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    setFtcServerUrl(state, action: PayloadAction<string>) {
      state.ftcServerUrl = action.payload;
    },
    setSelectedEvent(state, action: PayloadAction<Event | null>) {
      state.selectedEvent = action.payload;
    },
    setObsUrl(state, action: PayloadAction<string>) {
      state.obsUrl = action.payload;
    },
    setObsPort(state, action: PayloadAction<number>) {
      state.obsPort = action.payload;
    },
    setObsPassword(state, action: PayloadAction<string>) {
      state.obsPassword = action.payload;
    },
  },
});

export const {
  setFtcServerUrl,
  setSelectedEvent,
  setObsUrl,
  setObsPort,
  setObsPassword,
} = connectionSlice.actions;

// Selectors
export const selectFtcServerUrl = (state: RootState) => state.connection.ftcServerUrl;
export const selectSelectedEvent = (state: RootState) => state.connection.selectedEvent;
export const selectObsUrl = (state: RootState) => state.connection.obsUrl;
export const selectObsPort = (state: RootState) => state.connection.obsPort;
export const selectObsPassword = (state: RootState) => state.connection.obsPassword;

export default connectionSlice.reducer;
