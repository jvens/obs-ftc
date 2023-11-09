import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import OBSWebSocket from 'obs-websocket-js';

type ObsStudioProviderProps = {
  children: ReactNode;
};

export interface ObsScene {
  index: number;
  name: string;
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
  fetchScenes: () => Promise<ObsScene[]>;
  switchScenes: (scene: ObsScene) => void;
  setActiveField: (field: number) => void;
  field1Scene?: ObsScene;
  setField1Scene: React.Dispatch<React.SetStateAction<ObsScene|undefined>>;
  field2Scene?: ObsScene;
  setField2Scene: React.Dispatch<React.SetStateAction<ObsScene|undefined>>;
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
  const [field1Scene, setField1Scene] = useState<ObsScene|undefined>()
  const [field2Scene, setField2Scene] = useState<ObsScene|undefined>()
  

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
      const sceneList = scenes.map((s: any): ObsScene => {return {name: s.sceneName, index: s.sceneIndex}})
      console.log("scenes:", sceneList)
      return sceneList;
    } catch (error) {
      console.error('Error fetching scenes:', error);
      return [];
    }
  }, []);

  const switchScenes = async (scene: ObsScene) => {
    if (obs && isConnected) {
      console.log('Switch Scenes to', scene.name)
      obs.call('SetCurrentProgramScene', { sceneName: scene.name });
    } else {
      console.error("Unable to switch scene. Not connected");
    }
  }

  const setActiveField = async (field: number) => {
    if (field === 1 && field1Scene) {
      await switchScenes(field1Scene)
    } else if (field === 2 && field2Scene) {
      await switchScenes(field2Scene)
    } else {
      console.error("Unable to switch stream to field ", field)
      console.log('field 1:', field1Scene)
      console.log('field 2:', field2Scene)
    }
  }

  return (
    <ObsStudioContext.Provider value={{ obsUrl, setObsUrl, obsPort, setObsPort, obsPassword, setObsPassword, isConnected, connectToObs, disconnectFromObs, fetchScenes, switchScenes, field1Scene, field2Scene, setField1Scene, setField2Scene, setActiveField }}>
      {children}
    </ObsStudioContext.Provider>
  );
};
