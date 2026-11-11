import React from 'react';
import { useFtcLive } from '../contexts/FtcLiveContext';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useAppSelector } from '../store/hooks';
import { selectSelectedEvent } from '../store/connectionSlice';
import { VIEWS, ViewId } from '../helpers/views';
import { Theme } from '../helpers/theme';

interface Props {
  view: ViewId;
  theme: Theme;
  onToggleTheme: () => void;
}

// A short label keeps the header on two lines. An off pill is grey with no dot; its tooltip and
// screen readers get the whole phrase ("OBS not connected").
const Pill: React.FC<{ tone: 'ok' | 'live' | 'off'; label: string; offText: string }> = ({ tone, label, offText }) =>
  tone === 'off' ? (
    <span className="status-pill off" title={offText}>
      <span aria-hidden="true">{label}</span>
      <span className="visually-hidden">{offText}</span>
    </span>
  ) : (
    <span className={`status-pill ${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );

// The logo, the views, the camera page, the connection status and dark mode, on every view. What the
// project is and where its code lives are on About.
const AppHeader: React.FC<Props> = ({ view, theme, onToggleTheme }) => {
  const { isConnected: ftcConnected } = useFtcLive();
  const { status } = useObsStudio();
  const event = useAppSelector(selectSelectedEvent);

  return (
    <header className="App-header">
      <div className="app-brand">
        <img src="/favicon.svg" alt="" width={32} height={32} />
        <h1>FTC OBS</h1>
      </div>

      <nav className="view-tabs" aria-label="Views">
        {VIEWS.map(({ id, label }) => (
          <a key={id} className="view-tab" href={`#${id}`} aria-current={id === view ? 'page' : undefined}>{label}</a>
        ))}
      </nav>

      {/* Camera computers open this site too, to get to the camera page. */}
      <a href="/camera" className="camera-page-link" title="Send a webcam on this computer to OBS">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 10l5-3v10l-5-3z" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>
        Create LAN Camera
      </a>

      <div className="header-spacer" />

      {/* The status and dark mode wrap onto the next line together. */}
      <div className="header-end">
        <div className="header-status" role="group" aria-label="Connection status">
          <Pill tone={ftcConnected ? 'ok' : 'off'} label={`FTC Live${ftcConnected && event ? ` · ${event.eventCode}` : ''}`} offText="FTC Live not connected" />
          <Pill tone={status.connected ? 'ok' : 'off'} label="OBS" offText="OBS not connected" />
          <Pill tone={status.recording ? 'live' : 'off'} label="Recording" offText="Not recording" />
          <Pill tone={status.streaming ? 'live' : 'off'} label="Streaming" offText="Not streaming" />
        </div>

        <div className="header-links">
          <button className="icon-link theme-button" onClick={onToggleTheme} aria-pressed={theme === 'dark'} aria-label="Dark mode"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
