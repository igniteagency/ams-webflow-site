import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildHomeHead } from '../bin/build-home-head.js';

const compile = async (entry) => (await build({ entryPoints: [entry], bundle: true, write: false })).outputFiles[0].text;
const [inline, main] = await Promise.all([compile('src/inline/home-hero.ts'), compile('src/pages/home.ts')]);
const fields = Object.fromEntries(['sydney', 'melbourne'].flatMap(scene => [
  [`data-hero-${scene}-video`, `https://media.example/${scene}/playlist.m3u8`],
  [`data-hero-${scene}-poster`, `https://media.example/${scene}/poster.jpg`],
]));

function fixture(random, { stage = 0, page = '6ac58464423a10a23dfeb5a0', media = fields, playing = false, readyState = 0, ready = 'loading' } = {}) {
  const attributes = {}, events = new Map(), videoEvents = new Map(), observers = [], posters = [];
  const source = { setAttribute: (name, value) => { attributes[name] = value; } };
  const video = {
    readyState, querySelector: () => stage >= 3 ? source : null,
    setAttribute: source.setAttribute,
    addEventListener: (name, fn) => videoEvents.set(name, fn),
    removeEventListener: name => videoEvents.delete(name),
  };
  const controller = { dataset: { videoReady: playing ? 'true' : '' }, querySelector: () => video };
  const settings = { getAttribute: name => media?.[name] ?? null, querySelector: () => stage >= 2 ? controller : null };
  const hero = { querySelector: () => media ? settings : null };
  const document = {
    documentElement: { dataset: { wfPage: page } }, readyState: ready,
    querySelector: selector => selector === '.section_hero-header' && stage >= 1 ? hero : null,
    addEventListener: (name, fn) => events.set(name, fn),
  };
  let calls = 0;
  const context = vm.createContext({
    document, window: { Webflow: [] },
    Math: { random: () => { calls++; return random; } },
    Image: class {
      decode() { return new Promise((resolve, reject) => posters.push({ image: this, resolve, reject })); }
    },
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    },
  });
  vm.runInContext(inline, context);
  return {
    attributes, events, videoEvents, observers, posters, context,
    root: document.documentElement,
    get calls() { return calls; },
    parse(nextStage) { stage = nextStage; for (const o of observers) if (o.active) o.fn(); },
    domReady() { document.readyState = 'interactive'; events.get('DOMContentLoaded')?.(); },
    runMain() { vm.runInContext(main, context); for (const fn of context.window.Webflow) fn(); },
  };
}

test('head chooses either scene before hero markup or external scripts exist', () => {
  for (const [random, scene] of [[0, 'sydney'], [0.49999, 'sydney'], [0.5, 'melbourne'], [0.99999, 'melbourne']]) {
    const f = fixture(random);
    assert.equal(f.root.dataset.homeHeroScene, scene);
    assert.equal(f.calls, 1);
    assert.equal(f.posters.length, 0);
    f.parse(1);
    assert.equal(f.posters[0].image.src, fields[`data-hero-${scene}-poster`]);
    assert.equal(f.posters[0].image.fetchPriority, 'high');
    assert.deepEqual(f.attributes, {});
    f.parse(2);
    f.parse(3);
    assert.equal(f.attributes.poster, fields[`data-hero-${scene}-poster`]);
    assert.equal(f.attributes['data-video-src'], fields[`data-hero-${scene}-video`]);
    assert.equal(f.attributes.src, undefined, 'only the shared runtime starts video loading');
    assert.equal(f.posters.length, 1, 'streaming fragments must not start duplicate poster requests');
    assert.equal(f.observers[0].active, false);
    f.domReady(); f.runMain();
    vm.runInContext(inline, f.context);
    assert.equal(f.calls, 1, 'inline/CDN/Webflow callbacks must share one choice');
  }
});

test('poster decode reveals full media without removing the selected preview', async () => {
  const f = fixture(0);
  f.parse(1);
  f.posters[0].resolve(); await Promise.resolve();
  assert.equal(f.root.dataset.homeHeroMedia, undefined);
  f.parse(3);
  assert.equal(f.root.dataset.homeHeroMedia, 'ready');
  assert.equal(f.root.dataset.homeHeroScene, 'sydney');
  assert.equal(f.videoEvents.size, 0);
});

