import React from 'react';

// The help beside Run: what each part of the view does during the event.
const RunHelp: React.FC = () => (
  <>
    <h3>What this view is for</h3>
    <p>Running the stream during the event. Start streaming and recording in OBS itself; the header shows whether OBS is doing either.</p>
    <h3>Scenes</h3>
    <ul>
      <li>Click a scene to put it on the stream now, for awards, alliance selection or a break. The scene on the stream is marked <strong>On stream</strong>.</li>
      <li>Automatic switching stays on: the next match event switches back to that match's field, so there is nothing to turn back on.</li>
      <li>Which match events switch scenes is set in <a href="#setup/switching">Setup: Scene switching</a>.</li>
      <li>Untick <strong>Live previews</strong> if this computer struggles: the previews take screenshots from OBS every few seconds.</li>
    </ul>
    <h3>Lower thirds</h3>
    <ul>
      <li>A name and title across the bottom of the screen, for a speaker or an award. They show in the Ceremony scene and in custom camera scenes.</li>
      <li>Click <strong>Edit list</strong> before the event to type them in, or paste two columns from a spreadsheet under Import.</li>
      <li>Point at <strong>Show</strong> to preview one; click it to put it on the stream, and <strong>Hide</strong> to take it off. It also hides by itself after the time set under Browser source settings.</li>
    </ul>
    <h3>On the fields</h3>
    <p>Each field's latest match from FTC Live, how far along it is, and the teams playing.</p>
  </>
);

export default RunHelp;
