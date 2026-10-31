// LAN cameras end to end: a camera page sends the browser's fake webcam through the mock OBS to the
// receiver page in an OBS browser source. The camera page runs in the browser under test; the
// receiver always runs in Chromium, as it does in OBS.
import { BrowserContext, Locator, Page } from '@playwright/test';
import { MockObs } from './support/mockObs';
import { expect, test } from './support/fixtures';

// The camera computer's name, and the camera slot the dashboard shows it in.
const CAMERA = 'Tripod by Field 1';
const SLOT = 'Field 1';
const LIVE = `Live: OBS is showing this camera as ${SLOT}.`;
const WAITING = `waiting for ${CAMERA}`;

const openReceiver = async (page: Page, obs: MockObs) => {
  await page.goto(`/camera-receiver.html?${new URLSearchParams({ slot: SLOT, camera: CAMERA, port: String(obs.port) })}`);
  await expect(page.getByText(WAITING)).toBeVisible();
  return page;
};

const videoOf = (page: Page) => page.locator('video').evaluate((video: HTMLVideoElement) => ({
  width: video.videoWidth,
  height: video.videoHeight,
  muted: video.muted,
  audioTracks: (video.srcObject as MediaStream | null)?.getAudioTracks().length ?? 0,
}));

const expectShowing = (receiver: Page) =>
  expect.poll(async () => (await videoOf(receiver)).width, { timeout: 15_000 }).toBeGreaterThan(0);

// WebKit now and then drops a fill into the camera page's inputs while the page is starting up
// (seen about once in 15 runs), so fill until the value sticks.
const fillIn = (input: Locator, value: string) => expect(async () => {
  await input.fill(value);
  await expect(input).toHaveValue(value, { timeout: 500 });
}).toPass();

// Without `obs`, the page connects with the OBS settings it remembers from last time.
const openCameraPage = async (context: BrowserContext, { obs, audio = false }: { obs?: MockObs; audio?: boolean }) => {
  const page = await context.newPage();
  await page.goto('/camera.html');
  if (obs) {
    await fillIn(page.getByPlaceholder('192.168.1.10'), '127.0.0.1');
    await fillIn(page.getByLabel('Port'), String(obs.port));
  }
  await fillIn(page.getByPlaceholder(/^e\.g\./), CAMERA);
  await page.getByLabel('Send audio').setChecked(audio);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('Connected to OBS.')).toBeVisible();
  await expect.poll(async () => {
    const video = await videoOf(page);
    return video.width > 0 && video.audioTracks === (audio ? 1 : 0);
  }).toBe(true);
  await page.getByRole('button', { name: 'Start sending' }).click();
  return page;
};

test('OBS shows the camera, with its audio, at full resolution', async ({ obsBrowserSource, context, obs }) => {
  const receiver = await openReceiver(obsBrowserSource, obs);
  const camera = await openCameraPage(context, { obs, audio: true });

  await test.step('the dashboard finds the camera computer', async () => {
    expect(await obs.discoverCameras()).toEqual([CAMERA]);
  });

  await test.step('the receiver shows the camera and plays its audio', async () => {
    await expectShowing(receiver);
    await expect(camera.getByText(LIVE)).toBeVisible();
    await expect(receiver.locator('#status')).toBeHidden();
    // OBS takes the audio from the page, so the video element must play it.
    expect(await videoOf(receiver)).toMatchObject({ audioTracks: 1, muted: false });
  });

  await test.step('the picture stays up at the camera\'s resolution', async () => {
    // A connection that drops shortly after coming up shows as a lost picture here.
    await receiver.waitForTimeout(5_000);
    const sent = await videoOf(camera);
    const shown = await videoOf(receiver);
    expect(shown.width).toBeGreaterThan(0);
    expect({ width: shown.width, height: shown.height }).toEqual({ width: sent.width, height: sent.height });
  });
});

test('the receiver reconnects after reloading', async ({ obsBrowserSource, context, obs }) => {
  const receiver = await openReceiver(obsBrowserSource, obs);
  await openCameraPage(context, { obs });
  await expectShowing(receiver);

  await receiver.reload();

  await expectShowing(receiver);
});

test('a second camera computer takes over, and hands back when it stops', async ({ obsBrowserSource, context, otherComputer, obs }) => {
  const receiver = await openReceiver(obsBrowserSource, obs);
  const first = await openCameraPage(context, { obs });
  await expect(first.getByText(LIVE)).toBeVisible({ timeout: 15_000 });

  const second = await openCameraPage(otherComputer, { obs });
  await expect(second.getByText(LIVE)).toBeVisible({ timeout: 15_000 });
  await expect(first.getByText('Another computer took over')).toBeVisible({ timeout: 10_000 });

  await second.getByRole('button', { name: 'Stop sending' }).click();
  await expect(first.getByText(LIVE)).toBeVisible({ timeout: 15_000 });
  await expectShowing(receiver);
});

test('the receiver waits again when the camera computer stops', async ({ obsBrowserSource, context, obs }) => {
  const receiver = await openReceiver(obsBrowserSource, obs);
  const camera = await openCameraPage(context, { obs });
  await expectShowing(receiver);

  await camera.getByRole('button', { name: 'Stop sending' }).click();

  await expect(receiver.getByText(WAITING)).toBeVisible({ timeout: 10_000 });
});

test('the camera page remembers its settings', async ({ context, obs }) => {
  const camera = await openCameraPage(context, { obs });
  await camera.getByRole('button', { name: 'Stop sending' }).click();
  await camera.close();

  const again = await openCameraPage(context, {});

  await expect(again.getByPlaceholder(/^e\.g\./)).toHaveValue(CAMERA);
  expect(await obs.discoverCameras()).toEqual([CAMERA]);
});
