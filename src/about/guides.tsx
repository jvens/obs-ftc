import React from 'react';

// The About view's guides: one layer below the overview, for the parts of streaming an event that
// need more than a paragraph. Each is a page of its own (#about/<guide>).

export const GUIDES = [
  { id: 'lan-cameras', title: 'Webcams on any computer' },
  { id: 'ndi', title: 'NDI cameras' },
  { id: 'match-videos', title: 'Uploading match videos' },
  { id: 'placement', title: 'Where to put the cameras' },
] as const;

export type GuideId = typeof GUIDES[number]['id'];

const Step: React.FC<{ number: number; title: React.ReactNode; children: React.ReactNode }> = ({ number, title, children }) => (
  <li>
    <span className="step-marker" aria-hidden="true">{number}</span>
    <span><strong>{title}</strong>{children}</span>
  </li>
);

const LanCameras: React.FC = () => (
  <>
    <p className="about-lead">
      A LAN camera is a webcam on any computer on the event network, sent to OBS over the network. All it needs is Chrome
      or Edge and a webcam: no capture card, and no long USB or HDMI cable back to the streaming computer. That makes it
      the cheapest way to put a camera on each field.
    </p>

    <h3 className="about-subtitle">Two ways events use it</h3>
    <div className="about-cards">
      <div className="about-card">
        <strong>A spare laptop and a webcam</strong>
        <span>An old laptop or a small, cheap computer, with a USB webcam on a tripod beside the field. Any computer that runs Chrome will do.</span>
      </div>
      <div className="about-card">
        <strong>The field display computer</strong>
        <span>
          The computer showing FTC Live's field display is already at the field. Plug a webcam into it and open the camera
          page in a second browser window, leaving the field display on its screen. If that computer struggles, pick
          720p on the camera page.
        </span>
      </div>
    </div>

    <h3 className="about-subtitle">Setting one up</h3>
    <ol className="about-steps">
      <Step number={1} title="On the OBS computer">
        In OBS, open Tools, WebSocket Server Settings: turn the server on, and note the computer's address, the port and
        the password (Show Connect Info lists them). The first time another computer connects, Windows asks to let OBS
        through the firewall: allow it.
      </Step>
      <Step number={2} title="On the camera computer">
        Open this site in Chrome or Edge and click <a href="/camera">Create LAN Camera</a> at the top. Allow the camera,
        and allow access to the local network when the browser asks.
      </Step>
      <Step number={3} title="Connect and send">
        Enter the OBS computer's address, port and password and click Connect. Name the camera (for example "Field 1
        tripod"), pick the webcam, and click Start sending.
      </Step>
      <Step number={4} title="Back on the OBS computer">
        In <a href="#setup/scenes">Setup: Scenes and cameras</a>, set the field's camera to LAN Camera and pick the name you
        gave it.
      </Step>
    </ol>

    <h3 className="about-subtitle">Good to know</h3>
    <ul className="about-list">
      <li>Keep the camera page open and the computer awake for as long as the camera is needed: turn off sleep.</li>
      <li>The video goes straight from the camera computer to the OBS computer. A wired network is steadier than Wi-Fi.</li>
      <li>A second computer sending under the same name takes over the camera, and the first stands by: a ready spare.</li>
      <li>The camera page remembers its settings and reconnects by itself if OBS or the network drops.</li>
      <li>Firefox cannot send a camera to OBS on another computer. Use Chrome or Edge.</li>
    </ul>
  </>
);

const Ndi: React.FC = () => (
  <>
    <p className="about-lead">
      NDI sends video over a network. Many PTZ cameras and video mixers send NDI, and so can a computer running NDI's free
      tools. OBS can show NDI video with the DistroAV plugin, and this dashboard can then use it like any other camera.
    </p>

    <h3 className="about-subtitle">Adding NDI to OBS</h3>
    <ol className="about-steps">
      <Step number={1} title="Close OBS">
        If an older NDI plugin for OBS (obs-ndi) is installed, remove it first.
      </Step>
      <Step number={2} title="Install the DistroAV plugin and the NDI Runtime">
        Both come from <a href="https://distroav.org/download" target="_blank" rel="noopener noreferrer">distroav.org</a>.
        On Windows, from a terminal: <code>winget install --exact --id DistroAV.DistroAV</code> and <code>winget install --exact --id NDI.NDIRuntime</code>.
        On Linux, use the Flatpak build of OBS with its DistroAV plugin, and install the NDI Runtime as the DistroAV
        page describes.
      </Step>
      <Step number={3} title="Restart the computer">
        Windows only picks up a new NDI Runtime after a restart.
      </Step>
      <Step number={4} title="Pick the camera">
        In <a href="#setup/scenes">Setup: Scenes and cameras</a>, set a camera to NDI Source and pick it from the list of NDI
        sources on the network.
      </Step>
    </ol>

    <h3 className="about-subtitle">Good to know</h3>
    <ul className="about-list">
      <li>DistroAV needs a recent OBS and NDI 6. If NDI Source is missing from the camera types, check the versions on distroav.org and restart.</li>
      <li>NDI cameras must be on the same network as the OBS computer.</li>
      <li>Full NDI uses a lot of network bandwidth. Use a wired network, and keep NDI cameras off busy Wi-Fi.</li>
    </ul>
  </>
);

const MatchVideos: React.FC = () => (
  <>
    <p className="about-lead">
      Teams love a video of their own match. If the dashboard recorded each match or saved its replay, every match is a
      file on the OBS computer, ready to upload after the event.
    </p>

    <h3 className="about-subtitle">During the event</h3>
    <p className="about-text">
      In <a href="#outputs">Outputs</a>, turn on <strong>Record each match</strong> or <strong>Save a replay after each
      match</strong> (or both), and <strong>Take screenshots</strong>. The files go to OBS's recording folder; screenshots
      are named after the event and the match, such as <code>usmnrq1_Q12_preview.png</code>.
    </p>

    <h3 className="about-subtitle">Afterwards</h3>
    <ol className="about-steps">
      <Step number={1} title="Find the files">
        Open <a href="#matches">Matches</a> and tick Show File Paths: each match lists its recording, replay and screenshots.
      </Step>
      <Step number={2} title="Upload to YouTube">
        In YouTube Studio, click Create, then Upload videos, and pick the match files. Name each after the match and its
        teams, such as "Q12: 1001, 2001 vs 3001, 4001", so teams can find theirs.
      </Step>
      <Step number={3} title="Put them in a playlist">
        Add the match videos to a playlist for the event, and share its link with the teams.
      </Step>
      <Step number={4} title="Chapters for the whole stream">
        YouTube keeps the live stream too. Paste the chapters from <a href="#outputs">Outputs</a> into its description so
        viewers can jump to any match.
      </Step>
    </ol>
  </>
);

const Placement: React.FC = () => (
  <>
    <p className="about-lead">Recommended camera positions for the fields, the ceremony and the pits, with diagrams.</p>
    <div className="about-note">
      <strong>Coming soon.</strong> This guide is not written yet.
    </div>
  </>
);

export const GUIDE_CONTENT: Record<GuideId, React.FC> = {
  'lan-cameras': LanCameras,
  ndi: Ndi,
  'match-videos': MatchVideos,
  placement: Placement,
};
