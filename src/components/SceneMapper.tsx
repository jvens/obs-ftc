import React, { useState } from "react";
import { useObsStudio } from "../contexts/ObsStudioContext";
import { UpdateType } from "../types/FtcLive";
import { useFtcLive } from "../contexts/FtcLiveContext";
import { useAppSelector } from "../store/hooks";
import { selectSelectedEvent } from "../store/connectionSlice";

const SceneMapper = () => {
  const {
    fetchScenes,
    status,
    field0Scene,
    field1Scene,
    field2Scene,
    field3Scene,
    setField0Scene,
    setField1Scene,
    setField2Scene,
    setField3Scene,
  } = useObsStudio();
  const {
    transitionTriggers: selectedTriggers,
    setTransitionTriggers: setSelectedTriggers,
    isConnected: isFtcLiveConnected,
  } = useFtcLive();
  const selectedEvent = useAppSelector(selectSelectedEvent);
  const fieldCount = selectedEvent?.fieldCount ?? 2;
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

  // Determine if status is ready based on field count
  const getStatus = () => {
    if (!status.connected || !isFtcLiveConnected) return false;
    if (fieldCount === 1) return !!field1Scene;
    if (fieldCount === 2) return !!field1Scene && !!field2Scene && !!field0Scene;
    if (fieldCount === 3) return !!field1Scene && !!field2Scene && !!field3Scene && !!field0Scene;
    return false;
  };

  const renderSceneSelect = (
    label: string,
    value: string | undefined,
    onChange: (scene: string | undefined) => void
  ) => (
    <>
      {label}:
      <select
        onChange={(e) => onChange(scenes.find((s) => s === e.target.value))}
        value={value || "Select Scene"}
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
    </>
  );

  return (
    <div className="section tall">
      <h2>Scene Switching Settings</h2>
      <button onClick={handleFetchScenes} disabled={!status.connected}>
        Fetch Scenes
      </button>
      <br />
      <div>
        <h3>Scene Assignments</h3>
        {fieldCount === 1 ? (
          // Single field - just one scene assignment
          renderSceneSelect("Scene", field1Scene, setField1Scene)
        ) : (
          // Multiple fields - show field 1, 2, optionally 3, and finals
          <>
            {renderSceneSelect("Field 1 Scene", field1Scene, setField1Scene)}
            {renderSceneSelect("Field 2 Scene", field2Scene, setField2Scene)}
            {fieldCount >= 3 && renderSceneSelect("Field 3 Scene", field3Scene, setField3Scene)}
            {renderSceneSelect("Finals Scene", field0Scene, setField0Scene)}
          </>
        )}
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
            getStatus() ? "connected" : "disconnected"
          }`}
        >
          {getStatus() ? "Running" : "Not Running"}
        </span>
      </div>
    </div>
  );
};

export default SceneMapper;
