import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAnalytics, logEvent, Analytics, setUserProperties } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyBAAbAnDDgM_9BjitIE7ZNQKovJIA52ZFo",
  authDomain: "obs-ftc.firebaseapp.com",
  projectId: "obs-ftc",
  storageBucket: "obs-ftc.firebasestorage.app",
  messagingSenderId: "476285717416",
  appId: "1:476285717416:web:5c6783a81fc561f092eb9d",
  measurementId: "G-G4X48ZBQ0Z"
};

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;

// Initialize Firebase and Analytics
export const initializeAnalytics = (): void => {
  try {
    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    console.log('Firebase Analytics initialized');
  } catch (error) {
    console.error('Failed to initialize Firebase Analytics:', error);
  }
};

// Track page views
export const trackPageView = (pageName: string): void => {
  if (!analytics) return;
  logEvent(analytics, 'page_view', {
    page_title: pageName,
    page_location: window.location.href,
  });
};

// Track feature toggle (enabled/disabled)
export const trackFeatureEnabled = (feature: string, enabled: boolean): void => {
  if (!analytics) return;
  logEvent(analytics, 'feature_toggle', {
    feature_name: feature,
    enabled: enabled,
  });
};

// Track connection events
export const AnalyticsEvents = {
  FTC_LIVE_CONNECTED: 'ftc_live_connected',
  OBS_CONNECTED: 'obs_connected',
} as const;

export type AnalyticsEventName = typeof AnalyticsEvents[keyof typeof AnalyticsEvents];

// Generic event tracking
export const trackEvent = (eventName: AnalyticsEventName): void => {
  if (!analytics) return;
  logEvent(analytics, eventName);
};

// Track user configuration (for understanding usage patterns)
// This sets user properties that persist across sessions
export const trackUserConfig = (config: {
  replayBufferEnabled?: boolean;
  matchRecordingEnabled?: boolean;
  screenshotsEnabled?: boolean;
  transitionTriggersCount?: number;
}): void => {
  if (!analytics) return;
  setUserProperties(analytics, {
    uses_replay_buffer: config.replayBufferEnabled?.toString() || 'unknown',
    uses_match_recording: config.matchRecordingEnabled?.toString() || 'unknown',
    uses_screenshots: config.screenshotsEnabled?.toString() || 'unknown',
    transition_triggers_count: config.transitionTriggersCount?.toString() || 'unknown',
  });
};
