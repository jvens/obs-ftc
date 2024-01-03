import React, { useState } from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { UpdateTypes, UpdateType } from '../types/FtcLive';
import { useFtcLive } from '../contexts/FtcLiveContext';

const SceneMapper = () => {
  const { fetchScenes, isConnected, field1Scene, field2Scene, setField1Scene, setField2Scene } = useObsStudio();
  const { isConnected: isFtcLiveConnected } = useFtcLive();
  const { selectedTriggers, setSelectedTriggers } = useFtcLive();
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

  const getStatus = isConnected && isFtcLiveConnected && field1Scene && field2Scene;

  return (
    <div className="section">
      <h2>Scene Swiching Settings</h2>
      <button onClick={handleFetchScenes} disabled={!isConnected}>Fetch Scenes</button>
      <br />
      <div>
        <h3>Scene Assignments</h3>
        Field 1 Scene:
        <select
          onChange={(e) => setField1Scene(scenes.find(s => s === e.target.value))}
          value={field1Scene || 'Select Scene'}
          disabled={scenes.length === 0 || !isConnected}
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
          disabled={scenes.length === 0 || !isConnected}
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
        {UpdateTypes.map((type) => (
          <div key={type}>
            <input
              name={type}
              type="checkbox"
              checked={selectedTriggers.includes(type)}
              onChange={() => handleTriggerChange(type)}
            />
            <label onClick={() => handleTriggerChange(type)}>
              {type}
            </label>
            <br />
          </div>
        ))}
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
