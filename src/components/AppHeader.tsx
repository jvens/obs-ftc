import React from 'react';
import { useFtcLive } from '../contexts/FtcLiveContext';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { useAppSelector } from '../store/hooks';
import { selectSelectedEvent } from '../store/connectionSlice';
import { VIEWS, ViewId } from '../helpers/views';
import { Theme } from '../helpers/theme';

interface Props {
  view: ViewId;
  onAbout: () => void;
  // Whether the help sidebar is open; undefined on views without one.
  helpOpen?: boolean;
  onToggleHelp: () => void;
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

// The logo, the views, and the connection status, which stays in view on every view.
const AppHeader: React.FC<Props> = ({ view, onAbout, helpOpen, onToggleHelp, theme, onToggleTheme }) => {
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

      <div className="header-status" role="group" aria-label="Connection status">
        <Pill tone={ftcConnected ? 'ok' : 'off'} label={`FTC Live${ftcConnected && event ? ` · ${event.eventCode}` : ''}`} offText="FTC Live not connected" />
        <Pill tone={status.connected ? 'ok' : 'off'} label="OBS" offText="OBS not connected" />
        <Pill tone={status.recording ? 'live' : 'off'} label="Recording" offText="Not recording" />
        <Pill tone={status.streaming ? 'live' : 'off'} label="Streaming" offText="Not streaming" />
      </div>

      <div className="header-links">
        {helpOpen !== undefined && (
          <button className={`help-button${helpOpen ? ' on' : ''}`} onClick={onToggleHelp} aria-pressed={helpOpen} aria-label="Help" title={helpOpen ? 'Hide help' : 'Show help'}>?</button>
        )}
        <button className="icon-link theme-button" onClick={onToggleTheme} aria-pressed={theme === 'dark'} aria-label="Dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          )}
        </button>
        <button className="about-button" onClick={onAbout} title="About" aria-label="About">
          <span className="info-icon" aria-hidden="true">i</span>
        </button>
        <a href="https://github.com/jvens/obs-ftc" target="_blank" rel="noopener noreferrer" className="icon-link" title="View on GitHub" aria-label="View on GitHub">
          <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </div>
    </header>
  );
};

export default AppHeader;
