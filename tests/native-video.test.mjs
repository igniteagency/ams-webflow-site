import assert from 'node:assert/strict';
import test from 'node:test';

import { initNativeVideo } from '../src/components/native-video.ts';

function fixture(player = false, reduced = false) {
  const listeners = new Map();
  const video = {
    dataset: { videoPlayer: String(player) },
    style: {},
    paused: true,
    controls: true,
    muted: true,
    loop: true,
    autoplay: true,
    playsInline: false,
    currentTime: 0,
    duration: 12,
    volume: 1,
    ended: false,
    error: null,
    removeAttribute(name) {
      this[name] = false;
    },
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
    play() {
      this.paused = false;
      listeners.get('play')?.();
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      listeners.get('pause')?.();
    },
  };
  const toggle = {
    hidden: false,
    style: {},
    addEventListener(name, fn) {
      this.click = fn;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
  const playIcon = { hidden: false, style: {} };
  const pauseIcon = { hidden: true, style: {} };
  const observer = {};
  const view = {
    matchMedia() {
      return { matches: reduced, addEventListener() {} };
    },
    navigator: { connection: { saveData: false, addEventListener() {} } },
    IntersectionObserver: class {
      constructor(callback) {
        observer.change = callback;
      }
      observe() {}
    },
  };
  const document = {
    defaultView: view,
    hidden: false,
    addEventListener(name, fn) {
      this[name] = fn;
    },
  };
  const elements = { player: video, toggle, 'play-icon': playIcon, 'pause-icon': pauseIcon };
  for (const name of ['controls', 'status', 'seek', 'time', 'mute', 'volume', 'fullscreen']) {
    elements[name] = {
      hidden: name === 'status',
      style: {},
      value: '',
      addEventListener(event, fn) {
        this[event] = fn;
      },
      setAttribute(name, value) {
        this[name] = value;
      },
    };
  }
  const root = {
    dataset: {},
    ownerDocument: document,
    querySelector(selector) {
      return elements[selector.match(/="([^"]+)"/)[1]];
    },
  };
  return {
    root,
    video,
    toggle,
    playIcon,
    pauseIcon,
    observer,
    document,
    view,
    elements,
    listeners,
  };
}

test('mode visibility remains owned by authored Webflow conditionals', () => {
  for (const mode of [false, true]) {
    const f = fixture(mode);
    for (const name of ['toggle', 'controls', 'seek', 'time', 'mute', 'volume', 'fullscreen']) {
      Object.defineProperty(f.elements[name], 'hidden', {
        get: () => false,
        set: () => assert.fail(`runtime changed authored ${name} visibility`),
      });
    }
    initNativeVideo(f.root);
  }
});

test('controls mode removes browser controls and exposes the existing custom toggle without auto starting', () => {
  const f = fixture(true);
  f.video.dataset.videoPlayer = 'True';
  initNativeVideo(f.root);
  assert.equal(f.video.autoplay, false);
  assert.equal(f.video.muted, false);
  assert.equal(f.video.loop, false);
  assert.equal(f.video.controls, false);
  assert.equal(f.video.paused, true);
  assert.equal(f.toggle.hidden, false);
  assert.equal(f.video.style.objectFit, 'contain');
});

test('reduced motion and save data keep poster until explicit play; background tabs pause', async () => {
  for (const preference of ['motion', 'data']) {
    const f = fixture(false, preference === 'motion');
    f.view.navigator.connection.saveData = preference === 'data';
    initNativeVideo(f.root);
    f.observer.change([{ isIntersecting: true }]);
    await Promise.resolve();
    assert.equal(f.video.paused, true);
    f.toggle.click();
    await Promise.resolve();
    assert.equal(f.video.paused, false);
    f.document.hidden = true;
    f.document.visibilitychange();
    assert.equal(f.video.paused, true);
  }
});

test('authored controls wire seeking, volume and mute with event driven time and state', () => {
  const f = fixture(true);
  initNativeVideo(f.root);
  assert.equal(f.elements.controls.hidden, false);
  f.elements.seek.value = '7';
  f.elements.seek.input();
  assert.equal(f.video.currentTime, 7);
  assert.equal(f.elements.time.textContent, '0:07 / 0:12');
  f.elements.volume.value = '0.3';
  f.elements.volume.input();
  assert.equal(f.video.volume, 0.3);
  f.elements.mute.click();
  assert.equal(f.video.muted, true);
  f.elements.mute.click();
  assert.equal(f.video.muted, false);
  f.video.volume = 0;
  f.video.muted = false;
  f.elements.mute.click();
  assert.equal(f.video.volume, 1);
  assert.equal(f.video.muted, false);
  f.video.duration = NaN;
  f.listeners.get('durationchange')();
  assert.equal(f.elements.seek.disabled, true);
});

test('failed playback offers retry; media errors expose an honest message', async () => {
  const f = fixture();
  f.video.play = () => Promise.reject(new Error('blocked'));
  initNativeVideo(f.root);
  f.observer.change([{ isIntersecting: true }]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.elements.status.hidden, false);
  assert.match(f.elements.status.textContent, /Press Play/);
  f.video.error = {};
  f.listeners.get('error')();
  assert.equal(f.root.dataset.videoState, 'error');
  assert.match(f.elements.status.textContent, /could not load/);
});

test('multiple instances stay isolated and repeated initialization is inert', () => {
  const a = fixture(true),
    b = fixture(true);
  initNativeVideo(a.root);
  initNativeVideo(b.root);
  const click = a.toggle.click;
  initNativeVideo(a.root);
  assert.equal(a.toggle.click, click);
  a.toggle.click();
  assert.equal(a.video.paused, false);
  assert.equal(b.video.paused, true);
});

test('background autoplays only in view and exposes a working persistent pause control', async () => {
  const f = fixture();
  initNativeVideo(f.root);
  assert.equal(f.video.paused, true);
  assert.equal(f.video.muted, true);
  assert.equal(f.video.loop, true);
  assert.equal(f.video.controls, false);
  assert.equal(f.toggle.hidden, false);
  f.observer.change([{ isIntersecting: true }]);
  await Promise.resolve();
  assert.equal(f.video.paused, false);
  assert.equal(f.toggle['aria-label'], 'Pause video');
  f.toggle.click();
  assert.equal(f.video.paused, true);
  f.observer.change([{ isIntersecting: false }]);
  f.observer.change([{ isIntersecting: true }]);
  assert.equal(f.video.paused, true);
});
