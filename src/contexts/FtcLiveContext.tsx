// src/contexts/FtcLiveContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { FtcLiveSteamData, UpdateType } from '../types/FtcLive';
import { useObsStudio } from './ObsStudioContext';
import { usePersistentState } from '../helpers/persistant';
import { trackEvent, trackFeatureEnabled, trackUserConfig, AnalyticsEvents } from '../helpers/analytics';
import { store } from '../store';
import { updateMatchEvent, updateMatchInfo, fetchMatchIfUnknown } from '../store/matchDataSlice';
import { useAppSelector } from '../store/hooks';
import { selectFtcServerUrl, selectSelectedEvent } from '../store/connectionSlice';

const MATCH_TIME_SECONDS = 158 as const; // 2:38 in seconds
const RECONNECT_INTERVAL = 10; // seconds

type FtcLiveProviderProps = {
  children: ReactNode;
};
// Start conditions for match recording
// Order matters - events come in this sequence, and we start on the selected event OR any later one
export type RecordStartCondition = 'MATCH_LOAD' | 'SHOW_PREVIEW' | 'SHOW_RANDOM' | 'SHOW_MATCH' | 'MATCH_START';
const RECORD_START_ORDER: RecordStartCondition[] = ['MATCH_LOAD', 'SHOW_PREVIEW', 'SHOW_RANDOM', 'SHOW_MATCH', 'MATCH_START'];
export const RecordStartConditions: { value: RecordStartCondition; label: string }[] = [
  { value: 'MATCH_LOAD', label: 'Match Load' },
  { value: 'SHOW_PREVIEW', label: 'Show Preview' },
  { value: 'SHOW_RANDOM', label: 'Show Random' },
  { value: 'SHOW_MATCH', label: 'Show Match' },
  { value: 'MATCH_START', label: 'Match Start' },
];

// Helper to check if an event is at or after the selected start condition
const isAtOrAfterStartCondition = (event: string, startCondition: RecordStartCondition): boolean => {
  const eventIndex = RECORD_START_ORDER.indexOf(event as RecordStartCondition);
  const conditionIndex = RECORD_START_ORDER.indexOf(startCondition);
  // If event is not in the start order list, it's not a valid start trigger
  if (eventIndex === -1) return false;
  // Event is valid if it's at or after the configured start condition
  return eventIndex >= conditionIndex;
};

// Stop conditions for match recording
// 'MATCH_END' is a virtual event triggered MATCH_TIME_SECONDS after MATCH_START
export type RecordStopCondition = 'MATCH_END' | 'MATCH_COMMIT' | 'MATCH_POST';
export const RecordStopConditions: { value: RecordStopCondition; label: string }[] = [
  { value: 'MATCH_END', label: 'Match End' },
  { value: 'MATCH_COMMIT', label: 'Match Commit' },
  { value: 'MATCH_POST', label: 'Match Post' },
];

// Define the context data types
interface FtcLiveContextData {
  isConnected: boolean;
  connectWebSocket: (connect: boolean) => void;
  transitionTriggers: UpdateType[];
  setTransitionTriggers: React.Dispatch<React.SetStateAction<UpdateType[]>>;
  postMatchReplayTime: number;
  setPostMatchReplayTime: React.Dispatch<React.SetStateAction<number>>;
  enableReplayBuffer: boolean;
  setEnableReplayBuffer: React.Dispatch<React.SetStateAction<boolean>>;
  isRecordingReplay: boolean;
  currentRecordingMatch: string | null;
  // Match recording settings
  enableMatchRecording: boolean;
  setEnableMatchRecording: React.Dispatch<React.SetStateAction<boolean>>;
  recordStartCondition: RecordStartCondition;
  setRecordStartCondition: React.Dispatch<React.SetStateAction<RecordStartCondition>>;
  recordStopCondition: RecordStopCondition;
  setRecordStopCondition: React.Dispatch<React.SetStateAction<RecordStopCondition>>;
  recordStopDelay: number;
  setRecordStopDelay: React.Dispatch<React.SetStateAction<number>>;
  // Screenshot settings
  enableScreenshots: boolean;
  setEnableScreenshots: React.Dispatch<React.SetStateAction<boolean>>;
  screenshotPreviewDelay: number;
  setScreenshotPreviewDelay: React.Dispatch<React.SetStateAction<number>>;
  screenshotRandomDelay: number;
  setScreenshotRandomDelay: React.Dispatch<React.SetStateAction<number>>;
  screenshotResultDelay: number;
  setScreenshotResultDelay: React.Dispatch<React.SetStateAction<number>>;
  // Auto-reconnect state
  isReconnecting: boolean;
  reconnectCountdown: number;
  cancelReconnect: () => void;
}

