// Starts a throwaway OBS Studio for integration tests: any release, with a fresh configuration every
// run, its own websocket port and a random password, so it never touches an OBS someone uses.
//
//   windows  the portable Windows build, on Windows or from WSL (which runs it on the Windows side)
//   linux    the Ubuntu package of the release, in Docker on a virtual display (integration/obs/linux)
//
//   OBS_VERSION   release to test (default below)
//   OBS_PLATFORM  windows or linux (default: windows on Windows and WSL, linux elsewhere)
//   OBS_PORT      websocket port for the test OBS (default 4466)
//   OBS_URL       ws://host:port of an OBS to use instead of starting one, with OBS_PASSWORD. The
//                 tests create scene collections and profiles in it, so only use a throwaway OBS.
import { execFile, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { Socket } from 'node:net';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const DEFAULT_OBS_VERSION = '33.0.1';
const DEFAULT_PORT = 4466;

export type ObsStudioPlatform = 'windows' | 'linux';

export interface ObsStudio {
  url: string;
  password: string;
  // From GetVersion, so it is right for an OBS_URL instance too.
  version: string;
  // Where recordings and screenshots go, as OBS sees it.
  recordDirectory?: string;
  // The same folder as this process sees it; undefined for an OBS_URL instance.
  localRecordDirectory?: string;
  // Closes OBS and starts it again with the same settings, as when OBS is restarted at an event.
  // Undefined for an OBS_URL instance.
  restart?: () => Promise<void>;
  // Closes OBS; fails, naming the crash report, if OBS crashed while it ran.
  stop: () => Promise<void>;
}

// How to install, configure and run OBS on one platform.
interface Instance {
  // Local paths: the configuration folder (holding obs-studio) and the recordings folder.
  config: string;
  recordings: string;
  // The recordings folder as OBS sees it.
  obsRecordings: string;
  // Hosts the websocket may be reached at from here.
  hosts: () => string[];
  // OBS's global settings for this platform, beyond the ones every test OBS has.
  global: Record<string, string | number | boolean>;
  launch: () => Promise<void>;
  kill: () => Promise<void>;
  // Why OBS stopped by itself, if it did.
  crashed: () => Promise<string | undefined>;
}

const run = promisify(execFile);

const isWsl = () => process.platform === 'linux' && /microsoft/i.test(readFileSync('/proc/version', 'utf8'));

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const portOpen = (host: string, port: number) => new Promise<boolean>(resolve => {
  const socket = new Socket();
  const done = (open: boolean) => { socket.destroy(); resolve(open); };
  socket.setTimeout(1000, () => done(false));
  socket.once('connect', () => done(true));
  socket.once('error', () => done(false));
  socket.connect(port, host);
});

const download = async (url: string, file: string) => {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status} ${response.statusText}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
};

// --- Windows -------------------------------------------------------------------------------------

// Windows commands, from Windows or through WSL interop.
const windows = (command: string, args: string[]) =>
  run(process.platform === 'win32' ? command : `${command}.exe`, args, { windowsHide: true })
    .then(({ stdout }) => stdout.replace(/\r/g, '').trim());

