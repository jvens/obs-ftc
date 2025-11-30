import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import { usePersistentState } from '../helpers/persistant';
import { trackEvent, AnalyticsEvents } from '../helpers/analytics';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { setObsUrl as setObsUrlAction, setObsPort as setObsPortAction, setObsPassword as setObsPasswordAction, selectObsUrl, selectObsPort, selectObsPassword } from '../store/connectionSlice';

type ObsStudioProviderProps = {
  children: ReactNode;
};

const obs = new OBSWebSocket();

// Define the context data types
interface ObsStudioContextData {
  obsUrl: string;
  setObsUrl: (url: string) => void;
  obsPort: number;
  setObsPort: (port: number) => void;
  obsPassword: string;
  setObsPassword: (password: string) => void;
  // isConnected: boolean;
  error: string | undefined;
  connectToObs: () => void;
  disconnectFromObs: () => void;
  fetchScenes: () => Promise<string[]>;
  switchScenes: (scene: string) => void;
  setActiveField: (field: number) => void;
  field0Scene?: string;
  setField0Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
  field1Scene?: string;
  setField1Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
  field2Scene?: string;
  setField2Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
  setRecording: (start: boolean) => Promise<string | undefined>;
  saveReplayBuffer: () => Promise<string>;
  takeScreenshot: (fileName: string, field: number) => Promise<string>;
  startReplayBuffer: () => Promise<boolean>;
  // isRecording: boolean;
  status: {
    connected: boolean;
    streaming: boolean;
    recording: boolean;
    replayBufferRecording: boolean;
    replayBufferEnabled: boolean;
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
  const dispatch = useAppDispatch();

  // Redux state for connection settings
  const obsUrl = useAppSelector(selectObsUrl);
  const obsPort = useAppSelector(selectObsPort);
  const obsPassword = useAppSelector(selectObsPassword);
  const setObsUrl = useCallback((url: string) => dispatch(setObsUrlAction(url)), [dispatch]);
  const setObsPort = useCallback((port: number) => dispatch(setObsPortAction(port)), [dispatch]);
  const setObsPassword = useCallback((password: string) => dispatch(setObsPasswordAction(password)), [dispatch]);
  const [isConnected, setIsConnected] = useState(false);
  const [field0Scene, setField0Scene] = usePersistentState<string | undefined>('Field0_Scene', undefined)
  const [field1Scene, setField1Scene] = usePersistentState<string | undefined>('Field1_Scene', undefined)
  const [field2Scene, setField2Scene] = usePersistentState<string | undefined>('Field2_Scene', undefined)
  const [isRecording, setIsRecording] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReplayRecording, setIsReplayRecording] = useState(false);
  const [isReplayBufferEnabled, setIsReplayBufferEnabled] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [startStreamTime, setStartStreamTime] = useState<number>(0);
  const [recordDirectory, setRecordDirectory] = useState<string>('');

  const connectToObs = useCallback(async () => {
    try {
      const hello = await obs.connect(`ws://${obsUrl}:${obsPort}`, obsPassword);
      console.log('Hello message:', hello)

      obs.on('ConnectionClosed', (err) => {
        console.warn('OBS Connection Closed:', err.message)
        setIsConnected(false);
      })

      setIsConnected(true);
      trackEvent(AnalyticsEvents.OBS_CONNECTED);
      const recordDirectory = await obs.call('GetRecordDirectory');
      console.log('Record directory:', recordDirectory.recordDirectory);
      setRecordDirectory(recordDirectory.recordDirectory);

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

      // Check if replay buffer is enabled by looking for it in the output list
      const list = await obs.call('GetOutputList');
      console.log('Output list:', list);
      const replayOutput = list.outputs.find((o) => o.outputKind === 'replay_buffer');

      if (replayOutput) {
        console.log('Replay buffer output found:', replayOutput.outputName);
        setIsReplayBufferEnabled(true);

        // Check if replay buffer is currently active
        try {
          const outputStatus = await obs.call('GetOutputStatus', { outputName: replayOutput.outputName as string });
          console.log('Replay buffer status:', outputStatus);
          setIsReplayRecording(outputStatus.outputActive);
        } catch (err) {
          console.log('Error getting replay buffer status:', err);
          setIsReplayRecording(false);
        }
      } else {
        console.log('Replay buffer output not enabled in OBS settings');
        setIsReplayBufferEnabled(false);
        setIsReplayRecording(false);
      }

      obs.addListener('ReplayBufferStateChanged', (data: any) => {
        console.log('Replay buffer state changed:', data);
        setIsReplayRecording(data.outputActive);
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
  }, [obsUrl, obsPort, obsPassword, setStartStreamTime, setRecordDirectory]);

  const disconnectFromObs = useCallback(async () => {
    try {
      await obs.disconnect();
    } catch (err: unknown) {
      console.error('Error disconnecting:', err)
      setError('Error disconnecting')
    } finally {
      setIsConnected(false);
    }
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
      const p: Promise<string> = new Promise((resolve) => {
        obs.once('ReplayBufferSaved', ({savedReplayPath}) => {
          resolve(savedReplayPath)
        })
      })

      await obs.call('SaveReplayBuffer');
      const outputPath = await p;
      console.log('Replay buffer saved to:', outputPath);
      return outputPath;
    } catch (error) {
      console.error('Error saving replay buffer:', error);
      throw error;
    }
  }, []);

  const startReplayBuffer = useCallback(async (): Promise<boolean> => {
    if (!isConnectedRef.current) {
      return false;
    }
    try {
      // First check if replay buffer is enabled
      const list = await obs.call('GetOutputList');
      const replayOutput = list.outputs.find((o) => o.outputKind === 'replay_buffer');

      if (!replayOutput) {
        console.log('Cannot start replay buffer - not enabled in OBS settings');
        return false;
      }

      // Start the replay buffer output
      await obs.call('StartReplayBuffer');
      // console.log('Replay buffer started');
      // setIsReplayRecording(true);
      return true;
    } catch (err: unknown) {
      console.error('Error starting replay buffer:', err);
      return false;
    }
  }, []);

  const field0SceneRef = useRef(field0Scene)
  const field1SceneRef = useRef(field1Scene)
  const field2SceneRef = useRef(field2Scene)
  const recordDirectoryRef = useRef(recordDirectory)
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    field0SceneRef.current = field0Scene
    field1SceneRef.current = field1Scene;
    field2SceneRef.current = field2Scene;
    isConnectedRef.current = isConnected;
    recordDirectoryRef.current = recordDirectory;
  }, [field0Scene, field1Scene, field2Scene, isConnected, recordDirectory])

