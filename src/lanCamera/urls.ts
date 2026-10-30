// The OBS browser source for a LAN camera connects back to the OBS WebSocket on its own computer.
export interface LanReceiverConfig {
  port: number;
  password: string;
}

// The pages are served next to this dashboard. The password goes in the fragment, which browsers
// never send to the web server.
export const lanReceiverUrl = (camera: string, config: LanReceiverConfig) => {
  const query = new URLSearchParams({ camera, port: String(config.port) });
  const hash = config.password ? `#${new URLSearchParams({ password: config.password })}` : '';
  return `${window.location.origin}/camera-receiver.html?${query}${hash}`;
};

export const lanCameraPageUrl = (camera?: string) =>
  `${window.location.origin}/camera.html${camera ? `?${new URLSearchParams({ camera })}` : ''}`;

export const isLanReceiverUrl = (url: string) => /\/camera-receiver\.html(\?|#|$)/.test(url);
