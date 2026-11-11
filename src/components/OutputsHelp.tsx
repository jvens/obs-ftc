import React from 'react';

// The help beside Outputs: what each output saves, and which to use.
const OutputsHelp: React.FC = () => (
  <>
    <h3>What this view is for</h3>
    <p>What the dashboard saves for each match while the event runs. The files go to OBS's recording folder (Settings &gt; Output &gt; Recording Path), and <a href="#matches">Matches</a> lists them for each match.</p>
    <h3>Individual Match Recording</h3>
    <p>The recommended way to get a video of each match. OBS's replay buffer keeps the last few minutes in memory; after each match the dashboard saves the time before it, the match and the time after it as a file of its own.</p>
    <ul>
      <li>The replay buffer has to be running. While this is on, the header shows its state and warns when it is not.</li>
      <li>The buffer has to be exactly as long as the times here add up to. If it is not, click <strong>Set to ... seconds</strong>.</li>
    </ul>
    <h3>Screenshots</h3>
    <p>A picture of the stream at the match preview, the randomization and the results: handy for social media and for checking a score later.</p>
    <h3>YouTube Chapters</h3>
    <p>One chapter per match for the stream's video. Click <strong>Sync with OBS</strong> once the stream has started, then paste the list into the video's description.</p>
    <h3>Match Recording</h3>
    <p>Not recommended. It starts and stops OBS's own recording for each match, so there is no recording of the whole event, and it stops a recording started in OBS by hand. Use Individual Match Recording instead.</p>
  </>
);

export default OutputsHelp;
