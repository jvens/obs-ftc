import React, { useEffect } from "react";
import { useObsStudio } from "../contexts/ObsStudioContext";
import { UpdateType } from "../types/FtcLive";
import { useFtcLive } from "../contexts/FtcLiveContext";
import { useAppSelector } from "../store/hooks";
import { selectFieldCount } from "../store/connectionSlice";
import { SCENE_NAMES } from "../obsSetup/layout";

type SceneSetter = React.Dispatch<React.SetStateAction<string | undefined>>;

// The match events that can switch scenes, in the order a match goes through them.
const TRIGGERS: { type: UpdateType; label: string }[] = [
  { type: 'MATCH_LOAD', label: 'Match Load' },
  { type: 'SHOW_PREVIEW', label: 'Show Preview' },
  { type: 'SHOW_RANDOM', label: 'Show Random' },
  { type: 'SHOW_MATCH', label: 'Show Match' },
  { type: 'MATCH_START', label: 'Match Start' },
  { type: 'MATCH_ABORT', label: 'Match Abort' },
  { type: 'MATCH_COMMIT', label: 'Match Commit' },
  { type: 'MATCH_POST', label: 'Match Post' },
];

const SceneMapper = () => {
  const {
    scenes,
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
  } = useFtcLive();
  const fieldCount = useAppSelector(selectFieldCount);

  // Use the scenes Configure OBS Studio builds, unless a field already has a scene that still exists
  // in OBS, so custom choices are kept.
  useEffect(() => {
    const applyDefault = (setScene: SceneSetter, sceneName: string) =>
      setScene(current => current !== undefined && scenes.includes(current)
        ? current
        : scenes.includes(sceneName) ? sceneName : current);
    applyDefault(setField1Scene, SCENE_NAMES.field(1));
    if (fieldCount >= 2) applyDefault(setField2Scene, SCENE_NAMES.field(2));
    if (fieldCount >= 3) applyDefault(setField3Scene, SCENE_NAMES.field(3));
    // Finals are played on one field; field 1 is the usual choice.
    if (fieldCount >= 2) applyDefault(setField0Scene, SCENE_NAMES.field(1));
  }, [scenes, fieldCount, setField0Scene, setField1Scene, setField2Scene, setField3Scene]);

  const handleTriggerChange = (updateType: UpdateType) => {
    setSelectedTriggers((prevSelectedTriggers) =>
      prevSelectedTriggers.includes(updateType)
        ? prevSelectedTriggers.filter((type) => type !== updateType)
        : [...prevSelectedTriggers, updateType]
    );
  };

  const renderSceneSelect = (
    label: string,
    value: string | undefined,
    onChange: (scene: string | undefined) => void
  ) => (
    <label>
      {label}
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
    </label>
  );

  return (
    <div className="section setup-card">
      <h3>Field scenes</h3>
      <p className="setup-card-note">The OBS scene that shows each field's matches.</p>
      <div className="form-grid">
        {fieldCount === 1 ? (
          renderSceneSelect("Field scene", field1Scene, setField1Scene)
        ) : (
          <>
            {renderSceneSelect("Field 1", field1Scene, setField1Scene)}
            {renderSceneSelect("Field 2", field2Scene, setField2Scene)}
            {fieldCount >= 3 && renderSceneSelect("Field 3", field3Scene, setField3Scene)}
            {renderSceneSelect("Finals", field0Scene, setField0Scene)}
          </>
        )}
      </div>

      <h3>Switch on these match events</h3>
      <p className="setup-card-note">The stream switches to the match's field when FTC Live sends any of these.</p>
      <div className="check-grid">
        {TRIGGERS.map(({ type, label }) => (
          <label key={type}>
            <input type="checkbox" checked={selectedTriggers.includes(type)} onChange={() => handleTriggerChange(type)} />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
};

export default SceneMapper;
