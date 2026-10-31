// A LAN camera all the way into a real OBS: a camera page sends the browser's fake webcam, the
// dashboard points OBS's camera at it, and OBS's own browser source shows the picture.
import { Page } from '@playwright/test';
import { connectFtcLive, connectObs, expect, section, setUpObs, test } from './fixtures';

const CAMERA = 'Tripod by Field 1';

// The average colour of an image, decoded in the page.
const averageColour = (page: Page, dataUrl: string) => page.evaluate(async url => {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4)
    for (let channel = 0; channel < 3; channel++) sum[channel] += data[i + channel];
  const [red, green, blue] = sum.map(total => Math.round(total / (data.length / 4)));
  return { red, green, blue };
}, dataUrl);

test('OBS shows a LAN camera sent from another computer', async ({ page, context, realObs, ftcLive }) => {
  const { control } = realObs;
  await page.goto('/');
  await connectFtcLive(page, ftcLive);
  await expect((await connectObs(page, realObs)).getByText('Connected', { exact: true })).toBeVisible();
  const setup = await setUpObs(page, ftcLive);
  const card = setup.locator('.obs-camera-card', { has: page.getByText('Field 1', { exact: true }) });
  await card.getByRole('combobox').first().selectOption({ label: 'LAN Camera (browser on another computer)' });
  await expect(card.getByRole('combobox').nth(1)).toBeVisible();

  const camera = await context.newPage();
  await camera.goto('/camera.html');
  await camera.getByPlaceholder('192.168.1.10').fill(realObs.host);
  await camera.getByLabel('Port').fill(String(realObs.port));
  await camera.getByLabel('Password').fill(realObs.password);
  await camera.getByPlaceholder(/^e\.g\./).fill(CAMERA);
  await camera.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(camera.getByText('Connected to OBS.')).toBeVisible();
  await camera.getByRole('button', { name: 'Start sending' }).click();

  await card.getByRole('combobox').nth(1).selectOption(CAMERA);

  await expect(camera.getByText('Live: OBS is showing this camera as Field 1.')).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(/live/i)).toBeVisible();
  // Chromium's fake webcam is a green test pattern; an empty camera or the receiver's waiting
  // screen is black.
  await expect.poll(async () => {
    const { imageData } = await control.call('GetSourceScreenshot', { sourceName: 'Camera - Field 1', imageFormat: 'png', imageWidth: 320 });
    const { red, green, blue } = await averageColour(page, imageData);
    return green > 80 && green > 2 * red && green > 2 * blue;
  }, { timeout: 30_000 }).toBe(true);
});
