import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import OBSWebSocket, { OBSRequestTypes } from 'obs-websocket-js';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { usePersistentState } from '../helpers/persistant';
import { trackEvent, AnalyticsEvents } from '../helpers/analytics';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { ObsCall } from '../obsSetup/obsCall';
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
  // Scene names as listed in OBS (top first), kept up to date while connected.
  scenes: string[];
  switchScenes: (scene: string) => void;
  setActiveField: (field: number) => void;
  field0Scene?: string;
  setField0Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
  field1Scene?: string;
  setField1Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
  field2Scene?: string;
  setField2Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
  field3Scene?: string;
  setField3Scene: React.Dispatch<React.SetStateAction<string | undefined>>;
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
  // Replay buffer configuration
  replayBufferLength: number | null;
  outputMode: 'Simple' | 'Advanced' | null;
  replayBufferConfigError: string | null;
  getReplayBufferLength: () => Promise<number | null>;
  setReplayBufferLengthValue: (seconds: number) => Promise<boolean>;
  // Browser sources
  emitBrowserEvent: (eventName: string, eventData: BrowserEventData) => ResultAsync<void, string>;
  addBrowserSourceToCurrentScene: (inputName: string, url: string) => ResultAsync<AddBrowserSourceResult, string>;
  // Any obs-websocket request; fails with a message when not connected.
  callObs: ObsCall;
  // Custom events other obs-websocket clients broadcast (e.g. LAN camera status); returns an unsubscribe.
  onCustomEvent: (handler: (eventData: unknown) => void) => () => void;
  // Re-reads the replay buffer state after OBS output settings change.
  refreshReplayBufferStatus: () => Promise<void>;
}

export interface AddBrowserSourceResult {
  sceneName: string;
  // created: new source; added: existing source added to this scene; present: already in this scene
  outcome: 'created' | 'added' | 'present';
}

export type BrowserEventData = NonNullable<OBSRequestTypes['CallVendorRequest']['requestData']>;

const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