const powershell = (script: string) => windows('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);

// A Windows path as this process sees it.
export const localPath = (windowsPath: string) =>
  process.platform === 'win32' ? windowsPath : execFileSync('wslpath', ['-u', windowsPath], { encoding: 'utf8' }).trim();

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

// The portable build, downloaded and unpacked once per version into %LOCALAPPDATA%\obs-ftc-tests.
const windowsInstance = async (version: string): Promise<Instance> => {
  const root = path.win32.join(await powershell('$env:LOCALAPPDATA'), 'obs-ftc-tests');
  const folder = path.win32.join(root, `obs-${version}`);
  const marker = localPath(path.win32.join(folder, '.installed'));
  if (!existsSync(marker)) {
    const zip = path.win32.join(root, `OBS-Studio-${version}-Windows-x64.zip`);
    await mkdir(localPath(folder), { recursive: true });
    if (!existsSync(localPath(zip)))
      await download(`https://github.com/obsproject/obs-studio/releases/download/${version}/OBS-Studio-${version}-Windows-x64.zip`, localPath(zip));
    await windows('tar', ['-xf', zip, '-C', folder]);
    await rm(localPath(zip));
    await writeFile(marker, '');
  }
  const bin = path.win32.join(folder, 'bin', '64bit');
  const obsRecordings = path.win32.join(folder, 'recordings');
  const config = localPath(path.win32.join(folder, 'config'));
  let pid: number | undefined;
  return {
    config,
    recordings: localPath(obsRecordings),
    obsRecordings,
    hosts: windowsHosts,
    global: {},
    launch: async () => {
      const args = ['--portable', '--multi', '--disable-updater', '--disable-shutdown-check', '--disable-missing-files-check', '--minimize-to-tray'];
      pid = Number(await powershell(`(Start-Process -PassThru -FilePath '${path.win32.join(bin, 'obs64.exe')}' -WorkingDirectory '${bin}' `
        + `-ArgumentList '${args.join(' ')}').Id`));
    },
    // A crashed OBS shows a dialog and keeps running, so it is closed either way.
    kill: async () => {
      if (pid !== undefined) await windows('taskkill', ['/PID', String(pid), '/T', '/F']).catch(() => undefined);
    },
    crashed: async () => {
      const crashes = path.join(config, 'obs-studio', 'crashes');
      const reports = existsSync(crashes) ? readdirSync(crashes) : [];
      return reports.length > 0 ? `Crash report: ${reports.map(name => path.win32.join(folder, 'config', 'obs-studio', 'crashes', name)).join(', ')}` : undefined;
    },
  };
};

// --- Linux ---------------------------------------------------------------------------------------

const docker = (args: string[]) => run('docker', args).then(({ stdout }) => stdout.trim());

// The Ubuntu package OBS publishes with the release, and the Ubuntu release it is built for.
const ubuntuPackage = async (version: string) => {
  const response = await fetch(`https://api.github.com/repos/obsproject/obs-studio/releases/tags/${version}`);
  if (!response.ok) throw new Error(`Unable to find OBS release ${version}: ${response.status} ${response.statusText}`);
  const { assets } = await response.json() as { assets: { name: string; browser_download_url: string }[] };
  for (const asset of assets) {
    const match = /-Ubuntu-(\d+\.\d+)-x86_64\.deb$/.exec(asset.name);
    if (match) return { url: asset.browser_download_url, ubuntu: match[1] };
  }
  throw new Error(`OBS ${version} has no Ubuntu package on GitHub.`);
};

// A Docker image per version (integration/obs/linux), with the configuration and recordings in
// ~/.cache/obs-ftc-tests mounted at the same path, so OBS and the tests see the same paths.
const linuxInstance = async (version: string, port: number): Promise<Instance> => {
  await docker(['version', '--format', '{{.Server.Version}}']).catch(() => {
    throw new Error('Testing OBS on Linux needs Docker.');
  });
  const image = `obs-ftc-obs:${version}`;
  if (!(await docker(['image', 'inspect', image]).then(() => true, () => false))) {
    const { url, ubuntu } = await ubuntuPackage(version);
    console.log(`Building ${image} from ${url}`);
    await docker(['build', '--quiet', '--build-arg', `UBUNTU_VERSION=${ubuntu}`, '--build-arg', `OBS_DEB_URL=${url}`,
      '-t', image, path.resolve('integration/obs/linux')]);
  }
  const folder = path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'), 'obs-ftc-tests', `obs-${version}-linux`);
  const recordings = path.join(folder, 'recordings');
  const name = `obs-ftc-test-${port}`;
  const containerLog = () => docker(['logs', '--tail', '20', name]).catch(() => '');
  const { uid, gid } = userInfo();
  return {
    config: path.join(folder, 'config'),
    recordings,
    obsRecordings: recordings,
    hosts: () => ['127.0.0.1'],
    // There is no GPU in the container: browser sources draw nothing with hardware acceleration.
    global: { BrowserHWAccel: false },
    launch: async () => {
      await docker(['rm', '-f', name]).catch(() => undefined);
      // Host networking: OBS's browser sources reach the site under test at localhost. OBS's browser
      // (Chromium) needs more shared memory than Docker gives a container by default.
      await docker(['run', '--detach', '--name', name, '--network', 'host', '--ipc', 'host', '--user', `${uid}:${gid}`,
        '--env', 'HOME=/tmp', '--env', `XDG_CONFIG_HOME=${path.join(folder, 'config')}`, '--volume', `${folder}:${folder}`,
        image, '--multi', '--disable-updater', '--disable-shutdown-check', '--disable-missing-files-check', '--minimize-to-tray']);
    },
    kill: () => docker(['rm', '-f', name]).then(() => undefined, () => undefined),
    crashed: async () => {
      const running = await docker(['inspect', '--format', '{{.State.Running}}', name]).catch(() => 'false');
      return running === 'true' ? undefined : `OBS exited. Its last output:\n${await containerLog()}`;
    },
  };
};

// --- Common --------------------------------------------------------------------------------------

const ini = (sections: Record<string, Record<string, string | number | boolean>>) =>
  Object.entries(sections)
    .map(([section, values]) => `[${section}]\r\n${Object.entries(values).map(([key, value]) => `${key}=${value}\r\n`).join('')}`)
    .join('\r\n');

// A fresh configuration: no first-run wizard, no update checks or exit prompts, the websocket server
// on, and a profile with a 1920x1080, 30 fps canvas that records into the test folder.
const configure = async (instance: Instance, port: number, password: string) => {
  const config = path.join(instance.config, 'obs-studio');
  await rm(config, { recursive: true, force: true });
  await rm(instance.recordings, { recursive: true, force: true });
  await mkdir(instance.recordings, { recursive: true });
  await mkdir(path.join(config, 'plugin_config', 'obs-websocket'), { recursive: true });
  await mkdir(path.join(config, 'basic', 'profiles', 'Untitled'), { recursive: true });
  await writeFile(path.join(config, 'global.ini'), ini({ General: { EnableAutoUpdates: false, MaxLogs: 5, ...instance.global } }));
  await writeFile(path.join(config, 'user.ini'), ini({
    General: { FirstRun: true, ConfirmOnExit: false, Pre19Defaults: false, Pre21Defaults: false, Pre23Defaults: false, 'Pre24.1Defaults': false },
    Basic: { Profile: 'Untitled', ProfileDir: 'Untitled', SceneCollection: 'Untitled', SceneCollectionFile: 'Untitled' },
  }));
  await writeFile(path.join(config, 'basic', 'profiles', 'Untitled', 'basic.ini'), ini({
    General: { Name: 'Untitled' },
    Video: { BaseCX: 1920, BaseCY: 1080, OutputCX: 1920, OutputCY: 1080, FPSType: 0, FPSCommon: 30 },
    // OBS reads backslashes in its ini files as escapes, and writes paths with forward slashes.
    SimpleOutput: { FilePath: instance.obsRecordings.replace(/\\/g, '/') },
  }));
  await writeFile(path.join(config, 'plugin_config', 'obs-websocket', 'config.json'), JSON.stringify({
    alerts_enabled: false, auth_required: true, first_load: false, server_enabled: true, server_password: password, server_port: port,
  }));
};

const waitForPort = async (hosts: string[], port: number, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const host of hosts)
      if (await portOpen(host, port)) return host;
    await sleep(500);
  }
  throw new Error(`OBS did not open its websocket on port ${port} within ${timeoutMs / 1000} s. From WSL, check that Windows Firewall allows the test OBS (it asks the first time a new version starts).`);
};

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
        await sleep(500);
      }
    }
    return (await obs.call('GetVersion')).obsVersion;
  } finally {
    await obs.disconnect();
  }
};

