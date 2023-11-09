import React, { useState } from 'react';
import { useObsStudio, ObsScene } from '../contexts/ObsStudioContext';
import { UpdateTypes, UpdateType } from '../types/FtcLive';
import { useFtcLive } from '../contexts/FtcLiveContext';

const SceneMapper = () => {
  const { fetchScenes, isConnected, field1Scene, field2Scene, setField1Scene, setField2Scene } = useObsStudio();
  const { selectedTriggers, setSelectedTriggers } = useFtcLive();
  const [scenes, setScenes] = useState<ObsScene[]>([]);

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

  return (
    <div className="section">
      <h2>Scene Swiching Settings</h2>
      <button onClick={handleFetchScenes} disabled={!isConnected}>Fetch Scenes</button>
      <br/>
      <div>
        <h3>Scene Assignments</h3>
        Field 1 Scene:
        <select
          onChange={(e) => setField1Scene(scenes.find(s => s.index === parseInt(e.target.value)))}
          value={field1Scene?.index || -1}
          disabled={scenes.length === 0 || !isConnected}
        >
          <option key={-1} value={-1}>Select Scene</option>
          {scenes.map((scene) => (
            <option key={scene.index} value={scene.index}>
              {scene.name}
            </option>
          ))}
        </select>
        <br/>
        Field 2 Scene:
        <select
          onChange={(e) => setField2Scene(scenes.find(s => s.index === parseInt(e.target.value)))}
          value={field2Scene?.index || -1}
          disabled={scenes.length === 0 || !isConnected}
        >
          <option key={-1} value={-1}>Select Scene</option>
          {scenes.map((scene) => (
            <option key={scene.index} value={scene.index}>
              {scene.name}
            </option>
          ))}
        </select>
      </div>
      <br/>
      <div>
        <h3>Transition Triggers</h3>
        {UpdateTypes.map((type) => (
          <>
            <input
              name={type}
              type="checkbox"
              checked={selectedTriggers.includes(type)}
              onChange={() => handleTriggerChange(type)}
            />
            <label onClick={() => handleTriggerChange(type)}>
              {type}
            </label>
            <br/>
          </>
        ))}
      </div>
    </div>
  );
};

export default SceneMapper;
