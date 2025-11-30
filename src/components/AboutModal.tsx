import React from 'react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>About FTC OBS WebSocket Client</h2>

        <p>
          This application provides integration between OBS Studio and the FTC Live
          scoring system, allowing automated scene switching, match recording, and
          screenshot capture based on match events.
        </p>

        <h3>Author</h3>
        <p>Jeramie Vens</p>

        <h3>License</h3>
        <p>MIT License</p>

        <h3>Feedback</h3>
        <p>
          Please submit feature requests and bug reports on{' '}
          <a href="https://github.com/jvens/obs-ftc/issues" target="_blank" rel="noopener noreferrer">
            GitHub Issues
          </a>.
        </p>

        <div className="modal-disclaimer">
          <strong>Disclaimer:</strong> This is not an official project of <em>FIRST</em>.
          It is independently developed and volunteer maintained.
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