// Create the context
export const FtcLiveContext = createContext<FtcLiveContextData>({} as FtcLiveContextData);

// Create a custom hook to use the WebSocket context
export const useFtcLive = () => {
  return useContext(FtcLiveContext);
};

// WebSocketProvider component that will wrap your application or part of it
export const FtcLiveProvider: React.FC<FtcLiveProviderProps> = ({ children }) => {
  const { setActiveField, setRecording, saveReplayBuffer, takeScreenshot } = useObsStudio();

  // Redux state for connection settings
  const serverUrl = useAppSelector(selectFtcServerUrl);
  const selectedEvent = useAppSelector(selectSelectedEvent);

  const [isConnected, setConnected] = useState<boolean>(false);
  const [socket, setSocket] = useState<WebSocket | undefined>();
  const [transitionTriggers, setTransitionTriggers] = usePersistentState<UpdateType[]>('Selected_Trigers', ['SHOW_PREVIEW', 'SHOW_MATCH', 'SHOW_RANDOM', 'MATCH_START', 'MATCH_POST']);

  // Auto-reconnect state
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const userDisconnectedRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const connectWebSocketRef = useRef<(connect: boolean) => void>(() => {});

  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsReconnecting(false);
    setReconnectCountdown(0);
  }, []);

  const startReconnectTimer = useCallback(() => {
    // Clear any existing timers
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    setIsReconnecting(true);
    setReconnectCountdown(RECONNECT_INTERVAL);

    // Start countdown
    countdownTimerRef.current = setInterval(() => {
      setReconnectCountdown(prev => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Schedule reconnect attempt
    reconnectTimerRef.current = setTimeout(() => {
      console.log('Attempting to reconnect to FTC Live...');
      connectWebSocketRef.current(true);
    }, RECONNECT_INTERVAL * 1000);
  }, []);

  // Match recording settings (simplified from previous checkbox-based approach)
  const [enableMatchRecording, setEnableMatchRecording] = usePersistentState<boolean>('Enable_Match_Recording', false);
  const [recordStartCondition, setRecordStartCondition] = usePersistentState<RecordStartCondition>('Record_Start_Condition', 'SHOW_PREVIEW');
  const [recordStopCondition, setRecordStopCondition] = usePersistentState<RecordStopCondition>('Record_Stop_Condition', 'MATCH_POST');
  const [recordStopDelay, setRecordStopDelay] = usePersistentState<number>('Record_Stop_Delay', 15);

  // Screenshot settings
  const [enableScreenshots, setEnableScreenshots] = usePersistentState<boolean>('Enable_Screenshots', true);
  const [screenshotPreviewDelay, setScreenshotPreviewDelay] = usePersistentState<number>('Screenshot_Preview_Delay', 1500);
  const [screenshotRandomDelay, setScreenshotRandomDelay] = usePersistentState<number>('Screenshot_Random_Delay', 1500);
  const [screenshotResultDelay, setScreenshotResultDelay] = usePersistentState<number>('Screenshot_Result_Delay', 11000);

  const replayBufferTime = useRef<NodeJS.Timeout | null>(null);
  const [postMatchReplayTime, setPostMatchReplayTime] = useState<number>(15);
  const [enableReplayBuffer, setEnableReplayBuffer] = useState<boolean>(true);
  const [recordingMatch, setRecordingMatch] = useState<string | null>(null);
  const [isRecordingReplay, setIsRecordingReplay] = useState<boolean>(false);

  const recordingMatchRef = useRef<string | null>(null);
  const replayRecordingMatchRef = useRef<string | null>(null);
  const matchEndTimer = useRef<NodeJS.Timeout | null>(null);
  const transitionTriggersRef = useRef<UpdateType[]>(transitionTriggers);
  const recordStartConditionRef = useRef<RecordStartCondition>(recordStartCondition);
  const recordStopConditionRef = useRef<RecordStopCondition>(recordStopCondition);
  const recordStopDelayRef = useRef<number>(recordStopDelay);
  const enableMatchRecordingRef = useRef<boolean>(enableMatchRecording);
  const enableReplayBufferRef = useRef<boolean>(enableReplayBuffer);
  const postMatchReplayTimeRef = useRef<number>(postMatchReplayTime);
  const enableScreenshotsRef = useRef<boolean>(enableScreenshots);
  const screenshotPreviewDelayRef = useRef<number>(screenshotPreviewDelay);
  const screenshotRandomDelayRef = useRef<number>(screenshotRandomDelay);
  const screenshotResultDelayRef = useRef<number>(screenshotResultDelay);

  useEffect(() => {
    transitionTriggersRef.current = transitionTriggers;
    recordStartConditionRef.current = recordStartCondition;
    recordStopConditionRef.current = recordStopCondition;
    recordStopDelayRef.current = recordStopDelay;
    enableMatchRecordingRef.current = enableMatchRecording;
    enableReplayBufferRef.current = enableReplayBuffer;
    postMatchReplayTimeRef.current = postMatchReplayTime;
    enableScreenshotsRef.current = enableScreenshots;
    screenshotPreviewDelayRef.current = screenshotPreviewDelay;
    screenshotRandomDelayRef.current = screenshotRandomDelay;
    screenshotResultDelayRef.current = screenshotResultDelay;
  }, [transitionTriggers, recordStartCondition, recordStopCondition, recordStopDelay, enableMatchRecording, enableReplayBuffer, postMatchReplayTime, enableScreenshots, screenshotPreviewDelay, screenshotRandomDelay, screenshotResultDelay]);

  // Track feature toggles
  useEffect(() => {
    trackFeatureEnabled('replay_buffer', enableReplayBuffer);
  }, [enableReplayBuffer]);

  useEffect(() => {
    trackFeatureEnabled('match_recording', enableMatchRecording);
  }, [enableMatchRecording]);

  useEffect(() => {
    trackFeatureEnabled('screenshots', enableScreenshots);
  }, [enableScreenshots]);

  const saveOffReplayBuffer = useCallback(async (matchName: string) => {
    replayBufferTime.current = null;
    setIsRecordingReplay(false);
    console.log('Stopping replay buffer');
    const file = await saveReplayBuffer();
    console.log(`Replay buffer saved for match ${matchName}: ${file}`);
    store.dispatch(updateMatchInfo({
      name: matchName,
      replayFile: file,
    }));
  }, [saveReplayBuffer]);

  const onFtcEvent = useCallback(async (streamData: FtcLiveSteamData) => {
    console.log('Selected Event:', streamData);
    console.log('Websocket Message: ', streamData)

    // Dispatch to Redux store
    store.dispatch(updateMatchEvent({
      shortName: streamData.payload.shortName,
      number: streamData.payload.number,
      updateType: streamData.updateType,
      updateTime: streamData.updateTime,
    }));

    // Auto-fetch match info if we don't have it yet
    const connectionState = store.getState().connection;
    if (connectionState.selectedEvent?.eventCode) {
      console.log('Fetching match info for', streamData.payload.shortName);
      store.dispatch(fetchMatchIfUnknown({
        eventCode: connectionState.selectedEvent.eventCode,
        matchName: streamData.payload.shortName,
        serverUrl: connectionState.ftcServerUrl,
      }) as any);
    } else {
      console.warn('No selected event code in connection state, cannot fetch match info');
    }

    if (transitionTriggersRef.current.some(trigger => trigger === streamData.updateType)) {
      console.log('Set the active field')
      setActiveField(streamData.payload.field)
    } else {
      console.log('Event was not in the selected triggers list:', streamData.updateType)
    }

    // Screenshot logic
    if (enableScreenshotsRef.current) {
      const eventCode = connectionState.selectedEvent?.eventCode ?? '';
      const filePrefix = eventCode ? `${eventCode}_` : '';

      if (streamData.updateType === 'SHOW_PREVIEW') {
        setTimeout(async () => {
          const fileName = `${filePrefix}${streamData.payload.shortName}_preview.png`;
          const file = await takeScreenshot(fileName, streamData.payload.field);
          store.dispatch(updateMatchInfo({
            name: streamData.payload.shortName,
            previewScreenshot: file,
          }));
        }, screenshotPreviewDelayRef.current);
      } else if (streamData.updateType === 'SHOW_RANDOM') {
        setTimeout(async () => {
          const fileName = `${filePrefix}${streamData.payload.shortName}_random.png`;
          const file = await takeScreenshot(fileName, streamData.payload.field);
          store.dispatch(updateMatchInfo({
            name: streamData.payload.shortName,
            randomScreenshot: file,
          }));
        }, screenshotRandomDelayRef.current);
      } else if (streamData.updateType === 'MATCH_POST') {
        setTimeout(async () => {
          const fileName = `${filePrefix}${streamData.payload.shortName}_score.png`;
          const file = await takeScreenshot(fileName, streamData.payload.field);
          store.dispatch(updateMatchInfo({
            name: streamData.payload.shortName,
            scoreScreenshot: file,
          }));
        }, screenshotResultDelayRef.current);
      }
    }

    // Replay buffer logic
    if (enableReplayBufferRef.current) {
      if (streamData.updateType === 'MATCH_START') {
        if (replayBufferTime.current) {
          await saveOffReplayBuffer(replayRecordingMatchRef.current ?? 'Unknown');
          clearTimeout(replayBufferTime.current);
          replayBufferTime.current = null;
        }
        console.log('Starting replay buffer');
        replayRecordingMatchRef.current = streamData.payload.shortName;
        setRecordingMatch(streamData.payload.shortName);
        setIsRecordingReplay(true);
        replayBufferTime.current = setTimeout(async () => {
          await saveOffReplayBuffer(streamData.payload.shortName);
        }, (MATCH_TIME_SECONDS + postMatchReplayTimeRef.current) * 1000);
      }
      else if (streamData.updateType === 'MATCH_ABORT') {
        if (replayBufferTime.current) {
          clearTimeout(replayBufferTime.current);
          replayBufferTime.current = null;
          setIsRecordingReplay(false);
        }
        console.log('Cancel replay buffer');
      }
    }

    // Match recording logic
    if (enableMatchRecordingRef.current) {
      const doStopRecording = async () => {
        const path = await setRecording(false);
        if (recordingMatchRef.current !== null) {
          const match = recordingMatchRef.current;
          recordingMatchRef.current = null;
          if (path) {
            store.dispatch(updateMatchInfo({
              name: match,
              recordingFile: path,
            }));
          }
        }
        if (matchEndTimer.current) {
          clearTimeout(matchEndTimer.current);
          matchEndTimer.current = null;
        }
      };

      // Check if this event is at or after the start condition (and we haven't already started)
      // This handles cases where an earlier event in the sequence was missed
      if (recordingMatchRef.current === null &&
          isAtOrAfterStartCondition(streamData.updateType, recordStartConditionRef.current)) {
        console.log(`Start recording (match recording) on ${streamData.updateType}`);
        setRecording(true);
        recordingMatchRef.current = streamData.payload.shortName;
      }

      // Handle MATCH_START for MATCH_END stop condition (timer-based)
      if (streamData.updateType === 'MATCH_START' && recordStopConditionRef.current === 'MATCH_END') {
        // Set up timer to stop recording at match end + delay
        const stopTime = (MATCH_TIME_SECONDS + recordStopDelayRef.current) * 1000;
        console.log(`Will stop recording in ${stopTime / 1000} seconds (match end + delay)`);
        matchEndTimer.current = setTimeout(doStopRecording, stopTime);
      }

      // Handle MATCH_ABORT - cancel any pending stop timer and stop immediately
      if (streamData.updateType === 'MATCH_ABORT') {
        if (matchEndTimer.current) {
          clearTimeout(matchEndTimer.current);
          matchEndTimer.current = null;
        }
        console.log('Match aborted, stopping recording');
        await doStopRecording();
      }

      // Check if this event matches the stop condition (for non-MATCH_END conditions)
      if (recordStopConditionRef.current !== 'MATCH_END' &&
          streamData.updateType === recordStopConditionRef.current) {
        const delay = recordStopDelayRef.current;
        if (delay > 0) {
          console.log(`Stop recording in ${delay} seconds`);
          setTimeout(doStopRecording, delay * 1000);
        } else {
          console.log('Stop recording');
          await doStopRecording();
        }
      }
    }
  }, [setActiveField, takeScreenshot, saveOffReplayBuffer, setRecording]);

  // The function to connect the WebSocket and handle messages
  const connectWebSocket = useCallback((connect: boolean) => {
    if (selectedEvent && connect) {
      // Cancel any pending reconnect when manually connecting
      cancelReconnect();
      userDisconnectedRef.current = false;

      const newSocket = new WebSocket(`ws://${serverUrl}/api/v2/stream/?code=${selectedEvent.eventCode}`);
      setSocket(newSocket)

      newSocket.onopen = () => {
        console.log('WebSocket connected');
        wasConnectedRef.current = true;
        setConnected(true);
        trackEvent(AnalyticsEvents.FTC_LIVE_CONNECTED);
        // Track user configuration when connected
        trackUserConfig({
          replayBufferEnabled: enableReplayBufferRef.current,
          matchRecordingEnabled: enableMatchRecordingRef.current,
          screenshotsEnabled: enableScreenshotsRef.current,
          transitionTriggersCount: transitionTriggersRef.current.length,
        });
      };

      newSocket.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);

        // Only auto-reconnect if user didn't manually disconnect and we were previously connected
        if (!userDisconnectedRef.current && wasConnectedRef.current) {
          console.log('FTC Live connection lost unexpectedly, will attempt to reconnect...');
          startReconnectTimer();
        }
      };

      newSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      newSocket.onmessage = (message) => {
        const data = message.data;
        if (data === 'pong') return; // ignore pong messages

        const streamData = JSON.parse(data) as FtcLiveSteamData;
        onFtcEvent(streamData);
      }
    } else if (!connect) {
      // Mark as user-initiated disconnect to prevent auto-reconnect
      userDisconnectedRef.current = true;
      wasConnectedRef.current = false;
      cancelReconnect();

      socket?.close();
      setConnected(false);
    }
  }, [selectedEvent, serverUrl, onFtcEvent, socket, cancelReconnect, startReconnectTimer]);

  // Keep ref updated for use in timer callback
  useEffect(() => {
    connectWebSocketRef.current = connectWebSocket;
  }, [connectWebSocket]);

  // Provide the context value to children
  return (
    <FtcLiveContext.Provider value={{
      connectWebSocket, isConnected,
      transitionTriggers, setTransitionTriggers,
      postMatchReplayTime, setPostMatchReplayTime,
      enableReplayBuffer, setEnableReplayBuffer,
      isRecordingReplay, currentRecordingMatch: recordingMatch,
      enableMatchRecording, setEnableMatchRecording,
      recordStartCondition, setRecordStartCondition,
      recordStopCondition, setRecordStopCondition,
      recordStopDelay, setRecordStopDelay,
      enableScreenshots, setEnableScreenshots,
      screenshotPreviewDelay, setScreenshotPreviewDelay,
      screenshotRandomDelay, setScreenshotRandomDelay,
      screenshotResultDelay, setScreenshotResultDelay,
      isReconnecting, reconnectCountdown, cancelReconnect
    }}>
      {children}
    </FtcLiveContext.Provider>
  );
};
