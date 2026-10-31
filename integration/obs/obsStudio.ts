// Starts a throwaway OBS Studio for integration tests: the portable Windows build of any release,
// downloaded from GitHub, with a fresh configuration every run, its own websocket port and a random
// password, so it never touches an OBS someone uses. Works on Windows and from WSL (which runs the
// Windows build on the Windows side). Elsewhere, start OBS yourself and set OBS_URL.
//
//   OBS_VERSION   release to test (default below)
//   OBS_PORT      websocket port for the test OBS (default 4466)
//   OBS_URL       ws://host:port of an OBS to use instead of starting one, with OBS_PASSWORD. The
//                 tests create scene collections and profiles in it, so only use a throwaway OBS.
import { execFile, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { Socket } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

export const DEFAULT_OBS_VERSION = '33.0.1';
const DEFAULT_PORT = 4466;

export interface ObsStudio {
  url: string;
  password: string;
  // From GetVersion, so it is right for an OBS_URL instance too.
  version: string;
  // Where recordings and screenshots go, as OBS sees it; undefined for an OBS_URL instance.
  recordDirectory?: string;
  // Closes OBS and starts it again with the same settings, as when OBS is restarted at an event.
  // Undefined for an OBS_URL instance.
  restart?: () => Promise<void>;
  // Closes OBS; fails, naming the crash report, if OBS crashed while it ran.
  stop: () => Promise<void>;
}

const run = promisify(execFile);

const isWsl = () => process.platform === 'linux' && /microsoft/i.test(readFileSync('/proc/version', 'utf8'));

// Windows commands, from Windows or through WSL interop.
const windows = (command: string, args: string[]) =>
  run(process.platform === 'win32' ? command : `${command}.exe`, args, { windowsHide: true })
    .then(({ stdout }) => stdout.replace(/\r/g, '').trim());

const powershell = (script: string) => windows('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);

// A Windows path as this process sees it.
export const localPath = (windowsPath: string) =>
  process.platform === 'win32' ? windowsPath : execFileSync('wslpath', ['-u', windowsPath], { encoding: 'utf8' }).trim();

const portOpen = (host: string, port: number) => new Promise<boolean>(resolve => {
  const socket = new Socket();
  const done = (open: boolean) => { socket.destroy(); resolve(open); };
  socket.setTimeout(1000, () => done(false));
  socket.once('connect', () => done(true));
  socket.once('error', () => done(false));
  socket.connect(port, host);
});

// Windows itself, as seen from here: localhost, or from WSL's default NAT network the gateway.
const windowsHosts = () => {
  if (!isWsl()) return ['127.0.0.1'];
  const gateway = readFileSync('/proc/net/route', 'utf8').split('\n')
    .map(line => line.split('\t'))
    .find(fields => fields[1] === '00000000')?.[2];
  const hosts = ['127.0.0.1'];
  if (gateway) hosts.push(Buffer.from(gateway, 'hex').reverse().join('.'));
  return hosts;
};

const waitForPort = async (port: number, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const host of windowsHosts())
      if (await portOpen(host, port)) return host;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`OBS did not open its websocket on port ${port} within ${timeoutMs / 1000} s. From WSL, check that Windows Firewall allows the test OBS (it asks the first time a new version starts).`);
};

