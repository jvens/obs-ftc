// The Run view's scene buttons against a real OBS Studio: the scene marked On stream is the one OBS
// is showing, however it got there.
import { Page } from '@playwright/test';
import { connectFtcLive, connectObs, expect, setUpObs, showView, test } from './fixtures';

const sceneButton = (page: Page, scene: string) =>
  page.locator('.scene-button', { has: page.locator('.scene-name', { hasText: new RegExp(`^${scene}$`) }) });

const expectOnStream = async (page: Page, scene: string) => {
  await expect(sceneButton(page, scene)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.scene-button[aria-pressed="true"]')).toHaveCount(1);
};

test('Run marks the scene OBS shows, when a match switches it and when OBS does', async ({ page, realObs, ftcLive }) => {
  const { control } = realObs;
  const program = async () => (await control.call('GetCurrentProgramScene')).currentProgramSceneName;

  await page.goto('/');
  await connectFtcLive(page, ftcLive, { listen: true });
  await expect((await connectObs(page, realObs)).getByText('Connected', { exact: true })).toBeVisible();
  await setUpObs(page, ftcLive);
  await control.call('SetCurrentProgramScene', { sceneName: 'Field 2' });
  await showView(page, 'Run');
  await expectOnStream(page, 'Field 2');

  await test.step('a match on field 1 switches OBS, and Run follows', async () => {
    ftcLive.send('MATCH_LOAD', { number: 1, field: 1 });
    ftcLive.send('SHOW_PREVIEW', { number: 1, field: 1 });
    await expect.poll(program).toBe('Field 1');
    await expectOnStream(page, 'Field 1');
  });

  await test.step('a scene picked on Run', async () => {
    await sceneButton(page, 'Ceremony').click();
    await expect.poll(program).toBe('Ceremony');
    await expectOnStream(page, 'Ceremony');
  });

  await test.step('a scene picked in OBS', async () => {
    await control.call('SetCurrentProgramScene', { sceneName: 'Pit Display' });
    await expectOnStream(page, 'Pit Display');
  });
});

// A match sends several events that switch to its field in a row. With a transition (OBS's default
// Fade), a second switch to the same scene during the transition cuts it short, and OBS then never
// sends CurrentProgramSceneChanged, so Run kept showing the scene before the match.
test('Run follows each match, when several events in a row switch to its field', async ({ page, realObs, ftcLive }) => {
  const { control } = realObs;
  const program = async () => (await control.call('GetCurrentProgramScene')).currentProgramSceneName;
  await control.call('SetCurrentSceneTransition', { transitionName: 'Fade' });
  await control.call('SetCurrentSceneTransitionDuration', { transitionDuration: 300 });

  await page.goto('/');
  await expect((await connectObs(page, realObs)).getByText('Connected', { exact: true })).toBeVisible();
  await connectFtcLive(page, ftcLive, { listen: true });
  await setUpObs(page, ftcLive);
  await showView(page, 'Run');
  await sceneButton(page, 'Field 2').click();
  await expect.poll(program).toBe('Field 2');
  await expectOnStream(page, 'Field 2');

  for (const [number, field] of [[1, 1], [2, 2], [3, 1]]) {
    ftcLive.send('MATCH_LOAD', { number, field });
    ftcLive.send('SHOW_PREVIEW', { number, field });
    ftcLive.send('SHOW_RANDOM', { number, field });
    ftcLive.send('SHOW_MATCH', { number, field });
    ftcLive.send('MATCH_START', { number, field });
    await expect.poll(program).toBe(`Field ${field}`);
    await expectOnStream(page, `Field ${field}`);
  }
});

