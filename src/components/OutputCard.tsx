import React from 'react';

export interface OutputStatus {
  tone: 'ok' | 'live' | 'warn' | 'off';
  text: string;
}

interface Props {
  title: string;
  // One line on what the output saves.
  hint: React.ReactNode;
  status?: OutputStatus;
  // The on/off switch; outputs without one (YouTube chapters) are always on.
  toggle?: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };
  children: React.ReactNode;
}

// One output on the Outputs view: its name and status, a switch to turn it on, and its settings,
// shown once it is on.
const OutputCard: React.FC<Props> = ({ title, hint, status, toggle, children }) => (
  <div className="section output-card">
    <div className="output-card-header">
      <h2>{title}</h2>
      {status && (
        <span className={`status-pill ${status.tone}`}>
          {(status.tone === 'live' || status.tone === 'warn') && <span className="status-dot" aria-hidden="true" />}
          {status.text}
        </span>
      )}
    </div>
    <p className="output-card-hint">{hint}</p>
    {toggle && (
      <label className="output-card-toggle">
        <input type="checkbox" checked={toggle.checked} disabled={toggle.disabled} onChange={(e) => toggle.onChange(e.target.checked)} />
        {toggle.label}
      </label>
    )}
    {(!toggle || toggle.checked) && <div className="output-card-body">{children}</div>}
  </div>
);

export default OutputCard;
