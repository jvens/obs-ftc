import React, { useState } from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { UpdateTypes, UpdateType } from '../types/FtcLive';
import { useFtcLive } from '../contexts/FtcLiveContext';

const SceneMapper = () => {
  const { fetchScenes, status, field0Scene, field1Scene, field2Scene, setField0Scene, setField1Scene, setField2Scene } = useObsStudio();
  const { transitionTriggers: selectedTriggers, setTransitionTriggers: setSelectedTriggers, startRecordingTriggers, stopRecordingTriggers, toggleRecordingStartTrigger, toggleRecordingStopTrigger, isConnected: isFtcLiveConnected, stopRecordingDelays, setStopRecordingDelays } = useFtcLive();
  const [scenes, setScenes] = useState<string[]>([]);

  const handleFetchScenes = async () => {
    const fetchedScenes = await fetchScenes();
    setScenes(fetchedScenes);
  };

  const handleTriggerChange = (updateType: UpdateType) => {
    setSelectedTriggers(prevSelectedTriggers =>
      prevSelectedTriggers.includes(updateType)
        ? prevSelectedTriggers.filter(type => type !== updateType)
        : [...prevSelectedTriggers, updateType]
    );
  };

  const getStatus = status.connected && isFtcLiveConnected && field1Scene && field2Scene;

  return (
    <div className="section">
      <h2>Scene Swiching Settings</h2>
      <button onClick={handleFetchScenes} disabled={!status.connected}>Fetch Scenes</button>
      <br/>
      <div>
        <h3>Scene Assignments</h3>
        Field 1 Scene:
        <select
          onChange={(e) => setField1Scene(scenes.find(s => s === e.target.value))}
          value={field1Scene || 'Select Scene'}
          disabled={scenes.length === 0 || !status.connected}
        >
          <option value="Select Scene">Select Scene</option>
          {scenes.map((scene) => (
            <option key={scene} value={scene}>
              {scene}
            </option>
          ))}
        </select>
        <br />
        Field 2 Scene:
        <select
          onChange={(e) => setField2Scene(scenes.find(s => s === e.target.value))}
          value={field2Scene || 'Select Scene'}
          disabled={scenes.length === 0 || !status.connected}
        >
          <option value="Select Scene">Select Scene</option>
          {scenes.map((scene) => (
            <option key={scene} value={scene}>
              {scene}
            </option>
          ))}
        </select>
        <br />
        Finals Scene:
        <select
          onChange={(e) => setField0Scene(scenes.find(s => s === e.target.value))}
          value={field0Scene || 'Select Scene'}
          disabled={scenes.length === 0 || !status.connected}
        >
          <option value="Select Scene">Select Scene</option>
          {scenes.map((scene) => (
            <option key={scene} value={scene}>
              {scene}
            </option>
          ))}
        </select>
      </div>
      <br />
      <div>
        <h3>Transition Triggers</h3>
        <p>
          Select the triggers that will cause the OBS scene to switch.
        </p>
        <table className="trigger-table">
          <thead>
            <tr>
              <th>Trigger</th>
              <th>Transition</th>
              <th>Start Record</th>
              <th>Stop Record</th>
              <th>Stop Delay</th>
            </tr>
          </thead>
          <tbody>
            {UpdateTypes.map((type) => (
              <tr key={type}>
                <td>{type}</td>
                <td>
                  <input
                    name={type}
                    type="checkbox"
                    checked={selectedTriggers.includes(type)}
                    onChange={() => handleTriggerChange(type)}
                  />
                </td>
                <td>
                  <input
                    name={`${type}-record-start`}
                    type="checkbox"
                    checked={startRecordingTriggers.includes(type)}
                    onChange={() => toggleRecordingStartTrigger(type)}
                  />
                </td>
                <td>
                  <input
                    name={`${type}-record-stop`}
                    type="checkbox"
                    checked={stopRecordingTriggers.includes(type)}
                    onChange={() => toggleRecordingStopTrigger(type)}
                  />
                </td>
                <td>
                  <input
                    name={`${type}-record-stop-delay`}
                    type="number"
                    placeholder="Offset"
                    disabled={!stopRecordingTriggers.includes(type)}
                    min={0}
                    value={stopRecordingDelays[type] || 0}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (!isNaN(value)) {
                        setStopRecordingDelays((prevDelays) => ({
                          ...prevDelays,
                          [type]: value,
                        }));
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <br />
      <div>
        Status:
        <span className={`connection-status ${getStatus ? 'connected' : 'disconnected'}`}>
          {getStatus ? 'Running' : 'Not Running'}
        </span>
      </div>
    </div>
  );
};

export default SceneMapper;
