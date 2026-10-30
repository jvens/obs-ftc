// Loaded by an OBS browser source: camera-receiver.html?camera=<label>&port=<port>#password=<password>
// Connects to the OBS WebSocket on this computer and shows the camera sent from another computer.
import OBSWebSocket from 'obs-websocket-js';
import { ResultAsync } from 'neverthrow';
import { connectObs, obsSignaling } from './obsSignaling';
import { CameraReceiver, startCameraReceiver } from './receiver';

const RETRY_MS = 3000;

const params = new URLSearchParams(window.location.search);
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
  showStatus(`${camera} camera: connecting to OBS`);
  connectObs(obs, 'localhost', port, password).match(
    () => {
      receiver = startCameraReceiver(channel, {
        camera,
        onStream: play,
        onState: (state, senderName) => showStatus(
          state === 'live' ? undefined
            : state === 'connecting' ? `${camera} camera: connecting to ${senderName || 'the camera computer'}`
            : `${camera} camera: waiting for a camera computer`),
      });
    },
    error => {
      showStatus(`${camera} camera: ${error}`);
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
else showStatus('No camera given. Set up LAN cameras from the FTC OBS dashboard.');
