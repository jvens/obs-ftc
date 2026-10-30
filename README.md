# FTC OBS WebSocket Client

A web application that integrates OBS Studio with the FTC Live scoring system, enabling automated scene switching, match recording, and screenshot capture based on match events.

## Features

- **OBS Setup**: Build the scenes and sources for an event in OBS with one click (field scenes, ceremony, alliance selection, pit and sponsor displays, and a scene per camera), pick each camera and the audio input from the dashboard with live previews, and apply recommended stream and recording settings
- **LAN Cameras**: Send a webcam from any computer on the event network to OBS from a browser page, over WebRTC on the local network, with no extra software
- **Automated Scene Switching**: Automatically switch OBS scenes based on FTC Live match events (match load, preview, start, etc.)
- **Match Recording**: Control OBS recording start/stop based on configurable match events
- **Replay Buffer**: Automatically save replay buffer clips for each match
- **Screenshots**: Capture screenshots at key moments (match preview, randomization, final scores)
- **YouTube Chapters**: Generate video chapter markers for YouTube uploads
- **Match Events Table**: Track all match events with timestamps, recordings, and screenshots
- **Auto-Reconnect**: Automatically reconnects to OBS and FTC Live if the connection is lost

## Requirements

- [OBS Studio](https://obsproject.com/) with WebSocket server enabled (v5.0+)
- Access to an FTC Live scoring system
- A modern web browser (Chrome recommended)

## Setup

### OBS Studio Configuration

1. Open OBS Studio
2. Go to **Tools** > **WebSocket Server Settings**
3. Enable the WebSocket server
4. Note the port number (default: 4455)
5. Optionally set a password

### Browser Configuration

Since the FTC Live scoring system uses HTTP (not HTTPS), you may need to allow insecure content in your browser:

1. Navigate to the hosted application or `http://localhost:3000`
2. Click the icon next to the URL and go to "Site settings"
3. Find "Insecure content" and set it to "Allow"
4. Refresh the page

## Usage

1. **Connect to FTC Live**: Enter the FTC Live server IP address, fetch events, and select your event
2. **Connect to OBS Studio**: Enter your OBS WebSocket connection details
3. **Configure OBS Studio**: Run the dashboard on the OBS computer. Click **Set up in a new scene collection** to build everything, **Apply recommended settings**, then choose each camera and the audio device. For the next event, select it and click **Update for this event**
4. **Check Scene Assignments**: Setup assigns its field scenes automatically; adjust them if you use your own scenes
5. **Set Transition Triggers**: Choose which match events trigger scene switches
6. **Configure Recording/Screenshots**: Enable and configure automatic recording and screenshot capture

## LAN Cameras

A webcam plugged into any computer on the event network can feed an OBS camera scene, with no software
to install on that computer. The video goes straight from that computer's browser to OBS over WebRTC
and stays on the local network; the OBS WebSocket server carries the few messages that set up the
connection.

1. On the OBS computer, let OBS accept connections from the network: allow OBS through the firewall
   (Windows asks the first time the WebSocket server is reached from another computer) and note the
   computer's IP address (the WebSocket Server Settings window shows it under **Show Connect Info**).
2. On the camera computer, open this site and click **Create LAN Camera** at the top (or open
   `/camera.html`). Allow **Insecure content** for the site (see Browser Configuration above), and
   allow camera access and local network access when Chrome asks.
3. Enter the OBS computer's address, port and password and click **Connect**. Name the camera (for
   example "Field 1 tripod" or "Pit Cam"), pick the webcam, then click **Start sending**.
4. In **Configure OBS Studio > Cameras** on the dashboard, set the camera (for example Field 1) to
   **LAN Camera**, then pick the camera's name from the list of camera computers that are sending.

The camera page remembers its settings and reconnects by itself if OBS or the network drops. If a
second computer starts sending under the same name it takes over, and the first stands by until it
stops, so a spare computer can be swapped in without touching the dashboard. One camera computer can
feed more than one camera at once.
Keep the camera page open and the computer awake while it is needed.

Notes:

- Every camera computer gets the OBS WebSocket password, which allows full control of OBS.
- The browser source carries the OBS password in its URL (after `#`, so it is never sent to the web
  server). If the OBS port or password changes, run **Update for this event** to update it.
- The pages are loaded from the internet, but once loaded, everything runs on the local network.

## Development

### Prerequisites

- Node.js (v18 or later recommended)
- npm

### Getting Started

```bash
# Clone the repository
git clone https://github.com/jvens/obs-ftc.git
cd obs-ftc

# Install dependencies
npm install

# Start the development server
npm start
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Available Scripts

#### `npm start`

Runs the app in development mode using Vite. The page will hot-reload when you make edits.

#### `npm run build`

Builds the app for production to the `build` folder using TypeScript compiler and Vite. The build is minified and optimized for best performance.

#### `npm run preview`

Locally preview the production build before deploying.

#### `npm run deploy`

Builds the app and deploys it to Firebase Hosting.

#### `npm run cf:deploy`

Builds the app and deploys it to Cloudflare Workers (static assets). Since the app is a
pure static SPA, it is served as an assets-only Worker with a single-page-application
fallback (equivalent to the Firebase `index.html` rewrite). First-time setup:

```bash
npx wrangler login   # authorize your Cloudflare account (one time)
npm run cf:deploy    # build + deploy to https://obs-ftc.<account>.workers.dev
```

Configuration lives in `wrangler.jsonc`. Firebase Hosting and Cloudflare Workers are both
supported; use whichever you prefer.

#### `npm run cf:dev`

Serves the production build locally through Wrangler (default
[http://localhost:8787](http://localhost:8787)) for a production-like preview. Run
`npm run build` first.

### Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **Redux Toolkit** - State management
- **obs-websocket-js** - OBS WebSocket client

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/obs-ftc.git
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes** and commit them with descriptive messages
5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
6. **Open a Pull Request** against the `main` branch

### Guidelines

- Follow the existing code style
- Test your changes locally before submitting
- Keep pull requests focused on a single feature or fix
- Update documentation if needed

### Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/jvens/obs-ftc/issues) on GitHub.

## License

This project is licensed under the MIT License.

## Disclaimer

This is not an official project of *FIRST*. It is independently developed and volunteer maintained.

## Author

Jeramie Vens
