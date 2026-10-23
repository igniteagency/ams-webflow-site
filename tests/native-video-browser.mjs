#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

// Run after bun run build. Override PLAYWRIGHT_PATH to use another existing installation.
const PLAYWRIGHT_PATH =
  process.env.PLAYWRIGHT_PATH ||
  '/Volumes/Sandisk-2TB-SSD/hermes/workspace/worktrees/ams-webflow-site/2026-10-23-hls/.npm/browser-qa/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PLAYWRIGHT_PATH).href);
const ROOT = new URL('../', import.meta.url);
const MEDIA_HOST = 'vz-a8209381-f64.b-cdn.net';
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const allowed = ['/tests/fixtures/native-video.html', '/dist/prod/components/native-video.js'];
  if (!allowed.includes(url.pathname)) {
    response.writeHead(404).end();
    return;
  }
  try {
    let body = await readFile(new URL(url.pathname.slice(1), ROOT), 'utf8');
    if (url.searchParams.get('format') === 'mp4')
      body = body
        .replaceAll('playlist.m3u8', 'play_1080p.mp4')
        .replaceAll('application/vnd.apple.mpegurl', 'video/mp4');
    if (url.searchParams.has('legacy')) body = body.replaceAll('data-video-src=', 'src=');
    response.setHeader(
      'Content-Type',
      url.pathname.endsWith('.html') ? 'text/html' : 'text/javascript'
    );
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const URL_BASE = `http://127.0.0.1:${server.address().port}/tests/fixtures/native-video.html`;
const PLAYER = '#controlled video';
const BACKGROUND = '#background video';
const control = (root, name) => `${root} [data-video-el="${name}"]`;
const playing = (page, selector) =>
  page.waitForFunction(
    (selector) => {
      const video = document.querySelector(selector);
      return !video.paused && video.currentTime > 0.2 && video.videoHeight > 0;
    },
    selector,
    { timeout: 45000 }
  );
const paused = (page, selector) =>
  page.waitForFunction((selector) => document.querySelector(selector).paused, selector);
const source = (page, selector) => page.locator(selector).evaluate((video) => video.currentSrc);
const inactive = async (page) => {
  assert.equal(await page.locator('video[src], video source[src]').count(), 0);
  assert.equal(await page.locator('video[autoplay]').count(), 0);
  assert.equal(
    await page
      .locator('video')
      .evaluateAll((videos) => videos.every((v) => v.paused && !v.currentSrc)),
    true
  );
};
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'chrome',
    headless: true,
  });
  for (const engine of ['hls.js', 'native-hls', 'mp4']) {
    const createPage = async (preference = '', legacy = false) => {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: preference === 'motion' ? 'reduce' : 'no-preference',
      });
      await page.addInitScript(
        ({ engine, preference }) => {
          if (engine === 'native-hls') {
            // Exercise the real native fallback, without spoofing canPlayType or media playback.
            Object.defineProperty(window, 'MediaSource', { value: undefined });
            Object.defineProperty(window, 'ManagedMediaSource', { value: undefined });
          }
          if (preference === 'data')
            Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
        },
        { engine, preference }
      );
      const requests = [],
        errors = [];
      page.on('request', (request) => {
        if (new URL(request.url()).hostname === MEDIA_HOST) requests.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        `${URL_BASE}?format=${engine === 'mp4' ? 'mp4' : 'hls'}${legacy ? '&legacy=1' : ''}`
      );
      if (engine === 'native-hls')
        assert.ok(
          await page
            .locator(PLAYER)
            .evaluate((v) => v.canPlayType('application/vnd.apple.mpegurl')),
          'This browser must support real native HLS; use a compatible Chrome build.'
        );
      return { page, requests, errors };
    };
    const { page, requests, errors } = await createPage();
    try {
      // A quiet observation window catches parser/preload/manifest/segment requests alike.
      await page.waitForTimeout(750);
      await inactive(page);
      assert.deepEqual(requests, [], `${engine}: zero Bunny requests before eligibility`);
      await page.locator(control('#controlled', 'toggle')).click();
      await playing(page, PLAYER);
      assert.ok(requests.length > 0);
      const initial = await source(page, PLAYER);
      if (engine === 'hls.js') assert.match(initial, /^blob:/);
      else assert.match(initial, engine === 'mp4' ? /play_1080p\.mp4/ : /playlist\.m3u8/);
      assert.equal(
        await page.locator(BACKGROUND).getAttribute('src'),
        null,
        'offscreen background remains unattached'
      );
      assert.equal(await page.locator(PLAYER).evaluate((v) => v.controls), false);
      assert.ok(await page.locator(PLAYER).getAttribute('poster'));
      await page.evaluate(() => window.Webflow.forEach((init) => init()));
      assert.equal(await source(page, PLAYER), initial);
      await page.locator(control('#controlled', 'seek')).evaluate((input) => {
        input.value = '5';
        input.dispatchEvent(new Event('input'));
      });
      await page.waitForFunction(
        () => document.querySelector('#controlled video').currentTime >= 5
      );
      assert.match(
        await page.locator(control('#controlled', 'time')).textContent(),
        /0:0[5-9] \/ /
      );
      await page.locator(control('#controlled', 'volume')).evaluate((input) => {
        input.value = '0.3';
        input.dispatchEvent(new Event('input'));
      });
      assert.equal(await page.locator(PLAYER).evaluate((v) => v.volume), 0.3);
      await page.locator(control('#controlled', 'mute')).click();
      assert.equal(await page.locator(PLAYER).evaluate((v) => v.muted), true);
      await page.locator(control('#controlled', 'mute')).click();
      assert.equal(await page.locator(PLAYER).evaluate((v) => v.muted), false);
      await page.locator(control('#controlled', 'fullscreen')).click();
      await page.waitForFunction(() => document.fullscreenElement?.id === 'controlled');
      await page
        .locator(`${control('#controlled', 'fullscreen')}[aria-label="Exit fullscreen"]`)
        .waitFor();
      assert.equal(
        await page.locator(control('#controlled', 'fullscreen')).getAttribute('aria-label'),
        'Exit fullscreen'
      );
      await page.locator(control('#controlled', 'fullscreen')).click();
      await page.waitForFunction(() => !document.fullscreenElement);
      await page
        .locator(`${control('#controlled', 'fullscreen')}[aria-label="Enter fullscreen"]`)
        .waitFor();
      assert.equal(
        await page.locator(control('#controlled', 'fullscreen')).getAttribute('aria-label'),
        'Enter fullscreen'
      );
      await page.locator(control('#controlled', 'toggle')).click();
      await paused(page, PLAYER);
      await page.waitForFunction(
        () =>
          document
            .querySelector('#controlled [data-video-el="toggle"]')
            .getAttribute('aria-label') === 'Play video'
      );
      await page.locator('#background').scrollIntoViewIfNeeded();
      await playing(page, BACKGROUND);
      const backgroundSource = await source(page, BACKGROUND);
      const masterCount = () => requests.filter((url) => url.endsWith('/playlist.m3u8')).length;
      const beforeLoop = masterCount();
      await page.locator(BACKGROUND).evaluate((v) => {
        v.currentTime = v.duration - 0.4;
      });
      await page.waitForFunction(
        () => {
          const v = document.querySelector('#background video');
          return !v.paused && v.currentTime > 0.1 && v.currentTime < 3;
        },
        null,
        { timeout: 45000 }
      );
      assert.equal(await source(page, BACKGROUND), backgroundSource);
      assert.equal(masterCount(), beforeLoop, 'loop reuses the master and media instance');
      await page.locator('#controlled').scrollIntoViewIfNeeded();
      await paused(page, BACKGROUND);
      await page.locator('#background').scrollIntoViewIfNeeded();
      await playing(page, BACKGROUND);
      assert.equal(await source(page, BACKGROUND), backgroundSource);
      assert.equal(masterCount(), beforeLoop, 'viewport resume reuses the instance');
      await page.locator(control('#background', 'toggle')).click();
      await paused(page, BACKGROUND);
      await page.locator('#controlled').scrollIntoViewIfNeeded();
      await page.locator('#background').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await paused(page, BACKGROUND);
      await page.locator('#background').evaluate((root) => {
        window.removedVideoRoot = root;
        root.remove();
      });
      await page.waitForFunction(() => !window.removedVideoRoot.dataset.videoReady);
      assert.equal(
        await page.evaluate(() =>
          window.removedVideoRoot.querySelector('video').getAttribute('src')
        ),
        null
      );
      assert.deepEqual(errors, []);
      console.info(
        `PASS ${engine}: zero requests, child/direct sources, controls, loop, viewport reuse, manual pause, cleanup`
      );
    } finally {
      await page.close();
    }
    for (const preference of ['motion', 'data']) {
      const { page, requests, errors } = await createPage(preference);
      try {
        await page.locator('#background').scrollIntoViewIfNeeded();
        await page.waitForTimeout(750);
        await inactive(page);
        assert.deepEqual(
          requests,
          [],
          `${engine}/${preference}: zero requests until explicit Play`
        );
        await page.locator(control('#background', 'toggle')).click();
        await playing(page, BACKGROUND);
        assert.ok(requests.length > 0);
        assert.equal(await page.locator(BACKGROUND).evaluate((v) => v.autoplay), false);
        await page.locator(control('#background', 'toggle')).click();
        await paused(page, BACKGROUND);
        await page.locator('#controlled').scrollIntoViewIfNeeded();
        await page.locator('#background').scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await paused(page, BACKGROUND);
        assert.deepEqual(errors, []);
        console.info(`PASS ${engine}/${preference}: zero requests, explicit Play, manual pause`);
      } finally {
        await page.close();
      }
    }
    // Legacy markup is playable, but intentionally has no parser-download guarantee.
    const { page: legacy } = await createPage('motion', true);
    try {
      await legacy.locator(control('#controlled', 'toggle')).click();
      await playing(legacy, PLAYER);
      console.info(`PASS ${engine}: legacy child compatibility`);
    } finally {
      await legacy.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
