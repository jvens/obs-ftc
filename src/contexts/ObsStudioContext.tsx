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

const RECONNECT_INTERVAL = 10; // seconds

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
  // Auto-reconnect state
  isReconnecting: boolean;
  reconnectCountdown: number;
  cancelReconnect: () => void;
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

  // Auto-reconnect state
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const userDisconnectedRef = useRef(false);
  const wasConnectedRef = useRef(false);

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

  const connectToObsRef = useRef<() => void>(() => {});

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
      console.log('Attempting to reconnect to OBS...');
      connectToObsRef.current();
    }, RECONNECT_INTERVAL * 1000);
  }, []);

  const connectToObsInternal = useCallback(async () => {
    // Cancel any pending reconnect when manually connecting
    cancelReconnect();
    userDisconnectedRef.current = false;

    try {
      const hello = await obs.connect(`ws://${obsUrl}:${obsPort}`, obsPassword);
      console.log('Hello message:', hello)

      obs.removeAllListeners('ConnectionClosed');
      obs.on('ConnectionClosed', (err) => {
        console.warn('OBS Connection Closed:', err.message)
        setIsConnected(false);

        // Only auto-reconnect if user didn't manually disconnect and we were previously connected
        if (!userDisconnectedRef.current && wasConnectedRef.current) {
          console.log('Connection lost unexpectedly, will attempt to reconnect...');
          startReconnectTimer();
        }
      })

      wasConnectedRef.current = true;
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
      setIsStreaming(stream.outputActive);
      if (stream.outputActive && stream.outputDuration) {
        // Calculate when the stream started based on current time minus duration
        // outputDuration is in milliseconds
        const streamStartTime = Date.now() - stream.outputDuration;
        console.log('Stream already active, started at:', new Date(streamStartTime).toLocaleTimeString());
        setStartStreamTime(streamStartTime);
      }
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

      // If we were previously connected and connection failed, try to reconnect
      if (wasConnectedRef.current && !userDisconnectedRef.current) {
        console.log('Reconnect attempt failed, scheduling next attempt...');
        startReconnectTimer();
      }
    }
  }, [obsUrl, obsPort, obsPassword, cancelReconnect, startReconnectTimer]);

  // Keep ref updated for use in timer callback
  useEffect(() => {
    connectToObsRef.current = connectToObsInternal;
  }, [connectToObsInternal]);

  // Public connect function
  const connectToObs = useCallback(() => {
    userDisconnectedRef.current = false;
    connectToObsInternal();
  }, [connectToObsInternal]);

  const disconnectFromObs = useCallback(async () => {
    // Mark as user-initiated disconnect to prevent auto-reconnect
    userDisconnectedRef.current = true;
    wasConnectedRef.current = false;
    cancelReconnect();

    try {
      await obs.disconnect();
    } catch (err: unknown) {
      console.error('Error disconnecting:', err)
      setError('Error disconnecting')
    } finally {
      setIsConnected(false);
    }
  }, [cancelReconnect]);

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
      },
      isReconnecting,
      reconnectCountdown,
      cancelReconnect
    }}>
      {children}
    </ObsStudioContext.Provider>
  );
};
