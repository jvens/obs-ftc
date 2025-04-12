import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import { usePersistentState } from '../helpers/persistant';
import type {OBSEventTypes} from "obs-websocket-js/dist/types";

type ObsStudioProviderProps = {
  children: ReactNode;
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
  // isConnected: boolean;
  error: string | undefined;
  connectToObs: () => void;
  disconnectFromObs: () => void;
  fetchScenes: () => Promise<string[]>;
  switchScenes: (scene: string) => void;
  setActiveField: (field: number) => void;
  field1Scene?: string;
  setField1Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
  field2Scene?: string;
  setField2Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ outputPath: string }>;
  saveReplayBuffer: () => Promise<string>;
  // isRecording: boolean;
  status: {
    connected: boolean;
    streaming: boolean;
    recording: boolean;
    replayBuffer: boolean;
  };
  startStreamTime: number;
}

// Create the context
export const ObsStudioContext = createContext<ObsStudioContextData>({} as ObsStudioContextData);

// Create a custom hook to use the OBS context
export const useObsStudio = () => {
  return useContext(ObsStudioContext);
};

// ObsStudioProvider component that will wrap your application or part of it
export const ObsStudioProvider: React.FC<ObsStudioProviderProps> = ({ children }) => {
  const [obsUrl, setObsUrl] = usePersistentState('OBS_URL', 'localhost');
  const [obsPort, setObsPort] = usePersistentState('OBS_Port', 4455);
  const [obsPassword, setObsPassword] = usePersistentState('OBS_Password', '');
  const [isConnected, setIsConnected] = useState(false);
  const [field1Scene, setField1Scene] = usePersistentState<string|undefined>('Field1_Scene', undefined)
  const [field2Scene, setField2Scene] = usePersistentState<string | undefined>('Field2_Scene', undefined)
  const [isRecording, setIsRecording] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReplayRecording, setIsReplayRecording] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [startStreamTime, setStartStreamTime] = useState<number>(0);

  const connectToObs = useCallback(async () => {
    try {
      const hello = await obs.connect(`ws://${obsUrl}:${obsPort}`, obsPassword);
      console.log('Hello message:', hello)

      setIsConnected(true);
      setError(undefined)
      // ... additional setup if needed

      const record = await obs.call('GetRecordStatus');
      console.log('Record status:', record);
      setIsRecording(record.outputActive);
      obs.addListener('RecordStateChanged', (data: any) => {
        console.log('Record state changed:', data);
        if (data.outputActive) {
          setIsRecording(true);
        } else {
          setIsRecording(false);
        }
      });

      const stream = await obs.call('GetStreamStatus');
      console.log('Stream status:', stream);
      setIsRecording(stream.outputActive);
      obs.addListener('StreamStateChanged', (data: any) => {
        console.log('Stream state changed:', data);
        if (data.outputActive) {
          setIsStreaming(true);
          console.log("Stream started at ", Date.now())
          setStartStreamTime(Date.now())
        } else {
          setIsStreaming(false);
        }
      });
  
      const replayBuffer = await obs.call('GetReplayBufferStatus');
      console.log('Replay buffer status:', replayBuffer);
      setIsReplayRecording(replayBuffer.outputActive);
      obs.addListener('ReplayBufferStateChanged', (data: any) => {
        console.log('Replay buffer state changed:', data);
        if (data.outputActive) {
          setIsReplayRecording(true);
        } else {
          setIsReplayRecording(false);
        }
      });
    } catch (error: any) {
      console.error('Failed to connect to OBS:', error);
      setIsConnected(false);
      if (error.code) {
        console.log('Error code:', error.code)
        if (error.code === 1006)
          setError("Unable to connect. Check the URL and OBS Websocket settings.")
        else if (error.code === 4009)
          setError("Unable to connect. Check the OBS Websocket password.")
        else
          setError(`Unknown Error: ${JSON.stringify(error)}`);
      } else {
        setError(`Unknown Error: ${JSON.stringify(error)}`);
      }
    }
  }, [obsUrl, obsPort, obsPassword, setStartStreamTime]);

  const disconnectFromObs = useCallback(() => {
    obs.disconnect();
    setIsConnected(false);
    setError(undefined)
  }, []);

  const fetchScenes = useCallback(async (): Promise<string[]> => {
    try {
      const { scenes } = await obs.call('GetSceneList');
      const sceneList = scenes.map((s: any): string => s.sceneName).reverse()
      console.log("scenes:", sceneList)
      return sceneList;
    } catch (error) {
      console.error('Error fetching scenes:', error);
      return [];
    }
  }, []);

  const saveReplayBuffer = useCallback(async () => {
    try {
      await obs.call('SaveReplayBuffer');
      const outputPath = await obs.call('GetLastReplayBufferReplay');
      console.log('Replay buffer saved to:', outputPath);
      return outputPath.savedReplayPath;
    } catch (error) {
      console.error('Error saving replay buffer:', error);
      throw error;
    }
  }, []);

  const field1SceneRef = useRef(field1Scene)
  const field2SceneRef = useRef(field2Scene)
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    field1SceneRef.current = field1Scene;
    field2SceneRef.current = field2Scene;
    isConnectedRef.current = isConnected;
  }, [field1Scene, field2Scene, isConnected])

  const switchScenes = async (scene: string) => {
    if (obs && isConnectedRef.current) {
      console.log('Switch Scenes to', scene)
      obs.call('SetCurrentProgramScene', { sceneName: scene });
    } else {
      console.error("Unable to switch scene. Not connected");
    }
  }

  const setActiveField = async (field: number) => {
    const field1Scene = field1SceneRef.current
    const field2Scene = field2SceneRef.current
    if (field === 1 && field1Scene) {
      await switchScenes(field1Scene)
    } else if (field === 2 && field2Scene) {
      await switchScenes(field2Scene)
    } else if (field === 0) {
      console.log("Finals Match, manual switching required")
    } else {
      console.error("Unable to switch stream to field ", field)
      console.log('field 1:', field1Scene)
      console.log('field 2:', field2Scene)
    }
  }

  return (
    <ObsStudioContext.Provider value={{
      obsUrl, setObsUrl,
      obsPort, setObsPort,
      obsPassword, setObsPassword,
      connectToObs, disconnectFromObs,
      fetchScenes, switchScenes,
      field1Scene, field2Scene,
      setField1Scene, setField2Scene, setActiveField,
      saveReplayBuffer,
      error,
      startStreamTime,
      startRecording: () => obs.call('StartRecord'), stopRecording: () => obs.call('StopRecord'),
      status: {
        connected: isConnected,
        streaming: isStreaming,
        recording: isRecording,
        replayBuffer: isReplayRecording
      }
    }}>
      {children}
    </ObsStudioContext.Provider>
  );
};
