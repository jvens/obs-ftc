import React, { useEffect, useMemo, useState } from 'react';
import { useFtcLive } from '../contexts/FtcLiveContext';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { usePersistentState } from '../helpers/persistant';
import { cameraThumbnail } from '../obsSetup/cameras';
import { runScenes } from './scenes';

const PREVIEW_INTERVAL_MS = 3000;

interface Props {
  // On screen: previews only refresh while someone can see them.
  active: boolean;
}

// The scenes as big buttons that put a scene on the stream. Automatic switching is never turned off
// here: a scene picked by hand (awards, alliance selection) stays on until the next match event
// switches back to that match's field, so nothing has to be remembered and turned back on.
const SceneButtons: React.FC<Props> = ({ active }) => {
  const { status, scenes, programScene, switchScenes, callObs } = useObsStudio();
  const { isConnected: ftcConnected, transitionTriggers } = useFtcLive();
  const [livePreviews, setLivePreviews] = usePersistentState('runScenePreviews', true);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const buttons = useMemo(() => runScenes(scenes), [scenes]);

  useEffect(() => {
    if (!status.connected || !livePreviews || !active) return;
    const capture = () => buttons.forEach(scene =>
      cameraThumbnail(callObs, scene).map(image => setThumbnails(previous => ({ ...previous, [scene]: image }))));
    capture();
    const timer = setInterval(capture, PREVIEW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status.connected, livePreviews, active, buttons, callObs]);

  const switching = transitionTriggers.length === 0 ? 'off' : ftcConnected ? 'on' : 'waiting';

  return (
    <div className="section full-width run-scenes">
      <div className="run-scenes-header">
        <h2>Scenes</h2>
        <span className={`status-pill ${switching === 'on' ? 'ok' : 'off'}`}>
          {switching === 'on' && <span className="status-dot" aria-hidden="true" />}
          {switching === 'on' ? 'Automatic switching on'
            : switching === 'waiting' ? 'Automatic switching waits for FTC Live' : 'Automatic switching off'}
        </span>
      </div>
      <p className="run-scenes-hint">
        {switching === 'off'
          ? <>No match events are set to switch scenes. Choose them in <a href="#setup/switching">Setup: Scene switching</a>.</>
          : 'Click a scene to put it on the stream now, for awards or alliance selection. The next match event switches back to its field, so there is nothing to turn back on.'}
      </p>

      {!status.connected ? (
        <p className="run-scenes-empty">Connect to OBS in <a href="#setup/obs">Setup</a> to switch scenes here.</p>
      ) : buttons.length === 0 ? (
        <p className="run-scenes-empty">OBS has no scenes yet. Build them in <a href="#setup/scenes">Setup: Scenes and cameras</a>.</p>
      ) : (
        <>
          <div className="scene-grid">
            {buttons.map(scene => {
              const onStream = scene === programScene;
              return (
                <button key={scene} className={`scene-button${onStream ? ' on-stream' : ''}`} onClick={() => switchScenes(scene)}
                  aria-pressed={onStream} title={onStream ? `${scene} is on the stream` : `Put ${scene} on the stream`}>
                  <span className="scene-thumb">
                    {livePreviews && thumbnails[scene] ? <img src={thumbnails[scene]} alt="" /> : <span>{scene}</span>}
                  </span>
                  <span className="scene-caption">
                    <span className="scene-name">{scene}</span>
                    {onStream && <span className="status-pill live">On stream</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="run-scenes-previews">
            <input type="checkbox" checked={livePreviews} onChange={(e) => setLivePreviews(e.target.checked)} />
            Live previews
          </label>
        </>
      )}
    </div>
  );
};

export default SceneButtons;