// OBS reports scenes bottom first.
const sceneNames = (scenes: { sceneName?: unknown }[]) => scenes.map(scene => String(scene.sceneName)).reverse();

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
  const [scenes, setScenes] = useState<string[]>([]);
  const [field0Scene, setField0Scene] = usePersistentState<string | undefined>('Field0_Scene', undefined)
  const [field1Scene, setField1Scene] = usePersistentState<string | undefined>('Field1_Scene', undefined)
  const [field2Scene, setField2Scene] = usePersistentState<string | undefined>('Field2_Scene', undefined)
  const [field3Scene, setField3Scene] = usePersistentState<string | undefined>('Field3_Scene', undefined)
  const [isRecording, setIsRecording] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReplayRecording, setIsReplayRecording] = useState(false);
  const [isReplayBufferEnabled, setIsReplayBufferEnabled] = useState(false);
  const [replayBufferLength, setReplayBufferLengthState] = useState<number | null>(null);
  const [outputMode, setOutputMode] = useState<'Simple' | 'Advanced' | null>(null);
  const [replayBufferConfigError, setReplayBufferConfigError] = useState<string | null>(null);
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

  // Whether the replay buffer is turned on in the OBS profile, and whether it is running.
  const refreshReplayBufferStatus = useCallback(async () => {
    // The replay buffer only appears in the output list when it is turned on in the profile
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
  }, []);

  const refreshScenes = useCallback(() =>
    ResultAsync.fromPromise(obs.call('GetSceneList'), toErrorMessage)
      .match(({ scenes }) => setScenes(sceneNames(scenes)), error => console.error('Error fetching scenes:', error)), []);

  // Follow scenes being added, removed or renamed, and scene collection switches. Field assignments
  // follow a renamed scene.
  useEffect(() => {
    const onSceneListChanged = ({ scenes }: { scenes: { sceneName?: unknown }[] }) => setScenes(sceneNames(scenes));
    const onSceneNameChanged = ({ oldSceneName, sceneName }: { oldSceneName: string; sceneName: string }) =>
      [setField0Scene, setField1Scene, setField2Scene, setField3Scene]
        .forEach(setScene => setScene(current => current === oldSceneName ? sceneName : current));
    obs.on('SceneListChanged', onSceneListChanged);
    obs.on('SceneNameChanged', onSceneNameChanged);
    obs.on('CurrentSceneCollectionChanged', refreshScenes);
    return () => {
      obs.off('SceneListChanged', onSceneListChanged);
      obs.off('SceneNameChanged', onSceneNameChanged);
      obs.off('CurrentSceneCollectionChanged', refreshScenes);
    };
  }, [refreshScenes, setField0Scene, setField1Scene, setField2Scene, setField3Scene]);

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
        setScenes([]);

        // Only auto-reconnect if user didn't manually disconnect and we were previously connected
        if (!userDisconnectedRef.current && wasConnectedRef.current) {
          console.log('Connection lost unexpectedly, will attempt to reconnect...');
          startReconnectTimer();
        }
      })

      wasConnectedRef.current = true;
      setIsConnected(true);
      refreshScenes();
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

      await refreshReplayBufferStatus();

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
  }, [obsUrl, obsPort, obsPassword, cancelReconnect, startReconnectTimer, refreshReplayBufferStatus, refreshScenes]);

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
      setScenes([]);
    }
  }, [cancelReconnect]);

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

  const getReplayBufferLength = useCallback(async (): Promise<number | null> => {
    if (!isConnectedRef.current) {
      return null;
    }

    try {
      setReplayBufferConfigError(null);

      // First, detect output mode
      const modeResult = await obs.call('GetProfileParameter', {
        parameterCategory: 'Output',
        parameterName: 'Mode'
      });

      const mode = modeResult.parameterValue as 'Simple' | 'Advanced' | null;
      setOutputMode(mode);

      if (!mode) {
        setReplayBufferConfigError('Could not detect OBS output mode');
        return null;
      }

      // Query the appropriate parameter based on mode
      const category = mode === 'Simple' ? 'SimpleOutput' : 'AdvOut';
      const result = await obs.call('GetProfileParameter', {
        parameterCategory: category,
        parameterName: 'RecRBTime'
      });

      const value = result.parameterValue;
      if (value !== null && value !== undefined) {
        const seconds = parseInt(value, 10);
        if (!isNaN(seconds)) {
          setReplayBufferLengthState(seconds);
          return seconds;
        }
      }

      // Try default value
      const defaultValue = result.defaultParameterValue;
      if (defaultValue !== null && defaultValue !== undefined) {
        const seconds = parseInt(defaultValue, 10);
        if (!isNaN(seconds)) {
          setReplayBufferLengthState(seconds);
          return seconds;
        }
      }

      setReplayBufferConfigError('Could not read replay buffer length from OBS profile');
      return null;
    } catch (error) {
      console.error('Error getting replay buffer length:', error);
      setReplayBufferConfigError(`Error reading replay buffer config: ${error}`);
      return null;
    }
  }, []);

  const setReplayBufferLengthValue = useCallback(async (seconds: number): Promise<boolean> => {
    if (!isConnectedRef.current || !outputMode) {
      return false;
    }

    try {
      const category = outputMode === 'Simple' ? 'SimpleOutput' : 'AdvOut';

      await obs.call('SetProfileParameter', {
        parameterCategory: category,
        parameterName: 'RecRBTime',
        parameterValue: seconds.toString()
      });

      setReplayBufferLengthState(seconds);
      setReplayBufferConfigError(null);

      // If replay buffer is running, restart it for changes to take effect
      if (isReplayRecording) {
        try {
          await obs.call('StopReplayBuffer');
          // Wait for replay buffer to fully stop by listening for the state change
          await new Promise<void>((resolve) => {
            const checkStopped = (data: { outputActive: boolean; outputState: string }) => {
              if (data.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED') {
                obs.off('ReplayBufferStateChanged', checkStopped);
                resolve();
              }
            };
            obs.on('ReplayBufferStateChanged', checkStopped);
            // Timeout fallback in case event is missed
            setTimeout(() => {
              obs.off('ReplayBufferStateChanged', checkStopped);
              resolve();
            }, 3000);
          });
          await obs.call('StartReplayBuffer');
          console.log('Replay buffer restarted after config change');
        } catch (restartError) {
          console.error('Error restarting replay buffer:', restartError);
        }
      }

      return true;
    } catch (error) {
      console.error('Error setting replay buffer length:', error);
      setReplayBufferConfigError(`Error setting replay buffer config: ${error}`);
      return false;
    }
  }, [outputMode, isReplayRecording]);

  // Query replay buffer length when connected and replay buffer is enabled
  const getReplayBufferLengthRef = useRef(getReplayBufferLength);
  useEffect(() => {
    getReplayBufferLengthRef.current = getReplayBufferLength;
  }, [getReplayBufferLength]);

  useEffect(() => {
    if (isConnected && isReplayBufferEnabled) {
      getReplayBufferLengthRef.current();
    } else if (!isConnected) {
      // Reset state when disconnected
      setReplayBufferLengthState(null);
      setOutputMode(null);
      setReplayBufferConfigError(null);
    }
  }, [isConnected, isReplayBufferEnabled]);

  const field0SceneRef = useRef(field0Scene)
  const field1SceneRef = useRef(field1Scene)
  const field2SceneRef = useRef(field2Scene)
  const field3SceneRef = useRef(field3Scene)
  const recordDirectoryRef = useRef(recordDirectory)
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    field0SceneRef.current = field0Scene
    field1SceneRef.current = field1Scene;
    field2SceneRef.current = field2Scene;
    field3SceneRef.current = field3Scene;
    isConnectedRef.current = isConnected;
    recordDirectoryRef.current = recordDirectory;
  }, [field0Scene, field1Scene, field2Scene, field3Scene, isConnected, recordDirectory])

  const takeScreenshot = async (fileName: string, field: number) => {
    const field0Scene = field0SceneRef.current
    const field1Scene = field1SceneRef.current
    const field2Scene = field2SceneRef.current
    const field3Scene = field3SceneRef.current
    let sourceName: string;
    if (field === 1 && field1Scene)
      sourceName = field1Scene
    else if (field === 2 && field2Scene)
      sourceName = field2Scene
    else if (field === 3 && field3Scene)
      sourceName = field3Scene
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
    const field3Scene = field3SceneRef.current
    if (field === 1 && field1Scene) {
      await switchScenes(field1Scene)
    } else if (field === 2 && field2Scene) {
      await switchScenes(field2Scene)
    } else if (field === 3 && field3Scene) {
      await switchScenes(field3Scene)
    } else if (field === 0 && field0Scene) {
      await switchScenes(field0Scene)
    } else if (field === 0) {
      console.log("Finals Match, manual switching required")
    } else {
      console.error("Unable to switch stream to field ", field)
      console.log("Field 0:", field0Scene)
      console.log('field 1:', field1Scene)
      console.log('field 2:', field2Scene)
      console.log('field 3:', field3Scene)
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

  // Fires a window event named `eventName` inside every OBS browser source (via the obs-browser vendor).
  const emitBrowserEvent = useCallback((eventName: string, eventData: BrowserEventData): ResultAsync<void, string> => {
    if (!isConnectedRef.current)
      return errAsync('Not connected to OBS');
    return ResultAsync.fromPromise(
      obs.call('CallVendorRequest', {
        vendorName: 'obs-browser',
        requestType: 'emit_event',
        requestData: { event_name: eventName, event_data: eventData },
      }),
      toErrorMessage
    ).map(() => undefined);
  }, []);

  // Puts the browser source `inputName` in the current program scene. The source is created once and
  // shared by every scene it is added to; if it already exists its URL is updated instead.
  // Checks the socket itself: components react to `status.connected` before isConnectedRef catches up.
  const callObs: ObsCall = useCallback((requestType, requestData) => obs.identified
    ? ResultAsync.fromPromise(obs.call(requestType, requestData), toErrorMessage)
    : errAsync('Not connected to OBS'), []);

  const onCustomEvent = useCallback((handler: (eventData: unknown) => void) => {
    // OBS delivers the broadcast data itself as the event, not inside `eventData` as the types say.
    obs.on('CustomEvent', handler);
    return () => { obs.off('CustomEvent', handler); };
  }, []);

  const addBrowserSourceToCurrentScene = useCallback((inputName: string, url: string): ResultAsync<AddBrowserSourceResult, string> => {
    const call = callObs;
    return ResultAsync.combine([call('GetCurrentProgramScene'), call('GetInputList')])
      .andThen(([{ currentProgramSceneName: sceneName }, { inputs }]) => {
        const exists = inputs.some(input => input.inputName === inputName);
        if (!exists)
          return call('CreateInput', {
            sceneName,
            inputName,
            inputKind: 'browser_source',
            inputSettings: { url, width: 1920, height: 1080 },
          }).map((): AddBrowserSourceResult => ({ sceneName, outcome: 'created' }));

        return call('SetInputSettings', { inputName, inputSettings: { url } })
          .andThen(() => call('GetSceneItemList', { sceneName }))
          .andThen(({ sceneItems }) => sceneItems.some(item => item.sourceName === inputName)
            ? okAsync<AddBrowserSourceResult, string>({ sceneName, outcome: 'present' })
            : call('CreateSceneItem', { sceneName, sourceName: inputName })
                .map((): AddBrowserSourceResult => ({ sceneName, outcome: 'added' })));
      });
  }, [callObs]);

  return (
    <ObsStudioContext.Provider value={{
      obsUrl, setObsUrl,
      obsPort, setObsPort,
      obsPassword, setObsPassword,
      connectToObs, disconnectFromObs,
      scenes, switchScenes,
      field0Scene, field1Scene, field2Scene, field3Scene,
      setField0Scene, setField1Scene, setField2Scene, setField3Scene, setActiveField,
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
      cancelReconnect,
      // Replay buffer configuration
      replayBufferLength,
      outputMode,
      replayBufferConfigError,
      getReplayBufferLength,
      setReplayBufferLengthValue,
      // Browser sources
      emitBrowserEvent,
      addBrowserSourceToCurrentScene,
      callObs,
      onCustomEvent,
      refreshReplayBufferStatus
    }}>
      {children}
    </ObsStudioContext.Provider>
  );
};
