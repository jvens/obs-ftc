import React from 'react';
import OutputCard from './OutputCard';
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

  const delayField = (label: string, value: number, set: (ms: number) => void) => (
    <label>
      {label}
      <input type="number" value={value / 1000} onChange={(e) => set(Math.round(parseFloat(e.target.value) * 1000) || 0)} min={0} step={0.1} />
    </label>
  );

  return (
    <OutputCard
      title="Screenshots"
      hint="Saves a screenshot of the stream at three points in each match: the match preview, the randomization and the results."
      status={!status.connected ? { tone: 'off', text: 'OBS not connected' } : enableScreenshots ? { tone: 'ok', text: 'On' } : { tone: 'off', text: 'Off' }}
      toggle={{ label: 'Take screenshots', checked: enableScreenshots, onChange: setEnableScreenshots, disabled: !status.connected }}
    >
      <p className="output-card-note">Seconds to wait after each event before the screenshot.</p>
      <div className="output-fields">
        {delayField('After the match preview (s)', screenshotPreviewDelay, setScreenshotPreviewDelay)}
        {delayField('After the randomization (s)', screenshotRandomDelay, setScreenshotRandomDelay)}
        {delayField('After the results (s)', screenshotResultDelay, setScreenshotResultDelay)}
      </div>
    </OutputCard>
  );
};

export default ScreenshotSettings;
