// Configure OBS Studio, run from the dashboard against a real OBS Studio.
import { connectFtcLive, connectObs, expect, section, setUpObs, showStep, showView, test } from './fixtures';

test('builds the event\'s scenes and applies the recommended settings', async ({ page, realObs, ftcLive }) => {
  const { control } = realObs;
  await page.goto('/');
  await connectFtcLive(page, ftcLive);
  await connectObs(page, realObs);

  const panel = await setUpObs(page, ftcLive);

  expect((await control.call('GetSceneCollectionList')).currentSceneCollectionName).toBe(`FTC ${ftcLive.event.eventCode}`);
  const scenes = (await control.call('GetSceneList')).scenes.map(scene => scene.sceneName).reverse();
  expect(scenes).toEqual([
    'Field 1', 'Field 2', 'Ceremony', 'Alliance Selection', 'Pit Display', 'Sponsor Loop',
    'Camera - Field 1', 'Camera - Field 2', 'Camera - Ceremony',
  ]);
  const overlay = await control.call('GetInputSettings', { inputName: 'FTC Live Overlay' });
  expect(overlay.inputSettings.url).toMatch(`http://${ftcLive.host}/event/${ftcLive.event.eventCode}/display/?type=audience&`);
  // The dashboard assigns the new field scenes for scene switching.
  await showStep(page, 'switching');
  await expect(section(page, 'Scene Switching Settings').getByRole('combobox').first()).toHaveValue('Field 1');

  await showStep(page, 'settings');
  const settings = section(page, 'Stream and Recording Settings');
  await settings.getByRole('button', { name: 'Apply recommended settings' }).click();
  await expect(settings.getByText('Changed:').or(settings.getByText('OBS already uses the recommended settings.'))).toBeVisible({ timeout: 60_000 });
  const bitrate = await control.call('GetProfileParameter', { parameterCategory: 'SimpleOutput', parameterName: 'VBitrate' });
  expect(bitrate.parameterValue).toBe('6000');
  expect((await control.call('GetReplayBufferStatus')).outputActive).toBe(false);
});

test('updates the scenes for the next event, keeping camera choices', async ({ page, realObs, ftcLive }) => {
  const { control } = realObs;
  await page.goto('/');
  await connectFtcLive(page, ftcLive);
  await connectObs(page, realObs);
  const panel = await setUpObs(page, ftcLive);
  const field2 = page.locator('.obs-camera-card', { has: page.getByText('Field 2', { exact: true }) });
  await field2.getByRole('combobox').first().selectOption({ label: 'Same as another camera' });
  await expect.poll(async () => (await control.call('GetSceneItemList', { sceneName: 'Camera - Field 2' })).sceneItems.map(item => item.sourceName))
    .toEqual(['Camera - Field 1']);

  ftcLive.event.eventCode = `${ftcLive.event.eventCode}b`;
  await page.reload();
  await connectFtcLive(page, ftcLive);
  await connectObs(page, realObs);
  await showStep(page, 'scenes');
  await panel.getByRole('button', { name: 'Update for this event' }).click();

  await expect(panel.getByText(`Updating url of "FTC Pit Display"`)).toBeVisible({ timeout: 60_000 });
  const pit = await control.call('GetInputSettings', { inputName: 'FTC Pit Display' });
  expect(pit.inputSettings.url).toBe(`http://${ftcLive.host}/event/${ftcLive.event.eventCode}/display/?type=pit`);
  expect((await control.call('GetSceneItemList', { sceneName: 'Camera - Field 2' })).sceneItems.map(item => item.sourceName))
    .toEqual(['Camera - Field 1']);
});

test('adds a custom camera with a scene of its own, and removes it', async ({ page, realObs, ftcLive }) => {
  const { control } = realObs;
  const sceneNames = async () => (await control.call('GetSceneList')).scenes.map(scene => String(scene.sceneName));
  const overlayShown = async () => {
    const { sceneItemId } = await control.call('GetSceneItemId', { sceneName: 'Pit Camera', sourceName: 'FTC Live Overlay' });
    return (await control.call('GetSceneItemEnabled', { sceneName: 'Pit Camera', sceneItemId })).sceneItemEnabled;
  };
  await page.goto('/');
  await connectFtcLive(page, ftcLive);
  await connectObs(page, realObs);
  const panel = await setUpObs(page, ftcLive);

  const custom = panel.locator('.custom-cameras');
  await custom.getByLabel('New camera name').fill('Pit Camera');
  await custom.getByRole('button', { name: 'Add camera' }).click();
  await expect.poll(sceneNames, { timeout: 60_000 }).toEqual(expect.arrayContaining(['Pit Camera', 'Camera - Pit Camera']));
  expect(await overlayShown()).toBe(true);
  // Its camera is picked like the others.
  await expect(page.locator('.obs-camera-card', { has: page.getByText('Pit Camera', { exact: true }) })).toBeVisible();

  await custom.getByRole('listitem').filter({ hasText: 'Pit Camera' }).getByLabel('FTC Live overlay').uncheck();
  await expect.poll(overlayShown).toBe(false);

  await showView(page, 'Run');
  await expect(section(page, 'Scenes').getByRole('button', { name: /^Pit Camera/ })).toBeVisible();

  await showStep(page, 'scenes');
  page.once('dialog', dialog => dialog.accept());
  await custom.getByRole('listitem').filter({ hasText: 'Pit Camera' }).getByRole('button', { name: 'Remove' }).click();
  await expect.poll(sceneNames).not.toContain('Pit Camera');
  expect(await sceneNames()).not.toContain('Camera - Pit Camera');
  expect(await sceneNames()).toContain('Field 1');
});