  const takeScreenshot = async (fileName: string, field: number) => {
    const field0Scene = field0SceneRef.current
    const field1Scene = field1SceneRef.current
    const field2Scene = field2SceneRef.current
    let sourceName: string;
    if (field === 1 && field1Scene)
      sourceName = field1Scene
    else if (field === 2 && field2Scene)
      sourceName = field2Scene
    else if (field === 0 && field0Scene)
      sourceName = field0Scene
    else
      return '';
    try {
      const imageFilePath = `${recordDirectoryRef.current}/${fileName}`;
      const result = await obs.call('SaveSourceScreenshot', {
        sourceName,
        imageFormat: 'png',
        imageFilePath
      })
      console.log('screenshot', result)
      return imageFilePath;
    } catch (error) {
      console.error('Error saving screenshot:', error);
      return '';
    }
  }

  const switchScenes = async (scene: string) => {
    if (obs && isConnectedRef.current) {
      console.log('Switch Scenes to', scene)
      obs.call('SetCurrentProgramScene', { sceneName: scene });
    } else {
      console.error("Unable to switch scene. Not connected");
    }
  }

  const setActiveField = async (field: number) => {
    const field0Scene = field0SceneRef.current
    const field1Scene = field1SceneRef.current
    const field2Scene = field2SceneRef.current
    if (field === 1 && field1Scene) {
      await switchScenes(field1Scene)
    } else if (field === 2 && field2Scene) {
      await switchScenes(field2Scene)
    } else if (field === 0 && field0Scene) {
      await switchScenes(field0Scene)
    } else if (field === 0) {
      console.log("Finals Match, manual switching required")
    } else {
      console.error("Unable to switch stream to field ", field)
      console.log("Field 0:", field0Scene)
      console.log('field 1:', field1Scene)
      console.log('field 2:', field2Scene)
    }
  }

  const setRecording = useCallback(async (start: boolean) => {
    console.log('Set recording to', start)
    if (obs && isConnectedRef.current) {
      const recordingStatus = await obs.call('GetRecordStatus');
      console.log('Recording status:', recordingStatus);
      if (recordingStatus.outputActive !== start) {
        if (start) {
          console.log('Start recording');
          await obs.call('StartRecord');
          setIsRecording(true);
        } else {
          console.log('Stop recording');
          const outputPath = await obs.call('StopRecord');
          setIsRecording(false);
          return outputPath.outputPath;
        }
      }
    } else {
      console.error('Unable to set recording. Not connected');
    }
  }, []);

  return (
    <ObsStudioContext.Provider value={{
      obsUrl, setObsUrl,
      obsPort, setObsPort,
      obsPassword, setObsPassword,
      connectToObs, disconnectFromObs,
      fetchScenes, switchScenes,
      field0Scene, field1Scene, field2Scene,
      setField0Scene, setField1Scene, setField2Scene, setActiveField,
      saveReplayBuffer,
      startReplayBuffer,
      error,
      startStreamTime,
      setRecording,
      takeScreenshot,
      status: {
        connected: isConnected,
        streaming: isStreaming,
        recording: isRecording,
        replayBufferRecording: isReplayRecording,
        replayBufferEnabled: isReplayBufferEnabled
      }
    }}>
      {children}
    </ObsStudioContext.Provider>
  );
};
