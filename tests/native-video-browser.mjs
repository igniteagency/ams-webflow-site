import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

// Install optional QA tooling: npm install --prefix .npm/browser-qa --no-package-lock playwright@1.64.1 --cache .npm
// Run after bun run build: node tests/native-video-browser.mjs (requires Google Chrome).
const { chromium } = await import('../.npm/browser-qa/node_modules/playwright/index.mjs');
const ROOT = new URL('../', import.meta.url);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const allowed = ['/tests/fixtures/native-video.html', '/dist/prod/components/native-video.js'];
  if (!allowed.includes(path)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', path.endsWith('.html') ? 'text/html' : 'text/javascript');
  response.end(await readFile(new URL(path.slice(1), ROOT)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const manifests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().endsWith('/playlist.m3u8')) manifests.push(request.url());
  });
  const url = `http://127.0.0.1:${server.address().port}/tests/fixtures/native-video.html`;
  await page.goto(url);
  const player = '#controlled video';
  const background = '#background video';
  const playing = (selector) =>
    page.waitForFunction(
      (selector) => {
        const video = document.querySelector(selector);
        return !video.paused && video.currentTime > 0.2 && video.videoHeight > 0;
      },
      selector,
      { timeout: 45000 }
    );
  assert.equal(await page.locator(player).evaluate((video) => video.paused), true);
  assert.equal(manifests.length, 0);
  await page.locator('#controlled [data-video-el="toggle"]').click();
  await playing(player);
  const initial = await page.locator(player).evaluate((video) => ({
    nativeHls: video.canPlayType('application/vnd.apple.mpegurl'),
    source: video.currentSrc,
    height: video.videoHeight,
    duration: video.duration,
    poster: video.getAttribute('poster'),
    controls: video.controls,
  }));
  assert.equal(initial.controls, false);
  if (!initial.nativeHls) assert.match(initial.source, /^blob:/);
  await page.evaluate(() => window.Webflow.forEach((init) => init()));
  assert.equal(await page.locator('#controlled video').count(), 1);
  await page.locator('#controlled [data-video-el="seek"]').evaluate((seek) => {
    seek.value = '5';
    seek.dispatchEvent(new Event('input'));
  });
  await page.waitForFunction(() => document.querySelector('#controlled video').currentTime >= 5);
  await page.locator('#controlled [data-video-el="mute"]').click();
  assert.equal(await page.locator(player).evaluate((video) => video.muted), true);
  await page.locator('#controlled [data-video-el="toggle"]').click();
  assert.equal(await page.locator(player).evaluate((video) => video.paused), true);
  await page.locator('#background').scrollIntoViewIfNeeded();
  await playing(background);
  const backgroundSource = await page.locator(background).evaluate((video) => video.currentSrc);
  const beforeLoop = manifests.length;
  await page.locator(background).evaluate((video) => {
    video.currentTime = video.duration - 0.4;
  });
  await page.waitForFunction(
    () => {
      const video = document.querySelector('#background video');
      return video.currentTime > 0.1 && video.currentTime < 3 && !video.paused;
    },
    null,
    { timeout: 45000 }
  );
  assert.equal(
    await page.locator(background).evaluate((video) => video.currentSrc),
    backgroundSource
  );
  assert.equal(manifests.length, beforeLoop, 'loop must not reload the master manifest');
  await page.locator('#controlled').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#background video').paused);
  await page.locator('#background').scrollIntoViewIfNeeded();
  await playing(background);
  await page.locator('#background [data-video-el="toggle"]').click();
  assert.equal(await page.locator(background).evaluate((video) => video.paused), true);
  await page.locator('#background').evaluate((root) => {
    window.removedVideoRoot = root;
    root.remove();
  });
  await page.waitForFunction(() => !window.removedVideoRoot.dataset.videoReady);
  assert.deepEqual(errors, []);
  console.info(
    JSON.stringify(
      {
        result: 'PASS',
        scope: 'local fixture / real public Bunny / Chrome',
        initial,
        manifests: manifests.length,
        checks: [
          'playback',
          'child source',
          'seek',
          'mute',
          'pause',
          'reinit',
          'loop source reuse',
          'viewport pause/resume',
          'DOM cleanup',
        ],
      },
      null,
      2
    )
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
