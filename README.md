# FTC OBS WebSocket Client

A web application that integrates OBS Studio with the FTC Live scoring system, enabling automated scene switching, match recording, and screenshot capture based on match events.

## Features

- **Automated Scene Switching**: Automatically switch OBS scenes based on FTC Live match events (match load, preview, start, etc.)
- **Match Recording**: Control OBS recording start/stop based on configurable match events
- **Replay Buffer**: Automatically save replay buffer clips for each match
- **Screenshots**: Capture screenshots at key moments (match preview, randomization, final scores)
- **Match Events Table**: Track all match events with timestamps, recordings, and screenshots

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
3. **Configure Scene Assignments**: Map your OBS scenes to each field
4. **Set Transition Triggers**: Choose which match events trigger scene switches
5. **Configure Recording/Screenshots**: Enable and configure automatic recording and screenshot capture

## Development

### Prerequisites

- Node.js (v16 or later)
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

Runs the app in development mode. The page will reload when you make edits.

#### `npm test`

Launches the test runner in interactive watch mode.

#### `npm run build`

Builds the app for production to the `build` folder. The build is minified and optimized for best performance.

#### `npm run deploy`

Builds the app and deploys it to Firebase Hosting.

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
