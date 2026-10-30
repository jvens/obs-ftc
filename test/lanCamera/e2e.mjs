// End-to-end test of the LAN camera pages against the mock OBS in mockObs.mjs: a camera page sends
// Chromium's fake webcam to a receiver page, both in headless Chromium.
//
//   npm run build && npm run test:lan-camera
//
// Uses the Chromium Playwright downloads (npx playwright-core install chromium), or the browser in
// CHROME if set.
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { startMockObs } from './mockObs.mjs';

const OBS_PORT = 14455;
const WEB_PORT = 4174;
const BASE = `http://localhost:${WEB_PORT}`;
const CAMERA = 'Field 1';
const LIVE = `text=Live: OBS is showing this camera as ${CAMERA}.`;

const step = name => console.log(`ok - ${name}`);

const receiverVideo = page => page.evaluate(() => {
  const video = document.getElementById('video');
  return { width: video.videoWidth, height: video.videoHeight, statusHidden: document.getElementById('status').hidden };
});

const waitForReceiverVideo = page =>
  page.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, { timeout: 15000 });

const openCameraPage = async (context, computerName, host) => {
  const page = await context.newPage();
  await page.goto(`${BASE}/camera.html?camera=${encodeURIComponent(CAMERA)}`);
  if (host) {
    await page.fill('input[placeholder="192.168.1.10"]', host);
    await page.fill('input[type=number]', String(OBS_PORT));
  }
  await page.fill('input[placeholder^="e.g."]', computerName);
  await page.click('button:text-is("Connect")');
  await page.waitForSelector('text=Connected to OBS.');
  await page.waitForFunction(() => document.querySelector('video').videoWidth > 0);
  await page.click('button:text-is("Start sending")');
  return page;
};

const run = async () => {
  const obs = await startMockObs(OBS_PORT);
  const web = await preview({ preview: { port: WEB_PORT, strictPort: true, open: false } });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const close = async () => {
    await browser.close();
    await web.close();
    obs.close();
  };

  try {
    const context = await browser.newContext();
    const receiver = await context.newPage();
    await receiver.goto(`${BASE}/camera-receiver.html?camera=${encodeURIComponent(CAMERA)}&port=${OBS_PORT}`);
    await receiver.waitForSelector('text=waiting for a camera computer');
    step('receiver waits for a camera computer');

    const first = await openCameraPage(context, 'First laptop', '127.0.0.1');
    await waitForReceiverVideo(receiver);
    await first.waitForSelector(LIVE);
    const video = await receiverVideo(receiver);
    if (!video.statusHidden) throw new Error('receiver still shows its status over the video');
    step(`receiver shows the camera (${video.width}x${video.height})`);

    await receiver.reload();
    await waitForReceiverVideo(receiver);
    step('receiver reconnects after reloading');

    const second = await openCameraPage(context, 'Second laptop');
    await second.waitForSelector(LIVE, { timeout: 15000 });
    await first.waitForSelector('text=Another computer took over', { timeout: 10000 });
    step('a second camera computer takes over');

    await second.click('button:text-is("Stop sending")');
    await first.waitForSelector(LIVE, { timeout: 15000 });
    step('the first camera computer takes over again when the second stops');

    // A connection that drops shortly after coming up shows as a lost picture here.
    await receiver.waitForTimeout(5000);
    const after = await receiverVideo(receiver);
    if (after.width === 0) throw new Error('receiver lost the camera');
    if (after.width < 1920) throw new Error(`receiver shows ${after.width}x${after.height}, expected 1920x1080`);
    step(`receiver still shows the camera at ${after.width}x${after.height}`);

    await first.click('button:text-is("Stop sending")');
    await receiver.waitForSelector('text=waiting for a camera computer', { timeout: 10000 });
    step('receiver waits again when the camera computer stops');
  } finally {
    await close();
  }
};

run().then(
  () => console.log('LAN camera e2e passed'),
  error => {
    console.error('LAN camera e2e FAILED:', error);
    process.exitCode = 1;
  }
);
