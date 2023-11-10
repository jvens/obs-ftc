// src/contexts/FtcLiveContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Event, FtcLiveSteamData, UpdateType } from '../types/FtcLive';
import { useObsStudio } from './ObsStudioContext';
import { usePersistentState } from '../helpers/persistant';

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
  selectedTriggers: UpdateType[];
  setSelectedTriggers: React.Dispatch<React.SetStateAction<UpdateType[]>>;
}

// Create the context
export const FtcLiveContext = createContext<FtcLiveContextData>({} as FtcLiveContextData);

// Create a custom hook to use the WebSocket context
export const useFtcLive = () => {
  return useContext(FtcLiveContext);
};

// WebSocketProvider component that will wrap your application or part of it
export const FtcLiveProvider: React.FC<FtcLiveProviderProps> = ({ children }) => {
  const { setActiveField } = useObsStudio();
  const [serverUrl, setServerUrl] = usePersistentState<string>('FTC_URL', 'localhost');
  const [selectedEvent, setSelectedEvent] = usePersistentState<Event|undefined>('FTC_Event', undefined);
  const [allStreamData, setAllStreamData] = usePersistentState<FtcLiveSteamData[]>('Socket_Messages', []);
  const [latestStreamData, setLatestStreamData] = useState<FtcLiveSteamData|undefined>();
  const [isConnected, setConnected] = useState<boolean>(false);
  const [socket, setSocket] = useState<WebSocket | undefined>();
  const [selectedTriggers, setSelectedTriggers] = usePersistentState<UpdateType[]>('Selected_Trigers', ['SHOW_PREVIEW', 'SHOW_MATCH', 'SHOW_RANDOM', 'MATCH_START', 'MATCH_POST']);

  // ... other states like ws, isConnected, etc.

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
        console.log('Websocket Message: ', streamData)
        setAllStreamData(prevMessages => [...prevMessages, streamData]);
        setLatestStreamData(streamData);
        console.log('Selected Triggers:', selectedTriggers)
        if (selectedTriggers.some(trigger => trigger === streamData.updateType)) {
          console.log('Set the active field')
          setActiveField(streamData.payload.field)
        } else {
          console.log('Event was not in the selected triggers list:', streamData.updateType)
        }
      }
    } else if (!connect) {
      socket?.close();
      setConnected(false);
    }
  }, [serverUrl, socket, selectedEvent, selectedTriggers, setActiveField, setAllStreamData]);

  // ... other logic

  // Provide the context value to children
  return (
    <FtcLiveContext.Provider value={{ serverUrl, setServerUrl, selectedEvent, setSelectedEvent, allStreamData, connectWebSocket, isConnected, latestStreamData, selectedTriggers, setSelectedTriggers }}>
      {children}
    </FtcLiveContext.Provider>
  );
};
