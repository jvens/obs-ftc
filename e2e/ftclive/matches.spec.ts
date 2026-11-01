// The dashboard following matches run on the real FTC Live into the real OBS: switching to the
// match's field, recording each match, and taking the score screenshot.
import { readdirSync } from 'node:fs';
import WebSocket from 'ws';
import { UpdateTypes } from '../../src/types/FtcLive';
import { Page } from '@playwright/test';
import { submitScores } from '../support/ftcLivePages';
import { connectFtcLive, connectObs, section, setUpObs } from '../obs/fixtures';
import { RealFtcLive, expect, test } from './fixtures';

// The match FTC Live has loaded, once the scorekeeper has loaded it.
const loadedMatch = async ({ url, event }: RealFtcLive) => {
  const response = await fetch(`${url}/api/v1/events/${event.eventCode}/matches/active/`);
  const { matches } = await response.json() as { matches: { matchName: string; field: number }[] };
  return matches[0];
};

// The dashboard connected to FTC Live and OBS, with OBS set up for the event and each match recorded
// until it is posted.
const openDashboard = async (page: Page, realFtcLive: RealFtcLive, realObs: Parameters<typeof connectObs>[1]) => {
  await page.goto('/');
  await connectFtcLive(page, realFtcLive, { listen: true });
  await expect((await connectObs(page, realObs)).getByText('Connected', { exact: true })).toBeVisible();
  await setUpObs(page, realFtcLive);
  const record = section(page, 'Match Record Settings');
  await record.getByLabel('Enable Match Recording Control').check();
  await record.getByLabel('Time After Stop Condition (seconds)').fill('0');
};

test('switches to the match\'s field and records it, and stops when the match is aborted', async ({ page, realFtcLive, realObs, scorekeeper }) => {
  const { control } = realObs;
  const program = async () => (await control.call('GetCurrentProgramScene')).currentProgramSceneName;
  const recording = async () => (await control.call('GetRecordStatus')).outputActive;
  await openDashboard(page, realFtcLive, realObs);
  await control.call('SetCurrentProgramScene', { sceneName: 'Pit Display' });

  await scorekeeper.loadMatch();
  const match = await loadedMatch(realFtcLive);
  await scorekeeper.showPreview();
  await expect.poll(program).toBe(`Field ${match.field}`);
  await expect.poll(recording).toBe(true);
  await scorekeeper.showMatch();
  await scorekeeper.startMatch();

  await scorekeeper.abortMatch();

  await expect.poll(recording, { timeout: 20_000 }).toBe(false);
  await expect(section(page, 'Match Events').getByRole('row', { name: new RegExp(`\\b${match.matchName}\\b`) })).toBeVisible();
});

test('records a whole match, with its teams, results and score screenshot', async ({ page, realFtcLive, realObs, scorekeeper, referee }) => {
  test.slow();
  const { control, studio } = realObs;
  const recording = async () => (await control.call('GetRecordStatus')).outputActive;
  const saved = () => studio.localRecordDirectory ? readdirSync(studio.localRecordDirectory) : [];
  const before = new Set(saved());
  await openDashboard(page, realFtcLive, realObs);
  const streamed = new Set<string>();
  const stream = new WebSocket(`ws://${realFtcLive.host}/api/v2/stream/?code=${realFtcLive.event.eventCode}`);
  stream.on('message', data => { if (String(data) !== 'pong') streamed.add(JSON.parse(String(data)).updateType); });
  await new Promise(resolve => stream.once('open', resolve));

  await scorekeeper.loadMatch();
  const match = await loadedMatch(realFtcLive);
  await scorekeeper.showPreview();
  await scorekeeper.showMatch();
  await scorekeeper.startMatch();
  await expect.poll(recording).toBe(true);
  await scorekeeper.waitForMatchEnd();
  for (const alliance of ['red', 'blue'] as const)
    await submitScores(referee, realFtcLive.url, realFtcLive.event.eventCode, match.field, alliance, match.matchName);
  await scorekeeper.commitAndPost();

  await expect.poll(recording, { timeout: 20_000 }).toBe(false);
  stream.close();
  // Every event a scored match sends is one the dashboard knows.
  expect([...streamed].filter(type => !(UpdateTypes as string[]).includes(type))).toEqual([]);
  expect([...streamed]).toEqual(expect.arrayContaining(['SHOW_PREVIEW', 'SHOW_MATCH', 'MATCH_START', 'INIT_SUBMITTED', 'MATCH_COMMIT', 'MATCH_POST']));
  const row = section(page, 'Match Events').getByRole('row', { name: new RegExp(`\\b${match.matchName}\\b`) });
  const { matches } = await (await fetch(`${realFtcLive.url}/api/v1/events/${realFtcLive.event.eventCode}/matches/`)).json() as
    { matches: { matchName: string; red: { team1: number }; blue: { team1: number } }[] };
  const scheduled = matches.find(other => other.matchName === match.matchName)!;
  await expect(row).toContainText(String(scheduled.red.team1));
  await expect(row).toContainText(String(scheduled.blue.team1));

  test.skip(!studio.localRecordDirectory, 'OBS_URL instance: its files are not reachable');
  const code = realFtcLive.event.eventCode;
  // The score screenshot is taken 11 s after the match is posted. The preview screenshot may be
  // from an earlier try at the same match (an aborted match is played again).
  await expect.poll(() => saved().filter(name => !before.has(name)), { timeout: 30_000 }).toEqual(expect.arrayContaining([
    `${code}_${match.matchName}_score.png`,
    expect.stringMatching(/\.(mp4|mkv|mov)$/),
  ]));
  expect(saved()).toContain(`${code}_${match.matchName}_preview.png`);
});
