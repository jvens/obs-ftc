# Audio Sync (future work)

Status: idea only, to revisit once the OBS setup has been tested at events. Nothing here is implemented yet.

## The problem

Event audio and camera video reach OBS by different paths, so they arrive at different times:

- **Event Audio** (capture card, USB mixer, Dante Virtual Soundcard) usually arrives almost immediately, within a few milliseconds.
- **Cameras** are later: USB/HDMI capture adds roughly 1-3 frames, and NDI adds 50-200 ms or more depending on the
  sender, the network and the NDI latency setting. PTZ cameras and HDMI-over-IP extenders can add more.
- **FTC Live match sounds** come from the overlay browser source and are close to real time. If the venue feed also
  carries them (the field speakers picked up by mics, or the scoring PC's output in the mixer), they can play twice, out of step.

Viewers notice when audio leads video by more than about 45 ms (and when it trails by more than about 125 ms). The usual
symptom is the start buzzer being heard before the match visibly starts, or announcers' lips out of sync on the ceremony camera.

## What OBS offers

- Each audio source has a **Sync Offset** (Advanced Audio Properties), settable over the websocket with
  `SetInputAudioSyncOffset` (milliseconds, -950 to 20000). A positive offset delays that audio.
- Video can't be delayed per scene without a filter (the Render Delay filter adds up to 500 ms to a source).
- Camera latency differs per camera, but a stream has one audio feed. One offset on Event Audio can only match one
  camera, or a compromise between them.

## Proposed approach

1. **Manual offset in the dashboard.** In the Audio section, add an "Audio delay (ms)" input that sets the sync offset of
   Event Audio. Start from a default based on camera types (e.g. 0 ms for capture, ~100 ms when any camera is NDI) and
   show the current value read back from OBS.
2. **Clap test helper.** A "Sync test" button that switches program to a chosen camera and shows a short guide: clap in
   front of the camera near a mic, watch the OBS preview, and step the delay up or down in 20 ms increments until the
   sound lines up with the hands. Buttons for -20 / +20 ms make this a one-person job.
3. **Per-camera compensation (only if needed).** If field cameras differ a lot (one NDI, one USB), add a Render Delay
   filter to the faster camera scenes so all cameras share roughly the same latency, then one audio offset fits every
   scene. The dashboard could manage this filter from the camera cards.
4. **Match sounds.** Keep the existing "FTC Live match sounds on stream" option (Advanced) for venues whose feed already
   carries them; otherwise apply the same offset to the FTC Live Overlay source so buzzers line up with the video.

## Open questions

- Is a fixed default for NDI close enough at most events, or does every venue need a clap test?
- Should the offset be saved per event (local storage) or only live in OBS (it travels with the scene collection)?
- Can latency be measured automatically (e.g. flash plus beep in a test browser source, detect both in OBS screenshots
  and audio levels)? Probably too complex for the benefit.
