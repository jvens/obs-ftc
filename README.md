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

- [OBS Studio](https://obsproject.com/) with WebSocket server enabled (v5.0+), on Windows or Linux
  (Configure OBS Studio does not support OBS on macOS yet)
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

Use **Chrome or Edge**. FTC Live and OBS use plain HTTP and WebSockets (not HTTPS), and the hosted
dashboard is an HTTPS page, so the browser has to allow the connections:

- **Chrome and Edge** ask to access devices on your local network the first time the dashboard
  connects to FTC Live or OBS. Choose **Allow**. If the connection is blocked, the dashboard shows how
  to allow it: click the icon next to the address, open "Site settings" and set
  "Local network access" to "Allow". If you enter a host name (such as `scoring.example.com`) rather
  than an IP address or a `.local` name, also set "Insecure content" to "Allow".
- **Firefox** blocks these connections for any computer but its own (`localhost`), and has no
  setting to allow them for one site. The dashboard and the LAN camera page warn when the address is
  another computer. Firefox can only be made to work by changing two settings in `about:config`,
  `security.mixed_content.block_active_content` (to `false`) and
  `network.websocket.allowInsecureFromHTTPS` (to `true`). These apply to every website you visit and
  weaken Firefox's protection everywhere, so use Chrome or Edge instead where you can.

Served over plain HTTP (`npm start`, at `http://localhost:3000`), the dashboard needs none of this.

## Usage

The dashboard has four views, as tabs in its header: **Setup**, **Run** (scenes, lower thirds and
the fields, during the event), **Outputs** (recording, replays, screenshots and YouTube chapters)
and **Matches** (the Match Events table).
The header shows whether FTC Live and OBS are connected, and whether OBS is recording and streaming,
on every view.

**Setup** lists the steps before going live, ticks off each one the dashboard can check, and has a
help sidebar for each step (the **?** button in the header shows and hides it):

1. **Connect to FTC Live**: Enter the FTC Live server IP address, fetch events, select your event and connect
2. **Connect to OBS Studio**: Enter your OBS WebSocket connection details. Run the dashboard on the OBS computer and connect to OBS as `localhost`
3. **Scenes and cameras**: Click **Set up in a new scene collection** to build everything, then choose each camera. For the next event, select it and click **Update for this event**
4. **Audio**: Choose where the stream's sound comes from and pick the audio device
5. **Stream and recording settings**: Click **Apply recommended settings**
6. **Scene switching**: Setup assigns its field scenes automatically; adjust them if you use your own scenes, and choose which match events switch scenes

Then turn on what to save for each match in **Outputs**: **Record each match**, **Save a replay after each match** and **Take screenshots**. YouTube chapters for the stream's video are there too.

**Run** shows every scene as a button with a live preview: click one to put it on the stream, for
example for awards or alliance selection. Automatic switching stays on: the next match event
switches back to that match's field, so there is nothing to remember to turn back on.
Run also lists the lower thirds with **Show** and **Hide** (**Edit list** to add or import them),
and shows what each field is doing (its latest match, how far along it is, and the teams).
**Matches** has every match's event times and the replay, recording and screenshots saved for it. Warnings, such as a lost connection to FTC Live or OBS not starting a
recording, show under the header on every view.

## LAN Cameras

A webcam plugged into any computer on the event network can feed an OBS camera scene, with no software
to install on that computer. The video goes straight from that computer's browser to OBS over WebRTC
and stays on the local network; the OBS WebSocket server carries the few messages that set up the
connection.

1. On the OBS computer, let OBS accept connections from the network: allow OBS through the firewall
   (Windows asks the first time the WebSocket server is reached from another computer) and note the
   computer's IP address (the WebSocket Server Settings window shows it under **Show Connect Info**).
2. On the camera computer, open this site in Chrome or Edge and click **Create LAN Camera** at the
   top (or open `/camera`). Allow camera access and local network access when the browser asks (see
   Browser Configuration above). Firefox cannot send a camera to OBS on another computer.
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

- Node.js 22 or later
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

### Testing

#### `npm test`

Runs the unit tests with Jest (`src/**/*.test.ts(x)`). `npm run test:watch` reruns them as files
change, and `npm run test:coverage` writes a coverage report to `coverage/`. The OBS setup code is
tested against an in-memory OBS (`src/test/fakeObs.ts`), so no OBS is needed.

#### `npm run test:e2e`

Builds the site, then runs the end-to-end tests (`e2e/`) in Chromium with
[Playwright Test](https://playwright.dev/docs/intro). Every test gets its own mock OBS
(`e2e/support/mockObs.ts`), and pages are kept offline. The LAN camera tests send the browser's
fake webcam from a camera page to a receiver page, which always runs in Chromium as it does in OBS.

Install the browsers once with `npx playwright install chromium firefox webkit`. Each browser is a
Playwright project; after `npm run build`, pick them with `--project`:

```bash
npx playwright test --project=firefox          # chromium, chrome, chrome-beta, msedge, firefox, webkit
npx playwright test --project=chromium --ui    # step through tests and their traces
npx playwright show-report                     # the HTML report of the last run
```

`npm run test:e2e:ui` builds and opens the UI mode in one step. `chrome`, `chrome-beta` and `msedge`
use the installed Chrome and Edge (`npx playwright install chrome chrome-beta msedge`). Running
`npx playwright test` with no `--project` tests every browser, so all of them need to be installed.

On Linux (x86-64), `e2e/run-in-docker.sh` runs the tests in Docker with every browser and the system
libraries WebKit needs, which some distributions lack. It takes the same arguments as
`npx playwright test` (with none, it tests every browser). The first run builds the image
(`e2e/Dockerfile`: Playwright's image plus Chrome, Chrome Beta and Edge, about 4 GB), which takes a
few minutes.

#### Testing against real OBS Studio

Two suites run against a real OBS Studio, which the tests start themselves, on Windows or Linux:

- `npm run test:obs` runs the OBS setup, camera and settings code against OBS
  (`src/**/*.obs.test.ts`). The same tests run against the in-memory OBS in `npm test`, which keeps
  it behaving like the real thing.
- `npm run test:e2e:obs` builds the site and drives the dashboard in Chromium against OBS and a mock
  FTC Live (`e2e/obs`): connecting (and reconnecting when OBS restarts), setting OBS up for an event,
  switching scenes, recording and taking screenshots as matches run, warning when a recording does
  not start, and a LAN camera appearing in OBS's browser source.

The tests start the OBS release in `OBS_VERSION` (default in `integration/obs/obsStudio.ts`) with a
fresh configuration, its own websocket port (`OBS_PORT`, default 4466) and a random password, and
close it afterwards. It never touches the OBS you use, which can stay open. If OBS crashes during a
run, the run fails and says so.

- **Windows** (the default on Windows and WSL): the portable build of the release, downloaded once
  into `%LOCALAPPDATA%\obs-ftc-tests`. An OBS window opens (minimized) while the tests run, and from
  WSL, Windows Firewall asks once per OBS version whether to let it on the network.
- **Linux** (the default elsewhere, or `OBS_PLATFORM=linux`): the Ubuntu package of the release, in
  Docker on a virtual display (`integration/obs/linux`). The first run for a version builds its
  image, which takes a minute or two. Needs Docker.

```bash
OBS_VERSION=32.2.2 npm run test:obs
OBS_PLATFORM=linux npm run test:e2e:obs
```

To test an OBS you started yourself, set `OBS_URL` (`ws://host:port`) and `OBS_PASSWORD`. The tests
create scene collections and profiles in it, so use a throwaway OBS.

#### Testing against real FTC Live

`npm run test:e2e:ftclive` tests against the real FTC Live scoring system (`e2e/ftclive`): the API and
match event stream the dashboard reads, and the dashboard following matches into a real OBS (as
above) while the tests play them from FTC Live's Match Control and referee pages, including a whole
2:38 match through to its results. The full run takes about four minutes.

The tests run the current FTC Live release for the season in `FTC_LIVE_SEASON` (default in
`integration/ftcLive/ftcLive.ts`), downloaded from FIRST's event portal into a Docker image
(`integration/ftcLive`), so running them after FIRST releases a new version tests that version.
Each run starts with an empty database and sets up a test event (Event Admin > Setup Event >
Offline Setup > Manual Setup) with eight teams and a qualification schedule. FTC Live only accepts
its default `local` account without a password from localhost, so it runs on the host network on
port 80, which has to be free. Needs Docker. FTC Live's output and logs are kept in `test-results`
(`ftc-live.log`, `ftc-live-logs`).

To test an FTC Live you started yourself, set `FTC_LIVE_URL` (`http://host`). The tests create an
event in it, so use a throwaway FTC Live.

### Continuous Integration

GitHub Actions builds the site and runs the unit tests on every pull request and push to `main`
(`.github/workflows/ci.yml`). The end-to-end tests take longer, so they only run when started by
hand: **Actions > E2E > Run workflow** (`.github/workflows/e2e.yml`), with the browsers and
operating systems to test on. Each combination uploads its Playwright report. **Actions > OBS
Studio > Run workflow** (`.github/workflows/obs.yml`) runs both real OBS suites for the OBS releases
and platforms listed, and uploads the Playwright report and OBS's logs. **Actions > FTC Live > Run
workflow** (`.github/workflows/ftclive.yml`) runs the FTC Live suite with the season's current FTC Live
release; run it whenever FIRST releases a new version.

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
