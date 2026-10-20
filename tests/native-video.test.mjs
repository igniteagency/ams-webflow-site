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
      const previous = listeners.get(name);
      listeners.set(
        name,
        previous
          ? () => {
              previous();
              fn();
            }
          : fn
      );
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
    clearTimeout() {},
    setTimeout() {},
    queueMicrotask,
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
    matches: () => false,
    contains: () => false,
    addEventListener(name, fn) {
      this[name] = fn;
    },
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

test('additional controls hide two seconds after leaving, without hiding shared playback', () => {
  const f = fixture(true);
  const pending = new Map();
  let id = 0;
  f.view.setTimeout = (fn, delay) => {
    assert.equal(delay, 2000);
    const token = ++id;
    pending.set(token, () => {
      pending.delete(token);
      fn();
    });
    return token;
  };
  f.view.clearTimeout = (id) => pending.delete(id);
  f.view.matchMedia = () => ({ matches: true, addEventListener() {} });
  f.root.matches = () => false;
  f.root.contains = () => false;
  f.root.addEventListener = (name, fn) => {
    f.root[name] = fn;
  };
  initNativeVideo(f.root);
  f.video.play();
  f.root.pointerleave();
  assert.notEqual(f.root.dataset.videoControlsHidden, 'true');
  for (const fn of [...pending.values()]) fn();
  assert.equal(f.root.dataset.videoControlsHidden, 'true');
  assert.equal(f.toggle.hidden, false);
  assert.equal(f.elements.controls.hidden, false);
  f.root.pointerenter();
  assert.equal(f.root.dataset.videoControlsHidden, 'false');
  assert.equal(pending.size, 0);
  f.root.pointerleave();
  f.document.activeElement = f.elements.seek;
  f.root.contains = (e) => e === f.elements.seek;
  f.root.focusin();
  assert.equal(pending.size, 0);
  f.document.activeElement = null;
  f.video.pause();
  assert.equal(f.root.dataset.videoControlsHidden, 'false');
  assert.equal(pending.size, 0);
  f.video.play();
  f.video.ended = true;
  f.listeners.get('ended')();
  assert.equal(pending.size, 0);
  f.video.ended = false;
  f.video.error = {};
  f.listeners.get('error')();
  assert.equal(pending.size, 0);
});

test('mute icons follow media volume events without replacing button children', () => {
  const f = fixture(true);
  const up = { hidden: false },
    off = { hidden: true };
  f.elements['volume-up-icon'] = up;
  f.elements['volume-off-icon'] = off;
  Object.defineProperty(f.elements.mute, 'textContent', {
    set() {
      assert.fail('button children replaced');
    },
  });
  initNativeVideo(f.root);
  f.video.muted = true;
  f.listeners.get('volumechange')();
  assert.equal(up.hidden, true);
  assert.equal(off.hidden, false);
  assert.equal(f.elements.mute['aria-label'], 'Unmute video');
  f.video.muted = false;
  f.listeners.get('volumechange')();
  assert.equal(up.hidden, false);
  assert.equal(off.hidden, true);
  f.video.volume = 0;
  f.listeners.get('volumechange')();
  assert.equal(off.hidden, false);
});

test('fullscreen icons follow fullscreenchange while preserving button children', () => {
  const f = fixture(true);
  const enter = { hidden: false },
    exit = { hidden: true };
  f.elements['fullscreen-icon'] = enter;
  f.elements['fullscreen-exit-icon'] = exit;
  Object.defineProperty(f.elements.fullscreen, 'textContent', {
    set() {
      assert.fail('button children replaced');
    },
  });
  initNativeVideo(f.root);
  f.document.fullscreenElement = f.root;
  f.document.fullscreenchange();
  assert.equal(enter.hidden, true);
  assert.equal(exit.hidden, false);
  assert.equal(f.elements.fullscreen['aria-label'], 'Exit fullscreen');
  f.document.fullscreenElement = null;
  f.document.fullscreenchange();
  assert.equal(enter.hidden, false);
  assert.equal(exit.hidden, true);
  assert.equal(f.elements.fullscreen['aria-label'], 'Enter fullscreen');
});

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
  assert.equal(f.video.style.objectFit, undefined);
});

test('video fit remains owned by native Webflow styling in both modes', () => {
  for (const mode of [false, true]) {
    for (const fit of [undefined, 'cover', 'contain']) {
      const f = fixture(mode);
      if (fit) f.video.style.objectFit = fit;
      initNativeVideo(f.root);
      assert.equal(f.video.style.objectFit, fit);
    }
  }
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
