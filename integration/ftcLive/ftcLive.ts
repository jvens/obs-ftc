// Starts the real FTC Live scoring system for integration tests: the current release for the season
// from FIRST's event portal, in Docker (integration/ftcLive), with a fresh database every run.
//
// FTC Live only lets its default "local" account in without a password from localhost, so it runs
// on the host network, on port 80, which has to be free.
//
//   FTC_LIVE_SEASON  season year whose release to test (default below)
//   FTC_LIVE_URL     http://host of an FTC Live to use instead of starting one. The tests create an
//                    event in it, so only use a throwaway FTC Live.
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

export const DEFAULT_SEASON = '2027';
const PORTAL = 'https://event-portal.firstinspires.org';
const CONTAINER = 'obs-ftc-ftclive';

export interface FtcLive {
  // Where the dashboard and the browser reach it, e.g. http://127.0.0.1
  url: string;
  // What to type into the dashboard's FTC Live server box.
  host: string;
  version: string;
  stop: () => Promise<void>;
}

const run = promisify(execFile);
const docker = (args: string[]) => run('docker', args).then(({ stdout }) => stdout.trim());
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Release {
  version: string;
  url: string;
}

// The portal's download page carries the channel and the current release's files as JSON.
export const currentRelease = async (season = process.env.FTC_LIVE_SEASON ?? DEFAULT_SEASON): Promise<Release> => {
  const page = await (await fetch(`${PORTAL}/ftc/${season}/local`)).text();
  const data = /Object\.assign\(window, (\{.*?\})\);/s.exec(page)?.[1];
  if (!data) throw new Error(`Unable to read the FTC Live downloads for ${season} from ${PORTAL}.`);
  const { channelToken, downloadInfo } = JSON.parse(data) as { channelToken: string; downloadInfo: Record<string, { fileName: string }> };
  const fileName = downloadInfo.LINUX_AMD64?.fileName ?? '';
  const version = /-(\d+\.\d+\.\d+)-linux_amd64/.exec(fileName)?.[1];
  if (!version) throw new Error(`No Linux download of FTC Live for ${season} (found "${fileName}").`);
  return { version, url: `${PORTAL}/local/download/${channelToken}/linux_amd64` };
};

const answers = (url: string) => fetch(`${url}/api/v1/version/`).then(response => response.ok, () => false);

const versionOf = async (url: string) =>
  ((await (await fetch(`${url}/api/v1/version/`)).json()) as { version: string }).version.replace(/^v/, '');

export const startFtcLive = async (): Promise<FtcLive> => {
  if (process.env.FTC_LIVE_URL) {
    const url = process.env.FTC_LIVE_URL.replace(/\/$/, '');
    return { url, host: new URL(url).host, version: await versionOf(url), stop: async () => {} };
  }
  await docker(['version', '--format', '{{.Server.Version}}']).catch(() => {
    throw new Error('Testing against FTC Live needs Docker.');
  });
  const url = 'http://127.0.0.1';
  if (await answers(url)) throw new Error('Something already answers on port 80 (another FTC Live?). Stop it, or set FTC_LIVE_URL to use it.');

  const release = await currentRelease();
  const image = `obs-ftc-ftclive:${release.version}`;
  if (!(await docker(['image', 'inspect', image]).then(() => true, () => false))) {
    console.log(`Building ${image} from ${release.url}`);
    await docker(['build', '--quiet', '--build-arg', `FTC_LIVE_URL=${release.url}`, '-t', image, path.resolve('integration/ftcLive')]);
  }
  await docker(['rm', '-f', CONTAINER]).catch(() => undefined);
  await docker(['run', '--detach', '--name', CONTAINER, '--network', 'host', image]);
  // FTC Live's output and its own log files are kept in test-results, for working out failures.
  const stop = async () => {
    const log = await run('docker', ['logs', CONTAINER], { maxBuffer: 64 * 1024 * 1024 })
      .then(({ stdout, stderr }) => stdout + stderr, () => '');
    await mkdir('test-results', { recursive: true });
    await writeFile(path.join('test-results', 'ftc-live.log'), log);
    await rm(path.join('test-results', 'ftc-live-logs'), { recursive: true, force: true });
    await docker(['cp', `${CONTAINER}:/root/.local/state`, path.join('test-results', 'ftc-live-logs')]).catch(() => undefined);
    await docker(['rm', '-f', CONTAINER]).catch(() => undefined);
  };
  const deadline = Date.now() + 120_000;
  while (!(await answers(url))) {
    if (Date.now() > deadline) {
      const log = await docker(['logs', '--tail', '30', CONTAINER]).catch(() => '');
      await stop();
      throw new Error(`FTC Live did not start within 2 minutes. Its last output:\n${log}`);
    }
    await sleep(500);
  }
  return { url, host: '127.0.0.1', version: await versionOf(url), stop };
};
