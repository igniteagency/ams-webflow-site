import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const compiled = await build({
  entryPoints: [new URL('../src/pages/home.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
});
const urls = {
  sydney: 'https://vz-a8209381-f64.b-cdn.net/adff7128-8019-4292-b12d-2e84754650c3/',
  melbourne:
    'https://australian-motoring-services.webflow.io/video-manager/media/3066a941-d42f-48e5-a653-9211f886c662/',
};

function fixture(
  random,
  { ready = 'loading', page = '6ac58464423a10a23dfeb5a0', playing = false, masks = true } = {}
) {
  const attributes = {};
  const source = {
    setAttribute: (key, value) => {
      attributes[key] = value;
    },
  };
  const video = { querySelector: () => source, setAttribute: source.setAttribute };
  const controller = { dataset: { videoReady: playing ? 'true' : '' }, querySelector: () => video };
  const artwork = { style: { setProperty: source.setAttribute }, querySelector: () => null };
  const hero = {
    querySelector: (selector) => (selector === '.ams-hero_artwork' ? artwork : controller),
  };
  artwork.closest = () => hero;
  const events = new Map();
  const document = {
    readyState: ready,
    documentElement: { dataset: { wfPage: page } },
    addEventListener: (name, callback) => events.set(name, callback),
    querySelector: (selector) =>
      ({ '.section_hero-header': hero, '.ams-hero_artwork': artwork })[selector] || null,
  };
  let calls = 0;
  const context = vm.createContext({
    document,
    window: { Webflow: [] },
    Math: {
      random: () => {
        calls++;
        return random;
      },
    },
    getComputedStyle: () => ({ getPropertyValue: (key) => (masks ? `url("${key}.svg")` : '') }),
  });
  vm.runInContext(compiled.outputFiles[0].text, context);
  return {
    attributes,
    context,
    events,
    get calls() {
      return calls;
    },
  };
}

test('both halves select paired video, poster and mask before Webflow playback', () => {
  for (const [random, scene] of [
    [0, 'sydney'],
    [0.49999, 'sydney'],
    [0.5, 'melbourne'],
    [0.99999, 'melbourne'],
  ]) {
    const f = fixture(random);
    assert.equal(f.calls, 0);
    f.events.get('DOMContentLoaded')();
    assert.equal(f.attributes['data-video-src'], urls[scene] + 'playlist.m3u8');
    assert.equal(
      f.attributes.poster,
      urls[scene] + (scene === 'sydney' ? 'thumbnail.jpg' : 'poster')
    );
    assert.equal(f.attributes['--home-bridge-mask'], `url("--home-bridge-mask-${scene}.svg")`);
    assert.equal(f.attributes.src, undefined, 'selection must not start a separate media download');
    const selected = { ...f.attributes };
    for (const callback of f.context.window.Webflow) callback();
    vm.runInContext(compiled.outputFiles[0].text, f.context);
    f.events.get('DOMContentLoaded')();
    assert.equal(f.calls, 1, 'ready callbacks and script re-entry must not reselect');
    assert.deepEqual(f.attributes, selected);
  }
});

test('a late Home script selects immediately while the player is still idle', () => {
  const f = fixture(0, { ready: 'interactive' });
  assert.equal(f.calls, 1);
  assert.equal(f.attributes['data-video-src'], urls.sydney + 'playlist.m3u8');
});

test('other pages and an already running player remain untouched', () => {
  for (const options of [{ page: 'other-page' }, { playing: true }]) {
    const f = fixture(0, options);
    f.events.get('DOMContentLoaded')();
    for (const callback of f.context.window.Webflow) callback();
    assert.equal(f.calls, 0);
    assert.deepEqual(f.attributes, {});
  }
});

test('missing scene CSS keeps the authored video, poster and mask together', () => {
  const f = fixture(0, { masks: false });
  f.events.get('DOMContentLoaded')();
  assert.deepEqual(f.attributes, {});
});
