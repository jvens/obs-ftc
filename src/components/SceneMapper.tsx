import React, { useState } from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { UpdateTypes } from '../types/FtcLive';

interface SceneOption {
  name: string;
  sceneName: string;
}

const SceneMapper = () => {
  const { fetchScenes, isConnected } = useObsStudio();
  const [scenes, setScenes] = useState<SceneOption[]>([]);

  const handleFetchScenes = async () => {
    const fetchedScenes = await fetchScenes();
    setScenes(fetchedScenes.map((scene: any) => ({ name: scene.sceneName, sceneName: '' })));
  };

  const handleSceneSelectionChange = (updateType: string, selectedScene: string) => {
    // Implement the logic to associate an update type with a selected scene
  };

  return (
    <>
      <button onClick={handleFetchScenes} disabled={!isConnected}>Fetch Scenes</button>
      <table>
        <thead>
          <tr>
            <th>Update Type</th>
            <th>Scene Selection</th>
          </tr>
        </thead>
        <tbody>
          {UpdateTypes.map((updateType) => (
            <tr key={updateType}>
              <td>{updateType}</td>
              <td>
                <select
                  onChange={(e) => handleSceneSelectionChange(updateType, e.target.value)}
                  value={scenes.find((scene) => scene.name === updateType)?.sceneName || ''}
                  disabled={scenes.length === 0}
                >
                  <option value="">Select a Scene</option>
                  {scenes.map((scene) => (
                    <option key={scene.name} value={scene.name}>
                      {scene.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export default SceneMapper;
