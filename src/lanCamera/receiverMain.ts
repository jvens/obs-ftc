// Loaded by an OBS browser source: camera-receiver.html?slot=<label>&camera=<name>&port=<port>#password=<password>
// Connects to the OBS WebSocket on this computer and shows camera <name>, sent from another computer,
// in camera slot <label>.
import OBSWebSocket from 'obs-websocket-js';
import { ResultAsync } from 'neverthrow';
import { connectObs, obsSignaling } from './obsSignaling';
import { CameraReceiver, startCameraReceiver } from './receiver';

const RETRY_MS = 3000;

const params = new URLSearchParams(window.location.search);
const slot = params.get('slot') ?? '';
const camera = params.get('camera') ?? '';
const port = Number(params.get('port') ?? 4455);
const password = new URLSearchParams(window.location.hash.slice(1)).get('password') ?? '';

const video = document.getElementById('video') as HTMLVideoElement;
const statusText = document.getElementById('status') as HTMLDivElement;

const showStatus = (text: string | undefined) => {
  statusText.hidden = text === undefined;
  statusText.textContent = text ?? '';
};

// Audio goes to OBS (the source controls audio via OBS), which mutes it unless the stream takes its
// audio from the cameras. Should autoplay with sound be refused, show the picture without it.
const play = (stream: MediaStream | undefined) => {
  // Each track (audio, video) announces the same stream; setting it again would interrupt the
  // first play() and look like a refusal.
  if (video.srcObject === (stream ?? null)) return;
  video.srcObject = stream ?? null;
  if (!stream) return;
  video.muted = false;
  const start = () => ResultAsync.fromPromise(video.play(), error => error as DOMException);
  start()
    .orElse(error => {
      if (error.name !== 'NotAllowedError') return start();
      video.muted = true;
      return start();
    })
    .mapErr(error => console.error('Unable to play the camera', error));
};

const obs = new OBSWebSocket();
const channel = obsSignaling(obs);
let receiver: CameraReceiver | undefined;

const connect = () => {
  showStatus(`${slot}: connecting to OBS`);
  connectObs(obs, 'localhost', port, password).match(
    () => {
      receiver = startCameraReceiver(channel, {
        camera,
        slot,
        onStream: play,
        onState: state => showStatus(
          state === 'live' ? undefined
            : state === 'connecting' ? `${slot}: connecting to ${camera}`
            : `${slot}: waiting for ${camera}`),
      });
    },
    error => {
      showStatus(`${slot}: ${error}`);
      setTimeout(connect, RETRY_MS);
    }
  );
};

obs.on('ConnectionClosed', () => {
  if (!receiver) return;
  receiver.stop();
  receiver = undefined;
  setTimeout(connect, RETRY_MS);
});

if (camera) connect();
else showStatus(`${slot}: no camera computer picked. Pick one in the FTC OBS dashboard.`);