const download = async (version: string, zip: string) => {
  const url = `https://github.com/obsproject/obs-studio/releases/download/${version}/OBS-Studio-${version}-Windows-x64.zip`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download OBS ${version}: ${response.status} ${response.statusText}`);
  await writeFile(localPath(zip), Buffer.from(await response.arrayBuffer()));
};

// Downloads and unpacks OBS once per version; returns the install folder (a Windows path).
const install = async (version: string) => {
  const root = path.win32.join(await powershell('$env:LOCALAPPDATA'), 'obs-ftc-tests');
  const folder = path.win32.join(root, `obs-${version}`);
  const marker = localPath(path.win32.join(folder, '.installed'));
  if (existsSync(marker)) return folder;
  const zip = path.win32.join(root, `OBS-Studio-${version}-Windows-x64.zip`);
  await mkdir(localPath(folder), { recursive: true });
  if (!existsSync(localPath(zip))) await download(version, zip);
  await windows('tar', ['-xf', zip, '-C', folder]);
  await rm(localPath(zip));
  await writeFile(marker, '');
  return folder;
};

const ini = (sections: Record<string, Record<string, string | number | boolean>>) =>
  Object.entries(sections)
    .map(([section, values]) => `[${section}]\r\n${Object.entries(values).map(([key, value]) => `${key}=${value}\r\n`).join('')}`)
    .join('\r\n');

// A fresh portable configuration: no first-run wizard, no update checks or exit prompts, and the
// websocket server on.
// A fresh portable configuration: no first-run wizard, no update checks or exit prompts, the
// websocket server on, and a profile with a 1920x1080, 30 fps canvas that records into the test
// folder rather than the Windows user's Videos.
const configure = async (folder: string, port: number, password: string) => {
  const config = localPath(path.win32.join(folder, 'config', 'obs-studio'));
  const recordings = path.win32.join(folder, 'recordings');
  await rm(config, { recursive: true, force: true });
  await rm(localPath(recordings), { recursive: true, force: true });
  await mkdir(localPath(recordings), { recursive: true });
  await mkdir(path.join(config, 'plugin_config', 'obs-websocket'), { recursive: true });
  await mkdir(path.join(config, 'basic', 'profiles', 'Untitled'), { recursive: true });
  await writeFile(path.join(config, 'global.ini'), ini({ General: { EnableAutoUpdates: false, MaxLogs: 5 } }));
  await writeFile(path.join(config, 'user.ini'), ini({
    General: { FirstRun: true, ConfirmOnExit: false, Pre19Defaults: false, Pre21Defaults: false, Pre23Defaults: false, 'Pre24.1Defaults': false },
    Basic: { Profile: 'Untitled', ProfileDir: 'Untitled', SceneCollection: 'Untitled', SceneCollectionFile: 'Untitled' },
  }));
  await writeFile(path.join(config, 'basic', 'profiles', 'Untitled', 'basic.ini'), ini({
    General: { Name: 'Untitled' },
    Video: { BaseCX: 1920, BaseCY: 1080, OutputCX: 1920, OutputCY: 1080, FPSType: 0, FPSCommon: 30 },
    // OBS reads backslashes in its ini files as escapes, and writes paths with forward slashes.
    SimpleOutput: { FilePath: recordings.replace(/\\/g, '/') },
  }));
  await writeFile(path.join(config, 'plugin_config', 'obs-websocket', 'config.json'), JSON.stringify({
    alerts_enabled: false, auth_required: true, first_load: false, server_enabled: true, server_password: password, server_port: port,
  }));
  return recordings;
};

const crashReports = (folder: string) => {
  const crashes = localPath(path.win32.join(folder, 'config', 'obs-studio', 'crashes'));
  return existsSync(crashes) ? readdirSync(crashes).map(name => path.win32.join(folder, 'config', 'obs-studio', 'crashes', name)) : [];
};

const launch = async (folder: string) => {
  const bin = path.win32.join(folder, 'bin', '64bit');
  const args = ['--portable', '--multi', '--disable-updater', '--disable-shutdown-check', '--disable-missing-files-check', '--minimize-to-tray'];
  const pid = await powershell(`(Start-Process -PassThru -FilePath '${path.win32.join(bin, 'obs64.exe')}' -WorkingDirectory '${bin}' `
    + `-ArgumentList '${args.join(' ')}').Id`);
  return Number(pid);
};

const kill = (pid: number) => windows('taskkill', ['/PID', String(pid), '/T', '/F']).catch(() => undefined);

// OBS opens its websocket before it has finished starting up, and answers "not ready" until then.
const waitUntilReady = async (url: string, password: string, timeoutMs: number) => {
  const { default: OBSWebSocket } = await import('obs-websocket-js');
  const obs = new OBSWebSocket();
  await obs.connect(url, password);
  try {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        await obs.call('GetSceneList');
        break;
      } catch (error) {
        if ((error as { code?: number }).code !== 207 || Date.now() > deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    return (await obs.call('GetVersion')).obsVersion;
  } finally {
    await obs.disconnect();
  }
};

export const startObsStudio = async (): Promise<ObsStudio> => {
  if (process.env.OBS_URL) {
    const url = process.env.OBS_URL;
    const password = process.env.OBS_PASSWORD ?? '';
    const { default: OBSWebSocket } = await import('obs-websocket-js');
    const obs = new OBSWebSocket();
    await obs.connect(url, password);
    const { obsVersion } = await obs.call('GetVersion');
    await obs.disconnect();
    return { url, password, version: obsVersion, stop: async () => {} };
  }
  if (process.platform !== 'win32' && !isWsl())
    throw new Error('The tests can only start OBS on Windows or WSL so far. Start a throwaway OBS yourself and set OBS_URL (and OBS_PASSWORD).');

  const version = process.env.OBS_VERSION ?? DEFAULT_OBS_VERSION;
  const port = Number(process.env.OBS_PORT ?? DEFAULT_PORT);
  for (const host of windowsHosts())
    if (await portOpen(host, port))
      throw new Error(`Port ${port} is already in use on Windows (another test OBS?). Close it or set OBS_PORT.`);

  const folder = await install(version);
  const password = randomBytes(12).toString('hex');
  const recordDirectory = await configure(folder, port, password);
  let pid = await launch(folder);
  // A crashed OBS shows a dialog and keeps running, so it is closed either way.
  const stop = async () => {
    await kill(pid);
    const crashes = crashReports(folder);
    if (crashes.length > 0)
      throw new Error(`OBS ${version} crashed during the tests. Crash report: ${crashes.join(', ')}`);
  };
  try {
    const host = await waitForPort(port, 60_000);
    const url = `ws://${host}:${port}`;
    const obsVersion = await waitUntilReady(url, password, 60_000);
    const restart = async () => {
      await kill(pid);
      while (await portOpen(host, port)) await new Promise(resolve => setTimeout(resolve, 250));
      pid = await launch(folder);
      await waitForPort(port, 60_000);
      await waitUntilReady(url, password, 60_000);
    };
    return { url, password, version: obsVersion, recordDirectory, restart, stop };
  } catch (error) {
    await kill(pid);
    throw error;
  }
};