test('first video frame can replace the preview before poster decode completes', () => {
  const f = fixture(0.9, { stage: 3 });
  assert.equal(f.root.dataset.homeHeroMedia, undefined);
  f.videoEvents.get('loadeddata')();
  assert.equal(f.root.dataset.homeHeroMedia, 'ready');
  assert.equal(f.root.dataset.homeHeroScene, 'melbourne');
  assert.equal(f.videoEvents.size, 0);
});

test('failed or stalled media retains the embedded preview with no intro hold or forced timeout', async () => {
  const f = fixture(0, { stage: 3 });
  f.posters[0].reject(new Error('image failed')); await Promise.resolve();
  assert.equal(f.root.dataset.homeHeroScene, 'sydney');
  assert.equal(f.root.dataset.homeHeroMedia, undefined);
  f.domReady(); f.runMain();
  assert.equal(f.root.dataset.homeHeroMedia, undefined);
  f.videoEvents.get('loadeddata')();
  assert.equal(f.root.dataset.homeHeroMedia, 'ready');
});

test('already loaded frames and a late script work immediately', () => {
  const f = fixture(0, { stage: 3, readyState: 2, ready: 'interactive' });
  assert.equal(f.root.dataset.homeHeroMedia, 'ready');
  assert.equal(f.observers.length, 0);
});

test('Webflow field edits are used without full media URLs in runtime code', () => {
  for (const [random, scene] of [[0, 'sydney'], [0.9, 'melbourne']]) {
    const media = { ...fields, [`data-hero-${scene}-video`]: ' https://edited.example/new.m3u8 ', [`data-hero-${scene}-poster`]: ' https://edited.example/new.jpg ' };
    const f = fixture(random, { stage: 3, media });
    assert.equal(f.attributes['data-video-src'], 'https://edited.example/new.m3u8');
    assert.equal(f.attributes.poster, 'https://edited.example/new.jpg');
  }
});

test('incomplete markup or fields restores the authored fallback without leaving an observer', () => {
  for (const options of [{}, { stage: 2 }, { stage: 3, media: null }, { stage: 3, media: {} }, { stage: 3, media: { ...fields, 'data-hero-sydney-poster': '' } }]) {
    const f = fixture(0, options); f.domReady();
    assert.equal(f.root.dataset.homeHeroScene, undefined);
    assert.deepEqual(f.attributes, {});
    assert.ok(f.observers.every(o => !o.active));
  }
});

test('other pages and an already running native player are untouched', () => {
  for (const options of [{ stage: 3, page: 'other-page' }, { stage: 3, playing: true }]) {
    const f = fixture(0, options); f.domReady(); f.runMain();
    assert.deepEqual(f.attributes, {});
    assert.equal(f.root.dataset.homeHeroScene, undefined);
    assert.equal(f.posters.length, 0);
  }
});

test('generated head is self contained with two embedded previews and matching mask rules', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ams-home-head-test-'));
  try {
    await buildHomeHead(directory);
    const html = await readFile(path.join(directory, 'pages/home-head.html'), 'utf8');
    assert.equal((html.match(/data:image\/jpeg;base64,/g) || []).length, 2);
    assert.ok(html.length < 10000, 'head preview budget is 10 KB');
    assert.doesNotMatch(html, /script src=|animation-play-state|pending|playlist\.m3u8|video-manager/);
    assert.match(html, /background-image:var\(--home-hero-preview\)/);
    for (const scene of ['sydney', 'melbourne']) assert.ok(html.includes(`--home-bridge-mask-${scene}`));
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const context = { document: { documentElement: { dataset: { wfPage: 'other-page' } } } };
    vm.runInNewContext(script, context);
    assert.deepEqual(context.document.documentElement.dataset, { wfPage: 'other-page' });
  } finally { await rm(directory, { recursive: true }); }
});
