// src/contexts/FtcLiveContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { Event, FtcLiveSteamData, UpdateType } from '../types/FtcLive';
import { useObsStudio } from './ObsStudioContext';
import { usePersistentState } from '../helpers/persistant';

const MATCH_TIME_SECONDS = 158 as const; // 2:38 in seconds

type FtcLiveProviderProps = {
  children: ReactNode;
};

type Recording = {
  recording?: string;
  replay?: string;
  preview?: string;
  random?: string;
  score?: string;
}
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
  serverUrl: string;
  setServerUrl: React.Dispatch<React.SetStateAction<string>>;
  selectedEvent?: Event;
  setSelectedEvent: React.Dispatch<React.SetStateAction<Event|undefined>>;
  isConnected: boolean;
  allStreamData: FtcLiveSteamData[];
  latestStreamData?: FtcLiveSteamData;
  connectWebSocket: (connect: boolean) => void;
  transitionTriggers: UpdateType[];
  setTransitionTriggers: React.Dispatch<React.SetStateAction<UpdateType[]>>;
  postMatchReplayTime: number;
  setPostMatchReplayTime: React.Dispatch<React.SetStateAction<number>>;
  enableReplayBuffer: boolean;
  setEnableReplayBuffer: React.Dispatch<React.SetStateAction<boolean>>;
  recordings: Record<string, Recording>;
  clearRecordings: () => void;
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
  const [serverUrl, setServerUrl] = usePersistentState<string>('FTC_URL', 'localhost');
  const [selectedEvent, setSelectedEvent] = usePersistentState<Event | undefined>('FTC_Event', undefined);
  const [allStreamData, setAllStreamData] = usePersistentState<FtcLiveSteamData[]>('Socket_Messages', []);
  const [latestStreamData, setLatestStreamData] = useState<FtcLiveSteamData | undefined>();
  const [isConnected, setConnected] = useState<boolean>(false);
  const [socket, setSocket] = useState<WebSocket | undefined>();
  const [transitionTriggers, setTransitionTriggers] = usePersistentState<UpdateType[]>('Selected_Trigers', ['SHOW_PREVIEW', 'SHOW_MATCH', 'SHOW_RANDOM', 'MATCH_START', 'MATCH_POST']);

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
  const [savedRecordings, setSavedRecordings] = usePersistentState<string>('Recordings', JSON.stringify({}));
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [recordingsLoaded, setRecordingsLoaded] = useState<boolean>(false);

  const recordingMatchRef = useRef<string | null>(null);
  const matchEndTimer = useRef<NodeJS.Timeout | null>(null);
  const recordStopConditionRef = useRef<RecordStopCondition>(recordStopCondition);
  const recordStopDelayRef = useRef<number>(recordStopDelay);
  const enableMatchRecordingRef = useRef<boolean>(enableMatchRecording);
  const enableScreenshotsRef = useRef<boolean>(enableScreenshots);
  const screenshotPreviewDelayRef = useRef<number>(screenshotPreviewDelay);
  const screenshotRandomDelayRef = useRef<number>(screenshotRandomDelay);
  const screenshotResultDelayRef = useRef<number>(screenshotResultDelay);

  useEffect(() => {
    recordStopConditionRef.current = recordStopCondition;
    recordStopDelayRef.current = recordStopDelay;
    enableMatchRecordingRef.current = enableMatchRecording;
    enableScreenshotsRef.current = enableScreenshots;
    screenshotPreviewDelayRef.current = screenshotPreviewDelay;
    screenshotRandomDelayRef.current = screenshotRandomDelay;
    screenshotResultDelayRef.current = screenshotResultDelay;
  }, [recordStopCondition, recordStopDelay, enableMatchRecording, enableScreenshots, screenshotPreviewDelay, screenshotRandomDelay, screenshotResultDelay]);

  useEffect(() => {
    if ( !recordingsLoaded ) {
      setRecordings(JSON.parse(savedRecordings));
      setRecordingsLoaded(true);
    }
  }, [savedRecordings, recordingsLoaded, setRecordings]);

  useEffect(() => {
    if (Object.keys(recordings).length > 0) {
      setSavedRecordings(JSON.stringify(recordings));
    }
  }, [recordings, setSavedRecordings]);

  const saveOffReplayBuffer = useCallback(async (matchName: string) => {
    replayBufferTime.current = null;
    setIsRecordingReplay(false);
    console.log('Stopping replay buffer');
    const file = await saveReplayBuffer();
    console.log(`Replay buffer saved for match ${matchName}: ${file}`);
    setRecordings((prevRecordings) => {
      const newRecording = prevRecordings[matchName] || { };
      newRecording.replay = file;
      return { ...prevRecordings, [matchName]: newRecording };
    });
  }, [saveReplayBuffer, setRecordings]);

  const onFtcEvent = useCallback(async (streamData: FtcLiveSteamData) => {
    console.log('Selected Event:', streamData);
    console.log('Websocket Message: ', streamData)
    setAllStreamData(prevMessages => [...prevMessages, streamData]);
    setLatestStreamData(streamData);
    console.log('Selected Triggers:', transitionTriggers)
    if (transitionTriggers.some(trigger => trigger === streamData.updateType)) {
      console.log('Set the active field')
      setActiveField(streamData.payload.field)
    } else {
      console.log('Event was not in the selected triggers list:', streamData.updateType)
    }

    // Screenshot logic
    if (enableScreenshotsRef.current) {
      if (streamData.updateType === 'SHOW_PREVIEW') {
        setTimeout(async () => {
          const fileName = `${streamData.payload.shortName}_preview.png`;
          const file = await takeScreenshot(fileName, streamData.payload.field);
          setRecordings((prevRecordings) => {
            const newRecording = prevRecordings[streamData.payload.shortName] || { };
            newRecording.preview = file;
            return { ...prevRecordings, [streamData.payload.shortName]: newRecording };
          });
        }, screenshotPreviewDelayRef.current);
      } else if (streamData.updateType === 'SHOW_RANDOM') {
        setTimeout(async () => {
          const fileName = `${streamData.payload.shortName}_random.png`;
          const file = await takeScreenshot(fileName, streamData.payload.field);
          setRecordings((prevRecordings) => {
            const newRecording = prevRecordings[streamData.payload.shortName] || { };
            newRecording.random = file;
            return { ...prevRecordings, [streamData.payload.shortName]: newRecording };
          });
        }, screenshotRandomDelayRef.current);
      } else if (streamData.updateType === 'MATCH_POST') {
        setTimeout(async () => {
          const fileName = `${streamData.payload.shortName}_score.png`;
          const file = await takeScreenshot(fileName, streamData.payload.field);
          setRecordings((prevRecordings) => {
            const newRecording = prevRecordings[streamData.payload.shortName] || { };
            newRecording.score = file;
            return { ...prevRecordings, [streamData.payload.shortName]: newRecording };
          });
        }, screenshotResultDelayRef.current);
      }
    }

    if (enableReplayBuffer) {
      if (streamData.updateType === 'MATCH_START') {
        if (replayBufferTime.current) {
          await saveOffReplayBuffer(recordingMatch ?? 'Unknown');
          clearTimeout(replayBufferTime.current);
          replayBufferTime.current = null;
        }
        console.log('Starting replay buffer');
        setRecordingMatch(streamData.payload.shortName);
        setIsRecordingReplay(true);
        replayBufferTime.current = setTimeout(async () => {
          await saveOffReplayBuffer(streamData.payload.shortName);
        }, (MATCH_TIME_SECONDS + postMatchReplayTime) * 1000);
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
          setRecordings((prevRecordings) => {
            const newRecording = prevRecordings[match] || {};
            newRecording.recording = path;
            return { ...prevRecordings, [match]: newRecording };
          });
        }
        if (matchEndTimer.current) {
          clearTimeout(matchEndTimer.current);
          matchEndTimer.current = null;
        }
      };

      // Check if this event is at or after the start condition (and we haven't already started)
      // This handles cases where an earlier event in the sequence was missed
      if (recordingMatchRef.current === null &&
          isAtOrAfterStartCondition(streamData.updateType, recordStartCondition)) {
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
  }, [setAllStreamData, transitionTriggers, enableReplayBuffer, recordStartCondition, setActiveField, takeScreenshot, postMatchReplayTime, saveOffReplayBuffer, recordingMatch, setRecording]);

  // The function to connect the WebSocket and handle messages
  const connectWebSocket = useCallback((connect: boolean) => {
    if (selectedEvent && connect) {
      const socket = new WebSocket(`ws://${serverUrl}/api/v2/stream/?code=${selectedEvent.eventCode}`);
      setSocket(socket)

      socket.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
      };

      socket.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      socket.onmessage = (message) => {
        const data = message.data;
        if (data === 'pong') return; // ignore pong messages

        const streamData = JSON.parse(data) as FtcLiveSteamData;
        onFtcEvent(streamData);
      }
    } else if (!connect) {
      socket?.close();
      setConnected(false);
    }
  }, [selectedEvent, serverUrl, onFtcEvent, socket]);

  // Provide the context value to children
  return (
    <FtcLiveContext.Provider value={{
      serverUrl, setServerUrl,
      selectedEvent, setSelectedEvent,
      allStreamData, connectWebSocket, isConnected, latestStreamData,
      transitionTriggers, setTransitionTriggers,
      postMatchReplayTime, setPostMatchReplayTime,
      enableReplayBuffer, setEnableReplayBuffer,
      recordings, clearRecordings: () => setRecordings({}),
      isRecordingReplay, currentRecordingMatch: recordingMatch,
      enableMatchRecording, setEnableMatchRecording,
      recordStartCondition, setRecordStartCondition,
      recordStopCondition, setRecordStopCondition,
      recordStopDelay, setRecordStopDelay,
      enableScreenshots, setEnableScreenshots,
      screenshotPreviewDelay, setScreenshotPreviewDelay,
      screenshotRandomDelay, setScreenshotRandomDelay,
      screenshotResultDelay, setScreenshotResultDelay
    }}>
      {children}
    </FtcLiveContext.Provider>
  );
};