const existingObs = async (url: string, password: string): Promise<ObsStudio> => {
  const { default: OBSWebSocket } = await import('obs-websocket-js');
  const obs = new OBSWebSocket();
  await obs.connect(url, password);
  const { obsVersion } = await obs.call('GetVersion');
  // The tests record where this OBS already does.
  const { recordDirectory } = await obs.call('GetRecordDirectory');
  await obs.disconnect();
  return { url, password, version: obsVersion, recordDirectory, stop: async () => {} };
};

export const obsStudioPlatform = (): ObsStudioPlatform => {
  const chosen = process.env.OBS_PLATFORM;
  if (chosen === 'windows' || chosen === 'linux') return chosen;
  if (chosen) throw new Error(`OBS_PLATFORM must be windows or linux, not ${chosen}.`);
  return process.platform === 'win32' || isWsl() ? 'windows' : 'linux';
};

export const startObsStudio = async (): Promise<ObsStudio> => {
  if (process.env.OBS_URL)
    return existingObs(process.env.OBS_URL, process.env.OBS_PASSWORD ?? '');

  const platform = obsStudioPlatform();
  if (platform === 'windows' && process.platform !== 'win32' && !isWsl())
    throw new Error('The Windows OBS needs Windows or WSL. Use OBS_PLATFORM=linux, or start OBS yourself and set OBS_URL.');
  const version = process.env.OBS_VERSION ?? DEFAULT_OBS_VERSION;
  const port = Number(process.env.OBS_PORT ?? DEFAULT_PORT);
  const instance = platform === 'windows' ? await windowsInstance(version) : await linuxInstance(version, port);
  for (const host of instance.hosts())
    if (await portOpen(host, port))
      throw new Error(`Port ${port} is already in use (another test OBS?). Close it or set OBS_PORT.`);

  const password = randomBytes(12).toString('hex');
  await configure(instance, port, password);
  const start = async () => {
    await instance.launch();
    const host = await waitForPort(instance.hosts(), port, 60_000);
    const url = `ws://${host}:${port}`;
    return { url, version: await waitUntilReady(url, password, 60_000) };
  };
  try {
    const { url, version: obsVersion } = await start();
    return {
      url,
      password,
      version: obsVersion,
      recordDirectory: instance.obsRecordings,
      localRecordDirectory: instance.recordings,
      restart: async () => {
        await instance.kill();
        while (await portOpen(new URL(url).hostname, port)) await sleep(250);
        await start();
      },
      stop: async () => {
        const crash = await instance.crashed();
        await instance.kill();
        if (crash) throw new Error(`OBS ${version} (${platform}) crashed during the tests. ${crash}`);
      },
    };
  } catch (error) {
    await instance.kill();
    throw error;
  }
};
