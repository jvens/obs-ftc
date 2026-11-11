import React from 'react';
import { SetupStepId } from './steps';
import HelpPanel from '../components/HelpPanel';
import { lanCameraPageUrl } from '../lanCamera/urls';

// The help sidebar's text for each Setup step: what the step does and how to do it.
const HELP: Record<SetupStepId, React.ReactNode> = {
  'ftc-live': (
    <>
      <h3>What this step does</h3>
      <p>Connects the dashboard to the FTC Live scoring system, so it knows the event, its fields and every match as it happens.</p>
      <h3>How</h3>
      <ol>
        <li>Enter the address of the FTC Live computer, as you would type it in a browser (for example <code>192.168.1.10</code>), or <code>localhost</code> if FTC Live runs on this computer.</li>
        <li>Click <strong>Get Event Codes</strong> and pick the event.</li>
        <li>Click <strong>Connect</strong>.</li>
      </ol>
      <h3>If it cannot connect</h3>
      <p>Chrome and Edge ask to access devices on your local network: choose Allow. Firefox cannot connect to FTC Live on another computer from this site; use Chrome or Edge.</p>
    </>
  ),
  obs: (
    <>
      <h3>What this step does</h3>
      <p>Connects to OBS Studio, which streams and records the event. The dashboard sets OBS up and switches its scenes.</p>
      <h3>How</h3>
      <ol>
        <li>In OBS, open <strong>Tools &gt; WebSocket Server Settings</strong> and tick <strong>Enable WebSocket server</strong>.</li>
        <li><strong>Show Connect Info</strong> there gives the port and password to enter here.</li>
        <li>Use <code>localhost</code> as the address: run this dashboard on the OBS computer, so OBS can reach FTC Live at the same address the dashboard uses.</li>
      </ol>
      <div className="help-callout">
        <strong>New to OBS Studio?</strong>
        <span>Download it from <a href="https://obsproject.com/download" target="_blank" rel="noopener noreferrer">obsproject.com</a>, install it, and open it once before this step.</span>
      </div>
    </>
  ),
  scenes: (
    <>
      <h3>What this step does</h3>
      <p>Builds the scenes OBS shows during the event. Each field scene has the FTC Live overlay on top of that field's camera, with a safe background behind in case a camera drops.</p>
      <h3>Which button</h3>
      <ul>
        <li><strong>Set up in a new scene collection</strong>: the first time, or for a fresh start. The old collection stays in OBS.</li>
        <li><strong>Update for this event</strong>: for the next event, or when FTC Live gains a field. Camera choices and anything you added are kept, and new scenes go in their place in the list.</li>
        <li><strong>Wipe and set up</strong>: deletes everything in the current collection first.</li>
      </ul>
      <p>When OBS does not match this event (a scene missing, or the overlay showing another event), a warning above the buttons says what is wrong. <strong>Update for this event</strong> fixes it.</p>
      <h3>Choosing a camera type</h3>
      <ul>
        <li><strong>Video Capture Device</strong>: a webcam or capture card plugged into this computer.</li>
        <li><strong>LAN Camera</strong>: a webcam on another computer on the event network. On that computer, open{' '}
          <a href={lanCameraPageUrl()} target="_blank" rel="noopener noreferrer">{lanCameraPageUrl()}</a> (or click Create LAN Camera at the
          top of this site there), name the camera and click Start sending. Then pick that name here.</li>
        <li><strong>NDI Source</strong>: a network camera or another computer running NDI.</li>
        <li><strong>Same as another camera</strong>: one camera covering two roles, such as Field 1 and the ceremony.</li>
      </ul>
      <p>To use something else, such as a video switcher, a second capture card or a media file, put it in the camera's scene in OBS (the scenes named "Camera - ..."). Every scene that shows that camera follows.</p>
      <h3>Custom cameras</h3>
      <p>Add a camera for anything else worth showing, like the audience or the pits. It gets a scene named after it, with a button on Run, and the FTC Live overlay on top unless you untick it: a pit camera during a long field delay may look better without the score bar.</p>
      <p>A pit camera is not the Pit Display scene, which is FTC Live's full-screen rankings and results with no camera.</p>
    </>
  ),
  audio: (
    <>
      <h3>What this step does</h3>
      <p>Chooses where the stream's sound comes from.</p>
      <ul>
        <li><strong>Audio input device</strong>: the venue's sound, from a capture card, a mixer, Dante Virtual Soundcard or a microphone. Pick the device once the scenes are built.</li>
        <li><strong>Audio from the cameras</strong>: each scene plays its camera's sound.</li>
        <li><strong>No event audio</strong>: only the FTC Live match sounds, if they are on.</li>
      </ul>
      <h3>FTC Live match sounds</h3>
      <p>The start, end and buzzer sounds from FTC Live. Turn them off if the venue audio already carries them, or they play twice.</p>
      <p>OBS gets these choices when the scenes are built: after changing them, click <strong>Update OBS</strong>.</p>
    </>
  ),
  settings: (
    <>
      <h3>What this step does</h3>
      <p>Sets OBS to stream and record at 1080p and 30 fps, at a bitrate most event internet can carry, and turns on the replay buffer that match replays come from.</p>
      <h3>What it leaves alone</h3>
      <p>The stream key and the encoder. Set the stream key in OBS under <strong>Settings &gt; Stream</strong>.</p>
      <p>Stop streaming and recording first: OBS cannot change these while either is running.</p>
    </>
  ),
  switching: (
    <>
      <h3>What this step does</h3>
      <p>Chooses which OBS scene shows each field's matches, and which match events switch to it.</p>
      <h3>Field scenes</h3>
      <p>Setup assigns the Field scenes it builds. Change them only if you use scenes of your own. With more than one field, finals are played on one of them: pick its scene too.</p>
      <h3>Switch on these match events</h3>
      <p>The match events that switch the stream to the match's field. The defaults switch when the match preview, the randomization and the match are shown, when the match starts, and when its results are posted.</p>
    </>
  ),
};

interface Props {
  step: SetupStepId;
  title: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const SetupHelp: React.FC<Props> = ({ step, title, open, onOpen, onClose }) => (
  <HelpPanel title={title} open={open} onOpen={onOpen} onClose={onClose}>{HELP[step]}</HelpPanel>
);

export default SetupHelp;
