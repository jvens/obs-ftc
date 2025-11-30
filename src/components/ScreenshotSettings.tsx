import React from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useFtcLive } from '../contexts/FtcLiveContext';

const ScreenshotSettings: React.FC = () => {
  const { status } = useObsStudio();
  const {
    enableScreenshots,
    setEnableScreenshots,
    screenshotPreviewDelay,
    setScreenshotPreviewDelay,
    screenshotRandomDelay,
    setScreenshotRandomDelay,
    screenshotResultDelay,
    setScreenshotResultDelay
  } = useFtcLive();

  return (
    <div className="section">
      <h2>Screenshot Settings</h2>
      <p>Automatically capture screenshots at key match moments.</p>

      <div>
        <label>
          <input
            type="checkbox"
            checked={enableScreenshots}
            onChange={(e) => setEnableScreenshots(e.target.checked)}
            disabled={!status.connected}
          />
          Enable Screenshots
        </label>
      </div>

      {enableScreenshots && (
        <>
          <div>
            <h3>Screenshot Delays</h3>
            <p>Time to wait after each event before taking the screenshot (in seconds).</p>

            <div>
              <label>
                Match Preview:
                <input
                  type="number"
                  value={screenshotPreviewDelay / 1000}
                  onChange={(e) => setScreenshotPreviewDelay(Math.round(parseFloat(e.target.value) * 1000) || 0)}
                  min={0}
                  step={0.1}
                  style={{ marginLeft: '10px', width: '80px' }}
                />
                s
              </label>
            </div>

            <div>
              <label>
                Randomization:
                <input
                  type="number"
                  value={screenshotRandomDelay / 1000}
                  onChange={(e) => setScreenshotRandomDelay(Math.round(parseFloat(e.target.value) * 1000) || 0)}
                  min={0}
                  step={0.1}
                  style={{ marginLeft: '10px', width: '80px' }}
                />
                s
              </label>
            </div>

            <div>
              <label>
                Match Result:
                <input
                  type="number"
                  value={screenshotResultDelay / 1000}
                  onChange={(e) => setScreenshotResultDelay(Math.round(parseFloat(e.target.value) * 1000) || 0)}
                  min={0}
                  step={0.1}
                  style={{ marginLeft: '10px', width: '80px' }}
                />
                s
              </label>
            </div>
          </div>

          <div>
            Status:
            <span className={`connection-status ${status.connected ? 'connected' : 'disconnected'}`}>
              {status.connected ? 'Ready' : 'Not Connected'}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default ScreenshotSettings;
