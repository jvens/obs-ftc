// The OBS browser source for a LAN camera connects back to the OBS WebSocket on its own computer.
export interface LanReceiverConfig {
  port: number;
  password: string;
}

const RECEIVER_PATH = /\/camera-receiver\.html(\?|#|$)/;

// The pages are served next to this dashboard. `slot` is the camera label ("Field 1") and `camera`
// the name of the camera computer to show, empty until one is picked. The password goes in the
// fragment, which browsers never send to the web server.
export const lanReceiverUrl = (slot: string, camera: string, config: LanReceiverConfig) => {
  const query = new URLSearchParams({ slot, camera, port: String(config.port) });
  const hash = config.password ? `#${new URLSearchParams({ password: config.password })}` : '';
  return `${window.location.origin}/camera-receiver.html?${query}${hash}`;
};

export const lanCameraPageUrl = () => `${window.location.origin}/camera.html`;

export const isLanReceiverUrl = (url: string) => RECEIVER_PATH.test(url);

// The camera computer a receiver URL shows, empty when none is picked.
export const lanReceiverCamera = (url: string) =>
  new URLSearchParams(url.split('#')[0].split('?')[1] ?? '').get('camera') ?? '';
