// Match Replay Recording Settings against a real OBS Studio: the replay buffer has to hold a whole
// match, and the dashboard sets its length.
import { connectObs, expect, section, showView, test } from './fixtures';

test('sets the replay buffer long enough to hold a match', async ({ page, realObs }) => {
  const { control } = realObs;
  await page.goto('/');
  await expect((await connectObs(page, realObs)).getByText('Connected', { exact: true })).toBeVisible();
  // Turns the replay buffer on in OBS.
  const setup = section(page, 'Configure OBS Studio');
  await setup.getByRole('button', { name: 'Apply recommended settings' }).click();
  await expect(setup.getByText('Changed:').or(setup.getByText('OBS already uses the recommended settings.'))).toBeVisible({ timeout: 60_000 });

  await showView(page, 'Outputs');
  const replays = section(page, 'Match Replay Recording Settings');
  const fix = replays.getByRole('button', { name: /^Set to \d+ seconds$/ });
  await expect(fix).toBeVisible();
  const seconds = (await fix.textContent())!.match(/\d+/)![0];
  await fix.click();

  await expect(replays.getByText(`OBS Replay Buffer: ${seconds} seconds`)).toBeVisible();
  const outputMode = (await control.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'Mode' })).parameterValue;
  const length = await control.call('GetProfileParameter', { parameterCategory: outputMode === 'Advanced' ? 'AdvOut' : 'SimpleOutput', parameterName: 'RecRBTime' });
  expect(length.parameterValue).toBe(seconds);
});
