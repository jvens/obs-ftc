import React, { useState } from 'react';
import { useFtcLive } from '../contexts/FtcLiveContext';
import { useObsStudio } from '../contexts/ObsStudioContext';

interface Warning {
  id: string;
  text: string;
  // Where to fix it.
  link?: { href: string; label: string };
}

// Problems that need attention while live, under the header on every view, so they are seen whichever
// view is open. A dismissed warning comes back if its text changes.
const WarningsBanner: React.FC = () => {
  const { recordingError, isReconnecting: obsReconnecting } = useObsStudio();
  const { isReconnecting: ftcReconnecting } = useFtcLive();
  const [dismissed, setDismissed] = useState<Record<string, string>>({});

  const warnings: Warning[] = [
    ...(ftcReconnecting ? [{ id: 'ftc', text: 'Lost the connection to FTC Live. Reconnecting: scenes will not switch until it is back.', link: { href: '#setup/ftc-live', label: 'FTC Live connection' } }] : []),
    ...(obsReconnecting ? [{ id: 'obs', text: 'Lost the connection to OBS. Reconnecting.', link: { href: '#setup/obs', label: 'OBS connection' } }] : []),
    ...(recordingError ? [{ id: 'recording', text: recordingError, link: { href: '#outputs', label: 'Match recording' } }] : []),
  ].filter(warning => dismissed[warning.id] !== warning.text);

  if (warnings.length === 0) return null;
  return (
    <div className="warnings-banner" role="alert">
      {warnings.map(warning => (
        <div key={warning.id} className="warning-row">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></svg>
          <span className="warning-text">
            {warning.text}
            {warning.link && <> <a href={warning.link.href}>{warning.link.label}</a></>}
          </span>
          <button onClick={() => setDismissed(previous => ({ ...previous, [warning.id]: warning.text }))}>Dismiss</button>
        </div>
      ))}
    </div>
  );
};

export default WarningsBanner;
