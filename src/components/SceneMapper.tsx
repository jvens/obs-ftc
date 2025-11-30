import React, { useState } from "react";
import { useObsStudio } from "../contexts/ObsStudioContext";
import { UpdateType } from "../types/FtcLive";
import { useFtcLive } from "../contexts/FtcLiveContext";

const SceneMapper = () => {
  const {
    fetchScenes,
    status,
    field0Scene,
    field1Scene,
    field2Scene,
    setField0Scene,
    setField1Scene,
    setField2Scene,
  } = useObsStudio();
  const {
    transitionTriggers: selectedTriggers,
    setTransitionTriggers: setSelectedTriggers,
    isConnected: isFtcLiveConnected,
  } = useFtcLive();
  const [scenes, setScenes] = useState<string[]>([]);

  const handleFetchScenes = async () => {
    const fetchedScenes = await fetchScenes();
    setScenes(fetchedScenes);
  };

  const handleTriggerChange = (updateType: UpdateType) => {
    setSelectedTriggers((prevSelectedTriggers) =>
      prevSelectedTriggers.includes(updateType)
        ? prevSelectedTriggers.filter((type) => type !== updateType)
        : [...prevSelectedTriggers, updateType]
    );
  };

  const getStatus =
    status.connected && isFtcLiveConnected && field1Scene && field2Scene;

  return (
    <div className="section">
      <h2>Scene Swiching Settings</h2>
      <button onClick={handleFetchScenes} disabled={!status.connected}>
        Fetch Scenes
      </button>
      <br />
      <div>
        <h3>Scene Assignments</h3>
        Field 1 Scene:
        <select
          onChange={(e) =>
            setField1Scene(scenes.find((s) => s === e.target.value))
          }
          value={field1Scene || "Select Scene"}
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
          onChange={(e) =>
            setField2Scene(scenes.find((s) => s === e.target.value))
          }
          value={field2Scene || "Select Scene"}
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
          onChange={(e) =>
            setField0Scene(scenes.find((s) => s === e.target.value))
          }
          value={field0Scene || "Select Scene"}
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
        <p>Select the events that will cause the OBS scene to switch.</p>
        <table className="trigger-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Switch Scene</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><label htmlFor="trigger-MATCH_LOAD">Match Load</label></td>
              <td>
                <input
                  id="trigger-MATCH_LOAD"
                  type="checkbox"
                  checked={selectedTriggers.includes("MATCH_LOAD")}
                  onChange={() => handleTriggerChange("MATCH_LOAD")}
                />
              </td>
            </tr>
            <tr>
              <td><label htmlFor="trigger-SHOW_PREVIEW">Show Preview</label></td>
              <td>
                <input
                  id="trigger-SHOW_PREVIEW"
                  type="checkbox"
                  checked={selectedTriggers.includes("SHOW_PREVIEW")}
                  onChange={() => handleTriggerChange("SHOW_PREVIEW")}
                />
              </td>
            </tr>
            <tr>
              <td><label htmlFor="trigger-SHOW_RANDOM">Show Random</label></td>
              <td>
                <input
                  id="trigger-SHOW_RANDOM"
                  type="checkbox"
                  checked={selectedTriggers.includes("SHOW_RANDOM")}
                  onChange={() => handleTriggerChange("SHOW_RANDOM")}
                />
              </td>
            </tr>
            <tr>
              <td><label htmlFor="trigger-SHOW_MATCH">Show Match</label></td>
              <td>
                <input
                  id="trigger-SHOW_MATCH"
                  type="checkbox"
                  checked={selectedTriggers.includes("SHOW_MATCH")}
                  onChange={() => handleTriggerChange("SHOW_MATCH")}
                />
              </td>
            </tr>
            <tr>
              <td><label htmlFor="trigger-MATCH_START">Match Start</label></td>
              <td>
                <input
                  id="trigger-MATCH_START"
                  type="checkbox"
                  checked={selectedTriggers.includes("MATCH_START")}
                  onChange={() => handleTriggerChange("MATCH_START")}
                />
              </td>
            </tr>
            <tr>
              <td><label htmlFor="trigger-MATCH_COMMIT">Match Commit</label></td>
              <td>
                <input
                  id="trigger-MATCH_COMMIT"
                  type="checkbox"
                  checked={selectedTriggers.includes("MATCH_COMMIT")}
                  onChange={() => handleTriggerChange("MATCH_COMMIT")}
                />
              </td>
            </tr>
            <tr>
              <td><label htmlFor="trigger-MATCH_POST">Match Post</label></td>
              <td>
                <input
                  id="trigger-MATCH_POST"
                  type="checkbox"
                  checked={selectedTriggers.includes("MATCH_POST")}
                  onChange={() => handleTriggerChange("MATCH_POST")}
                />
              </td>
            </tr>
            <tr>
              <td><label htmlFor="trigger-MATCH_ABORT">Match Abort</label></td>
              <td>
                <input
                  id="trigger-MATCH_ABORT"
                  type="checkbox"
                  checked={selectedTriggers.includes("MATCH_ABORT")}
                  onChange={() => handleTriggerChange("MATCH_ABORT")}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <br />
      <div>
        Status:
        <span
          className={`connection-status ${
            getStatus ? "connected" : "disconnected"
          }`}
        >
          {getStatus ? "Running" : "Not Running"}
        </span>
      </div>
    </div>
  );
};

export default SceneMapper;
