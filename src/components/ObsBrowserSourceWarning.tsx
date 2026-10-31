import React from 'react';

// OBS's browser source (obs-browser / CEF) injects window.obsstudio into every page it loads,
// and recent versions also add "OBS/<version>" to the user agent.
export const isRunningInObs = (): boolean =>
  'obsstudio' in window || /\bOBS\//.test(navigator.userAgent);

// Shown instead of the dashboard when someone has added it to OBS as a browser source.
// The dashboard is meant to run in a regular browser and reach OBS over the websocket.
const ObsBrowserSourceWarning: React.FC = () => {
  const appUrl = window.location.origin + window.location.pathname;

  return (
    <div className="obs-source-warning">
      <div className="obs-source-warning-icon">!</div>
      <h1>Open this page in Chrome, not in OBS</h1>
      <p>
        This dashboard was loaded as an OBS browser source. It will not work here.
      </p>
      <ol>
        <li>Delete this browser source from your OBS scene.</li>
        <li>
          Open <strong>{appUrl}</strong> in Chrome (or another web browser) on this computer.
        </li>
        <li>
          Connect to OBS from the browser with the OBS WebSocket settings
          (Tools &rarr; WebSocket Server Settings in OBS).
        </li>
      </ol>
      <p className="obs-source-warning-note">
        The only page meant to be a browser source is the lower-third overlay. The Lower Thirds
        panel in the dashboard gives you its URL.
      </p>
    </div>
  );
};

export default ObsBrowserSourceWarning;
