// src/contexts/FtcLiveContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { Result, ResultAsync } from 'neverthrow';
import { FtcLiveSteamData, UpdateType } from '../types/FtcLive';
import { useObsStudio } from './ObsStudioContext';
import { usePersistentState } from '../helpers/persistant';
import { trackEvent, trackFeatureEnabled, trackUserConfig, AnalyticsEvents } from '../helpers/analytics';
import { store } from '../store';
import { updateMatchEvent, updateMatchInfo, fetchMatchIfUnknown } from '../store/matchDataSlice';
import { useAppSelector } from '../store/hooks';
import { selectFtcServerUrl, selectSelectedEvent, setSelectedEvent } from '../store/connectionSlice';
import { fetchEvent } from '../services/ftcLiveApi';
import { MatchController, RecordStartCondition, RecordStopCondition, createMatchController } from '../ftcLive/matchController';

const RECONNECT_INTERVAL = 10; // seconds

type FtcLiveProviderProps = {
  children: ReactNode;
};
// When to start and stop recording each match (see ../ftcLive/matchController.ts).
export type { RecordStartCondition, RecordStopCondition } from '../ftcLive/matchController';
export const RecordStartConditions: { value: RecordStartCondition; label: string }[] = [
  { value: 'MATCH_LOAD', label: 'Match Load' },
  { value: 'SHOW_PREVIEW', label: 'Show Preview' },
  { value: 'SHOW_RANDOM', label: 'Show Random' },
  { value: 'SHOW_MATCH', label: 'Show Match' },
  { value: 'MATCH_START', label: 'Match Start' },
];

export const RecordStopConditions: { value: RecordStopCondition; label: string }[] = [
  { value: 'MATCH_END', label: 'Match End' },
  { value: 'MATCH_COMMIT', label: 'Match Commit' },
  { value: 'MATCH_POST', label: 'Match Post' },
];

// Define the context data types
interface FtcLiveContextData {
  isConnected: boolean;
  // The last attempt to open the match event stream failed before it opened.
  connectionFailed: boolean;
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
  const [connectionFailed, setConnectionFailed] = useState(false);
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

  const [postMatchReplayTime, setPostMatchReplayTime] = usePersistentState<number>('Replay_PostMatchTime', 15);
  const [enableReplayBuffer, setEnableReplayBuffer] = usePersistentState<boolean>('Replay_Enabled', true);
  const [recordingMatch, setRecordingMatch] = useState<string | null>(null);
  const [isRecordingReplay, setIsRecordingReplay] = useState<boolean>(false);

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

  // The latest OBS actions, for the match controller, which outlives renders.
  const obsActions = useRef({ setActiveField, setRecording, saveReplayBuffer, takeScreenshot });
  obsActions.current = { setActiveField, setRecording, saveReplayBuffer, takeScreenshot };
  const controller = useRef<MatchController | null>(null);
  if (!controller.current)
    controller.current = createMatchController(
      () => ({
        transitionTriggers: transitionTriggersRef.current,
        enableScreenshots: enableScreenshotsRef.current,
        screenshotPreviewDelay: screenshotPreviewDelayRef.current,
        screenshotRandomDelay: screenshotRandomDelayRef.current,
        screenshotResultDelay: screenshotResultDelayRef.current,
        enableReplayBuffer: enableReplayBufferRef.current,
        postMatchReplayTime: postMatchReplayTimeRef.current,
        enableMatchRecording: enableMatchRecordingRef.current,
        recordStartCondition: recordStartConditionRef.current,
        recordStopCondition: recordStopConditionRef.current,
        recordStopDelay: recordStopDelayRef.current,
      }),
      () => store.getState().connection.selectedEvent?.eventCode ?? '',
      {
        setActiveField: field => obsActions.current.setActiveField(field),
        setRecording: start => obsActions.current.setRecording(start),
        saveReplayBuffer: () => obsActions.current.saveReplayBuffer(),
        takeScreenshot: (fileName, field) => obsActions.current.takeScreenshot(fileName, field),
        matchEvent: streamData => {
          store.dispatch(updateMatchEvent({
            shortName: streamData.payload.shortName,
            number: streamData.payload.number,
            updateType: streamData.updateType,
            updateTime: streamData.updateTime,
            field: streamData.payload.field,
          }));
          // Fetch the match's teams if we don't have them yet.
          const connectionState = store.getState().connection;
          if (connectionState.selectedEvent?.eventCode)
            store.dispatch(fetchMatchIfUnknown({
              eventCode: connectionState.selectedEvent.eventCode,
              matchName: streamData.payload.shortName,
              serverUrl: connectionState.ftcServerUrl,
            }) as any);
          else
            console.warn('No selected event code in connection state, cannot fetch match info');
        },
        matchInfo: info => store.dispatch(updateMatchInfo(info)),
        replayHolding: match => {
          if (match !== undefined) setRecordingMatch(match);
          setIsRecordingReplay(match !== undefined);
        },
      });
  useEffect(() => () => controller.current?.dispose(), []);

  const onFtcEvent = useCallback((streamData: FtcLiveSteamData) => controller.current!.handle(streamData), []);

  // The function to connect the WebSocket and handle messages
  const connectWebSocket = useCallback((connect: boolean) => {
    if (selectedEvent && connect) {
      // Cancel any pending reconnect when manually connecting
      cancelReconnect();
      userDisconnectedRef.current = false;

      // The saved event is a snapshot from when it was picked; refresh it so changes made
      // in FTC Live since then (such as the field count) are picked up on every connect.
      const eventCode = selectedEvent.eventCode;
      ResultAsync.fromPromise(fetchEvent(eventCode, serverUrl), error => error).match(
        event => {
          if (store.getState().connection.selectedEvent?.eventCode === eventCode) {
            store.dispatch(setSelectedEvent(event));
          }
        },
        error => console.error(`Refreshing event ${eventCode} failed:`, error),
      );

      // Some browsers refuse ws:// from an HTTPS page by throwing rather than failing to connect.
      const opened = Result.fromThrowable(
        () => new WebSocket(`ws://${serverUrl}/api/v2/stream/?code=${selectedEvent.eventCode}`),
        error => error,
      )();
      if (opened.isErr()) {
        console.error('Unable to open the FTC Live stream:', opened.error);
        setConnectionFailed(true);
        return;
      }
      const newSocket = opened.value;
      setSocket(newSocket)
      let didOpen = false;

      newSocket.onopen = () => {
        console.log('WebSocket connected');
        didOpen = true;
        setConnectionFailed(false);
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
        if (!didOpen) setConnectionFailed(true);

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
      connectWebSocket, isConnected, connectionFailed,
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
