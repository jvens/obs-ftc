// src/contexts/FtcLiveContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { Event, FtcLiveSteamData, UpdateType } from '../types/FtcLive';
import { useObsStudio } from './ObsStudioContext';
import { usePersistentState } from '../helpers/persistant';
import { json } from 'stream/consumers';

const MATCH_TIME_SECONDS = 0; //158 as const; // 2:38 in seconds

type FtcLiveProviderProps = {
  children: ReactNode;
};

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
  startRecordingTriggers: UpdateType[];
  stopRecordingTriggers: UpdateType[];
  stopRecordingOffsets: Record<UpdateType, number>
  setStopRecordingOffsets: React.Dispatch<React.SetStateAction<Record<UpdateType, number>>>;
  toggleRecordingStartTrigger: (trigger: UpdateType) => void;
  toggleRecordingStopTrigger: (trigger: UpdateType) => void;
  postMatchReplayTime: number;
  setPostMatchReplayTime: React.Dispatch<React.SetStateAction<number>>;
  enableReplayBuffer: boolean;
  setEnableReplayBuffer: React.Dispatch<React.SetStateAction<boolean>>;
  recordings: Record<string, string>;
  clearRecordings: () => void;
}

// Create the context
export const FtcLiveContext = createContext<FtcLiveContextData>({} as FtcLiveContextData);

// Create a custom hook to use the WebSocket context
export const useFtcLive = () => {
  return useContext(FtcLiveContext);
};

// WebSocketProvider component that will wrap your application or part of it
export const FtcLiveProvider: React.FC<FtcLiveProviderProps> = ({ children }) => {
  const { setActiveField, startRecording, stopRecording, status, saveReplayBuffer } = useObsStudio();
  const [serverUrl, setServerUrl] = usePersistentState<string>('FTC_URL', 'localhost');
  const [selectedEvent, setSelectedEvent] = usePersistentState<Event | undefined>('FTC_Event', undefined);
  const [allStreamData, setAllStreamData] = usePersistentState<FtcLiveSteamData[]>('Socket_Messages', []);
  const [latestStreamData, setLatestStreamData] = useState<FtcLiveSteamData | undefined>();
  const [isConnected, setConnected] = useState<boolean>(false);
  const [socket, setSocket] = useState<WebSocket | undefined>();
  const [transitionTriggers, setTransitionTriggers] = usePersistentState<UpdateType[]>('Selected_Trigers', ['SHOW_PREVIEW', 'SHOW_MATCH', 'SHOW_RANDOM', 'MATCH_START', 'MATCH_POST']);
  const [startRecordingTriggers, setStartRecordingTriggers] = usePersistentState<UpdateType[]>('Start_Recording_Triggers', ['SHOW_PREVIEW', 'MATCH_START']);
  const [stopRecordingTriggers, setStopRecordingTriggers] = usePersistentState<UpdateType[]>('Stop_Recording_Triggers', ['MATCH_ABORT', 'MATCH_START', 'SHOW_PREVIEW']);
  const [stopRecordingOffsets, setStopRecordingOffsets] = usePersistentState<Record<UpdateType, number>>('Stop_Recording_Offsets', {
    MATCH_LOAD: 0,
    MATCH_START: 240,
    MATCH_ABORT: 0,
    MATCH_COMMIT: 0,
    MATCH_POST: 0,
    SHOW_PREVIEW: 0,
    SHOW_RANDOM: 0,
    SHOW_MATCH: 0
  });
  const replayBufferTime = useRef<NodeJS.Timeout | null>(null);
  const [postMatchReplayTime, setPostMatchReplayTime] = useState<number>(15);
  const [enableReplayBuffer, setEnableReplayBuffer] = useState<boolean>(true);
  const [recordingMatch, setRecordingMatch] = useState<string | null>(null);
  const [savedRecordings, setSavedRecordings] = usePersistentState<string>('Recordings', JSON.stringify({}));
  const [recordings, setRecordings] = useState<Record<string, string>>({});

  useEffect(() => {
    if ( Object.keys(recordings).length === 0) {
      setRecordings(JSON.parse(savedRecordings));
    }
  }, [savedRecordings]);

  useEffect(() => {
    if (Object.keys(recordings).length > 0) {
      setSavedRecordings(JSON.stringify(recordings));
    }
  }, [recordings, setSavedRecordings]);

  const toggleRecordingStartTrigger = useCallback((trigger: UpdateType) => {
    setStartRecordingTriggers(prevTriggers =>
      prevTriggers.includes(trigger)
        ? prevTriggers.filter(type => type !== trigger)
        : [...prevTriggers, trigger]
    );
  }, [setStartRecordingTriggers]);
  const toggleRecordingStopTrigger = useCallback((trigger: UpdateType) => {
    setStopRecordingTriggers(prevTriggers =>
      prevTriggers.includes(trigger)
        ? prevTriggers.filter(type => type !== trigger)
        : [...prevTriggers, trigger]
    );
  }, [setStopRecordingTriggers]);

  const saveOffReplayBuffer = useCallback(async (matchName: string) => {
    replayBufferTime.current = null;
    console.log('Stopping replay buffer');
    const file = await saveReplayBuffer();
    console.log(`Replay buffer saved for match ${matchName}: ${file}`);
    setRecordings((prevRecordings) => { return { ...prevRecordings, [matchName]: file } });
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

    if (enableReplayBuffer) {
      if (streamData.updateType === 'MATCH_START') {
        if (replayBufferTime.current) {
          await saveOffReplayBuffer(recordingMatch ?? 'Unknown');
          clearTimeout(replayBufferTime.current);
          replayBufferTime.current = null;
        }
        console.log('Starting replay buffer');
        setRecordingMatch(streamData.payload.shortName);
        replayBufferTime.current = setTimeout(async () => {
          await saveOffReplayBuffer(streamData.payload.shortName);
        }, (MATCH_TIME_SECONDS + postMatchReplayTime) * 1000);
      }
      else if (streamData.updateType === 'MATCH_ABORT') {
        if (replayBufferTime.current) {
          clearTimeout(replayBufferTime.current);
          replayBufferTime.current = null;
        }
        console.log('Cancel replay buffer');
      }
    }

    if (startRecordingTriggers.some(trigger => trigger === streamData.updateType) && !status.recording) {
      console.log('Start recording');
      startRecording();
    }
    if (stopRecordingTriggers.some(trigger => trigger === streamData.updateType && status.recording)) {
      console.log('Stop recording');
      stopRecording();
    }
  }, [setAllStreamData, transitionTriggers, enableReplayBuffer, startRecordingTriggers, status.recording, stopRecordingTriggers, setActiveField, postMatchReplayTime, saveOffReplayBuffer, recordingMatch, startRecording, stopRecording]);

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
    <FtcLiveContext.Provider value={{ serverUrl, setServerUrl, selectedEvent, setSelectedEvent, allStreamData, connectWebSocket, isConnected, latestStreamData, transitionTriggers, setTransitionTriggers, startRecordingTriggers, toggleRecordingStartTrigger, stopRecordingTriggers, toggleRecordingStopTrigger, stopRecordingOffsets, setStopRecordingOffsets, postMatchReplayTime, setPostMatchReplayTime, enableReplayBuffer, setEnableReplayBuffer, recordings, clearRecordings: () => setRecordings({}) }}>
      {children}
    </FtcLiveContext.Provider>
  );
};
