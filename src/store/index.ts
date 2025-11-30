import { configureStore } from '@reduxjs/toolkit';
import matchDataReducer from './matchDataSlice';
import connectionReducer from './connectionSlice';

// Middleware to persist state to localStorage
const persistMiddleware = (store: any) => (next: any) => (action: any) => {
  const result = next(action);
  const state = store.getState();

  // Persist matchData state
  if (action.type.startsWith('matchData/')) {
    try {
      localStorage.setItem('Match_Events', JSON.stringify(state.matchData.matches));
    } catch (err) {
      console.error('Failed to persist match data:', err);
    }
  }

  // Persist connection state
  if (action.type.startsWith('connection/')) {
    try {
      localStorage.setItem('FTC_URL', JSON.stringify(state.connection.ftcServerUrl));
      localStorage.setItem('FTC_Event', JSON.stringify(state.connection.selectedEvent));
      localStorage.setItem('OBS_URL', JSON.stringify(state.connection.obsUrl));
      localStorage.setItem('OBS_Port', JSON.stringify(state.connection.obsPort));
      localStorage.setItem('OBS_Password', JSON.stringify(state.connection.obsPassword));
    } catch (err) {
      console.error('Failed to persist connection state:', err);
    }
  }

  return result;
};

export const store = configureStore({
  reducer: {
    matchData: matchDataReducer,
    connection: connectionReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(persistMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
