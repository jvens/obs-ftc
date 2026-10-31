// What the dashboard does in OBS as FTC Live runs matches: switch to the match's field, record the
// match, and take screenshots. FTC Live is a mock; OBS is real.
import { readdirSync } from 'node:fs';
import { localPath } from '../../integration/obs/obsStudio';
import { connectFtcLive, connectObs, expect, section, setUpObs, test } from './fixtures';

test('switches scenes, records each match and takes screenshots as FTC Live runs matches', async ({ page, realObs, ftcLive }) => {
  const { control, studio } = realObs;
  const program = async () => (await control.call('GetCurrentProgramScene')).currentProgramSceneName;
  const recording = async () => (await control.call('GetRecordStatus')).outputActive;
  const recordings = () => studio.recordDirectory ? readdirSync(localPath(studio.recordDirectory)) : [];
  const before = new Set(recordings());

  await page.goto('/');
  await connectFtcLive(page, ftcLive, { listen: true });
  await expect((await connectObs(page, realObs)).getByText('Connected', { exact: true })).toBeVisible();
  await setUpObs(page, ftcLive);
  const record = section(page, 'Match Record Settings');
  await record.getByLabel('Enable Match Recording Control').check();
  await record.getByLabel('Time After Stop Condition (seconds)').fill('0');
  await control.call('SetCurrentProgramScene', { sceneName: 'Pit Display' });

  await test.step('match 1 on field 2: shows field 2 and records', async () => {
    ftcLive.send('MATCH_LOAD', { number: 1, field: 2 });
    ftcLive.send('SHOW_PREVIEW', { number: 1, field: 2 });
    await expect.poll(program).toBe('Field 2');
    await expect.poll(recording).toBe(true);
    ftcLive.send('MATCH_START', { number: 1, field: 2 });
    ftcLive.send('MATCH_POST', { number: 1, field: 2 });
    await expect.poll(recording, { timeout: 20_000 }).toBe(false);
  });

  await test.step('match 2 on field 1: shows field 1', async () => {
    ftcLive.send('SHOW_PREVIEW', { number: 2, field: 1 });
    await expect.poll(program).toBe('Field 1');
  });

  await test.step('the events table shows the matches with teams from FTC Live', async () => {
    const row = section(page, 'Match Events').getByRole('row', { name: /Q1/ });
    await expect(row).toContainText('1001');
    await expect(row).toContainText('3001');
  });

  await test.step('the recording and the preview screenshot are saved', async () => {
    test.skip(!studio.recordDirectory, 'OBS_URL instance: its files are not reachable');
    const code = ftcLive.event.eventCode;
    await expect.poll(() => recordings().filter(name => !before.has(name)), { timeout: 15_000 })
      .toEqual(expect.arrayContaining([`${code}_Q1_preview.png`, `${code}_Q2_preview.png`, expect.stringMatching(/\.(mp4|mkv|mov)$/)]));
  });
});

test('leaves the scene alone for events it is not set to follow', async ({ page, realObs, ftcLive }) => {
  const { control } = realObs;
  await page.goto('/');
  await connectFtcLive(page, ftcLive, { listen: true });
  await expect((await connectObs(page, realObs)).getByText('Connected', { exact: true })).toBeVisible();
  await setUpObs(page, ftcLive);
  await control.call('SetCurrentProgramScene', { sceneName: 'Ceremony' });

  // Match Commit is not a transition trigger by default.
  ftcLive.send('MATCH_COMMIT', { number: 1, field: 2 });
  ftcLive.send('MATCH_ABORT', { number: 1, field: 2 });
  await page.waitForTimeout(2000);

  expect((await control.call('GetCurrentProgramScene')).currentProgramSceneName).toBe('Ceremony');
});
