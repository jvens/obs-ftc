import { configureStore } from '@reduxjs/toolkit';
import matchDataReducer from './matchDataSlice';

// Middleware to persist state to localStorage
const persistMiddleware = (store: any) => (next: any) => (action: any) => {
  const result = next(action);

  // Only persist for matchData actions
  if (action.type.startsWith('matchData/')) {
    const state = store.getState();
    try {
      localStorage.setItem('Match_Events', JSON.stringify(state.matchData.matches));
      localStorage.setItem('Recordings', JSON.stringify(state.matchData.recordings));
    } catch (err) {
      console.error('Failed to persist state:', err);
    }
  }

  return result;
};

export const store = configureStore({
  reducer: {
    matchData: matchDataReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(persistMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
