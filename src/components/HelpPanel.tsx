import React from 'react';

interface Props {
  title: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

// The help on the right of a view. Hidden, it folds into a tab on the edge (a bar under the view on
// a phone) that opens it again.
const HelpPanel: React.FC<Props> = ({ title, open, onOpen, onClose, children }) => open ? (
  <aside className="help-sidebar" aria-label="Help">
    <div className="help-sidebar-header">
      <h2>{title}</h2>
      <button className="icon-button" onClick={onClose} aria-label="Hide help" title="Hide help">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l6 6-6 6M13 6l6 6-6 6" /></svg>
      </button>
    </div>
    <div className="help-sidebar-body">{children}</div>
  </aside>
) : (
  <div className="help-tab-strip">
    <button className="help-tab" onClick={onOpen} aria-label="Show help" title="Show help">
      <span className="help-tab-icon" aria-hidden="true">?</span>
      <span className="help-tab-label" aria-hidden="true">Help</span>
    </button>
  </div>
);

export default HelpPanel;
