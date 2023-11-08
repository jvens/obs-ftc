import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import OBSWebSocket from 'obs-websocket-js';

type ObsStudioProviderProps = {
  children: ReactNode;
};

export interface ObsScene {
  sceneIndex: number;
  sceneName: string;
};

const obs = new OBSWebSocket();

// Define the context data types
interface ObsStudioContextData {
  obsUrl: string;
  setObsUrl: React.Dispatch<React.SetStateAction<string>>;
  obsPort: number;
  setObsPort: React.Dispatch<React.SetStateAction<number>>;
  obsPassword: string;
  setObsPassword: React.Dispatch<React.SetStateAction<string>>;
  isConnected: boolean;
  connectToObs: () => void;
  disconnectFromObs: () => void;
  fetchScenes: () => any;
  // ... other functions and state related to OBS control
}

// Create the context
export const ObsStudioContext = createContext<ObsStudioContextData>({} as ObsStudioContextData);

// Create a custom hook to use the OBS context
export const useObsStudio = () => {
  return useContext(ObsStudioContext);
};

// ObsStudioProvider component that will wrap your application or part of it
export const ObsStudioProvider: React.FC<ObsStudioProviderProps> = ({ children }) => {
  const [obsUrl, setObsUrl] = useState('localhost');
  const [obsPort, setObsPort] = useState(4455);
  const [obsPassword, setObsPassword] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const connectToObs = useCallback(async () => {
    try {
      const hello = await obs.connect(`ws://${obsUrl}:${obsPort}`, obsPassword);
      console.log('Hello message:', hello)
      setIsConnected(true);
      // ... additional setup if needed
    } catch (error) {
      console.error('Failed to connect to OBS:', error);
      setIsConnected(false);
    }
  }, [obsUrl, obsPort, obsPassword]);

  const disconnectFromObs = useCallback(() => {
    obs.disconnect();
    setIsConnected(false);
  }, []);

  const fetchScenes = useCallback(async () => {
    try {
      const { scenes } = await obs.call('GetSceneList');
      console.log("scenes:", scenes[0])
      return scenes;
    } catch (error) {
      console.error('Error fetching scenes:', error);
      return [];
    }
  }, []);

  return (
    <ObsStudioContext.Provider value={{ obsUrl, setObsUrl, obsPort, setObsPort, obsPassword, setObsPassword, isConnected, connectToObs, disconnectFromObs, fetchScenes }}>
      {children}
    </ObsStudioContext.Provider>
  );
};
