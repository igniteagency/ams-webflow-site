import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

class MockHls {
  static instances = [];
  static supported = true;
  static isSupported() {
    return this.supported;
  }
  static Events = { MANIFEST_PARSED: 'manifest', MEDIA_ATTACHED: 'attached', ERROR: 'error' };
  static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
  constructor(config) {
    if (MockHls.throwOnCreate) throw new Error('MSE unavailable');
    this.config = config;
    this.events = new Map();
    this.levels = [];
    this.startLevel = -1;
    this.currentLevel = -1;
    this.starts = 0;
    this.recoveries = 0;
    this.destroyed = 0;
    MockHls.instances.push(this);
  }
  on(name, fn) {
    this.events.set(name, fn);
  }
  emit(name, data) {
    this.events.get(name)?.(name, data);
  }
  loadSource(source) {
    this.source = source;
    this.loads = (this.loads || 0) + 1;
  }
  attachMedia(video) {
    this.video = video;
  }
  startLoad() {
    this.starts++;
  }
  recoverMediaError() {
    this.recoveries++;
  }
  destroy() {
    this.destroyed++;
  }
}
mock.module('hls.js', { exports: { default: MockHls } });
const { initNativeVideo } = await import('../src/components/native-video.ts');
test.afterEach(() => {
  MockHls.supported = true;
});

function fixture(player = false, reduced = false) {
  const listeners = new Map();
  const video = {
    dataset: { videoPlayer: String(player) },
    attributes: { src: 'movie.mp4', poster: 'poster.jpg' },
    sources: [],
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    querySelectorAll() {
      return this.sources;
    },
    canPlayType() {
      return '';
    },
    load() {
      this.loads = (this.loads || 0) + 1;
    },
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
      delete this.attributes[name];
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
      disconnect() {
        observer.disconnected = true;
      }
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
  for (const target of [
    root,
    document,
    view,
    view.navigator.connection,
    ...Object.values(elements),
  ]) {
    const events = new Map();
    target.addEventListener = (name, fn) => {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(fn);
      const dispatch = (...args) => {
        for (const listener of events.get(name)) listener(...args);
      };
      if (target === video) listeners.set(name, dispatch);
      else target[name] = dispatch;
    };
    target.removeEventListener = (name, fn) => events.get(name)?.delete(fn);
  }
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

test('HLS attaches once on demand and retains one instance across loop and viewport resumes', () => {
  const f = fixture();
  f.video.attributes.src = 'https://example.test/movie.M3U8?token=1#video';
  const count = MockHls.instances.length;
  initNativeVideo(f.root);
  assert.equal(MockHls.instances.length, count, 'offscreen background must not fetch');
  f.observer.change([{ isIntersecting: true }]);
  assert.equal(MockHls.instances.length, count + 1);
  const hls = MockHls.instances.at(-1);
  assert.equal(hls.source, f.video.getAttribute('data-video-src'));
  assert.equal(hls.video, f.video);
  f.listeners.get('ended')();
  f.observer.change([{ isIntersecting: false }]);
  f.observer.change([{ isIntersecting: true }]);
  initNativeVideo(f.root);
  assert.equal(MockHls.instances.length, count + 1);
  assert.equal(hls.destroyed, 0);
  assert.equal(f.video.attributes.poster, 'poster.jpg');
});

test('late HLS manifest waits for viewport resume before starting fragments', async () => {
  const f = fixture();
  f.video.attributes.src = 'movie.m3u8';
  initNativeVideo(f.root);
  f.observer.change([{ isIntersecting: true }]);
  const hls = MockHls.instances.at(-1);
  f.observer.change([{ isIntersecting: false }]);
  await Promise.resolve();
  hls.emit('manifest', {});
  hls.emit('attached');
  assert.equal(hls.starts, 0);
  assert.equal(f.video.paused, true);
  f.observer.change([{ isIntersecting: true }]);
  assert.equal(hls.starts, 1);
  assert.equal(f.video.paused, false);
  f.observer.change([{ isIntersecting: false }]);
  f.observer.change([{ isIntersecting: true }]);
  assert.equal(hls.starts, 1, 'resume does not restart an already loading stream');
  assert.equal(hls.loads, 1);
});

test('stale play rejections after viewport pause or resume do not show playback errors', async () => {
  for (const resume of [false, true]) {
    for (const name of ['AbortError', 'NotAllowedError']) {
      const f = fixture();
      f.video.attributes.src = 'movie.m3u8';
      const play = f.video.play.bind(f.video);
      let reject;
      f.video.play = () => {
        void play();
        return new Promise((_, rejectPlay) => {
          reject = rejectPlay;
        });
      };
      initNativeVideo(f.root);
      f.observer.change([{ isIntersecting: true }]);
      f.observer.change([{ isIntersecting: false }]);
      if (resume) {
        f.video.play = play;
        f.observer.change([{ isIntersecting: true }]);
      }
      reject(Object.assign(new Error('old play request'), { name }));
      await Promise.resolve();
      assert.equal(f.elements.status.hidden, true, `${name}, resume=${resume}`);
      assert.equal(f.video.paused, !resume);
      assert.equal(f.toggle['aria-label'], resume ? 'Pause video' : 'Play video');
    }
  }
});

test('hls.js takes priority even when native HLS is supported and preserves poster', () => {
  const f = fixture(true);
  f.video.attributes.src = 'movie.m3u8';
  f.video.canPlayType = (type) => (type === 'application/vnd.apple.mpegurl' ? 'maybe' : '');
  const count = MockHls.instances.length;
  initNativeVideo(f.root);
  f.toggle.click();
  assert.equal(MockHls.instances.length, count + 1);
  assert.equal(MockHls.instances.at(-1).source, 'movie.m3u8');
  assert.equal(f.video.paused, false);
  assert.equal(f.video.getAttribute('poster'), 'poster.jpg');
});

function childSource(src, type = '') {
  return {
    attributes: { src, type },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  };
}

test('child sources detect HLS by extension or MIME while respecting playable source order and video src', () => {
  for (const [src, type] of [
    ['movie.m3u8?token=1', ''],
    ['/stream?id=1', 'application/x-mpegURL'],
    ['/stream?id=2', 'application/vnd.apple.mpegurl; codecs="avc1"'],
  ]) {
    const f = fixture(true);
    delete f.video.attributes.src;
    f.video.sources = [childSource('skip.webm', 'video/webm'), childSource(src, type)];
    initNativeVideo(f.root);
    f.toggle.click();
    assert.equal(MockHls.instances.at(-1).source, src);
    assert.equal(f.video.sources.length, 2);
    assert.equal(f.video.attributes.poster, 'poster.jpg');
  }
  for (const direct of [true, false]) {
    const f = fixture(true);
    if (!direct) delete f.video.attributes.src;
    f.video.sources = [childSource('first.mp4', 'video/mp4'), childSource('other.m3u8')];
    f.video.canPlayType = (type) => (type === 'video/mp4' ? 'probably' : '');
    const count = MockHls.instances.length;
    initNativeVideo(f.root);
    f.toggle.click();
    assert.equal(MockHls.instances.length, count, 'MP4 authoring takes precedence');
  }
});

test('unsupported HLS reports a persistent error without playing or creating a controller', () => {
  const f = fixture();
  f.video.attributes.src = 'movie.m3u8';
  const count = MockHls.instances.length;
  MockHls.supported = false;
  try {
    initNativeVideo(f.root);
    f.observer.change([{ isIntersecting: true }]);
    assert.equal(f.root.dataset.videoState, 'error');
    assert.match(f.elements.status.textContent, /not supported/i);
    f.toggle.click();
    f.listeners.get('timeupdate')();
    assert.equal(f.root.dataset.videoState, 'error');
    assert.equal(f.video.paused, true);
    assert.equal(MockHls.instances.length, count);
  } finally {
    MockHls.supported = true;
  }
});

test('desktop prefers up to 1080 at startup only, with automatic quality on constrained devices', () => {
  for (const [heights, desktop, saveData, reduced, expected] of [
    [[360, 720, 1080, 2160], true, false, false, 2],
    [[360, 720], true, false, false, 1],
    [[1440, 2160], true, false, false, -1],
    [[360, 1080], false, false, false, -1],
    [[360, 1080], true, true, false, -1],
    [[360, 1080], true, false, true, -1],
  ]) {
    const f = fixture(true);
    f.video.attributes.src = 'movie.m3u8';
    f.view.matchMedia = (query) => ({
      matches: query.includes('reduced-motion') ? reduced : desktop,
      addEventListener() {},
    });
    f.view.navigator.connection.saveData = saveData;
    initNativeVideo(f.root);
    f.toggle.click();
    const hls = MockHls.instances.at(-1);
    hls.levels = heights.map((height) => ({ height }));
    hls.emit(MockHls.Events.MANIFEST_PARSED, {});
    assert.equal(hls.startLevel, expected);
    assert.equal(hls.starts, 1);
    assert.equal(hls.config.autoStartLoad, false, 'choose before first fragment loads');
    assert.equal(hls.currentLevel, -1, 'ABR must remain enabled');
    assert.equal(hls.config.minAutoBitrate, undefined, 'no hard bitrate floor');
  }
});

test('fatal HLS recovery is bounded per instance; nonfatal errors remain with ABR', () => {
  for (const type of ['networkError', 'mediaError', 'otherError']) {
    const f = fixture(true);
    f.video.attributes.src = 'movie.m3u8';
    initNativeVideo(f.root);
    f.toggle.click();
    const hls = MockHls.instances.at(-1);
    hls.emit('error', { fatal: false, type });
    assert.equal(hls.starts + hls.recoveries + hls.destroyed, 0);
    hls.emit('error', { fatal: true, type });
    assert.equal(hls.starts, type === 'networkError' ? 1 : 0);
    assert.equal(hls.recoveries, type === 'mediaError' ? 1 : 0);
    hls.emit('error', { fatal: true, type });
    assert.equal(hls.destroyed, 1);
    assert.equal(f.root.dataset.videoState, 'error');
    assert.equal(f.video.paused, true);
    assert.match(f.elements.status.textContent, /could not load/);
    const count = MockHls.instances.length;
    f.toggle.click();
    f.listeners.get('timeupdate')();
    hls.emit('error', { fatal: true, type });
    assert.equal(MockHls.instances.length, count);
    assert.equal(hls.destroyed, 1);
    assert.equal(f.root.dataset.videoState, 'error');
  }
});

test('native HLS retries network/decode errors only once on explicit Play and reports terminal errors', () => {
  MockHls.supported = false;
  for (const code of [2, 3, 4]) {
    const f = fixture();
    f.video.attributes.src = 'movie.m3u8';
    f.video.canPlayType = () => 'probably';
    f.video.load = () => {
      f.video.loads = (f.video.loads || 0) + 1;
      f.video.error = null;
    };
    initNativeVideo(f.root);
    f.observer.change([{ isIntersecting: true }]);
    f.video.error = { code };
    f.listeners.get('error')();
    assert.equal(f.video.paused, true);
    f.observer.change([{ isIntersecting: true }]);
    assert.equal(f.video.paused, true, 'viewport changes must not retry native errors');
    f.toggle.click();
    assert.equal(f.video.loads || 0, code === 4 ? 0 : 1);
    if (code !== 4) {
      assert.equal(f.video.paused, false);
      f.video.error = { code };
      f.listeners.get('error')();
    }
    f.toggle.click();
    assert.equal(f.video.loads || 0, code === 4 ? 0 : 1);
    assert.equal(f.root.dataset.videoState, 'error');
    assert.equal(f.video.paused, true);
  }
});

test('cleanup releases HLS, observers and listeners, retains deferred authoring and allows reinit', () => {
  const f = fixture();
  f.video.attributes.src = 'movie.m3u8';
  const cleanup = initNativeVideo(f.root);
  f.observer.change([{ isIntersecting: true }]);
  const hls = MockHls.instances.at(-1);
  f.video.attributes.src = 'blob:media-source';
  assert.equal(typeof cleanup, 'function');
  cleanup();
  cleanup();
  assert.equal(hls.destroyed, 1);
  assert.equal(f.observer.disconnected, true);
  assert.equal(f.video.paused, true);
  assert.equal(f.root.dataset.videoReady, undefined);
  assert.equal(f.video.getAttribute('src'), null);
  assert.equal(f.video.getAttribute('data-video-src'), 'movie.m3u8');
  const count = MockHls.instances.length;
  f.toggle.click();
  f.document.visibilitychange();
  f.observer.change([{ isIntersecting: true }]);
  assert.equal(MockHls.instances.length, count);
  initNativeVideo(f.root);
  f.observer.change([{ isIntersecting: true }]);
  assert.equal(MockHls.instances.length, count + 1);
});

test('automatic cleanup runs on DOM removal or non-persisted pagehide, preserving bfcache instances', () => {
  for (const removal of [true, false]) {
    const f = fixture(true);
    f.root.isConnected = true;
    f.video.attributes.src = 'movie.m3u8';
    let checkRemoval;
    let disconnected = false;
    f.view.MutationObserver = class {
      constructor(callback) {
        checkRemoval = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    };
    initNativeVideo(f.root);
    f.toggle.click();
    const hls = MockHls.instances.at(-1);
    assert.equal(typeof f.view.pagehide, 'function');
    f.view.pagehide({ persisted: true });
    assert.equal(hls.destroyed, 0);
    if (removal) {
      f.root.isConnected = false;
      checkRemoval();
    } else f.view.pagehide({ persisted: false });
    assert.equal(hls.destroyed, 1);
    assert.equal(disconnected, true);
  }
});

test('manifest recovery reloads the manifest once; permanent HTTP failures stop immediately', () => {
  for (const code of [0, 503, 404]) {
    const f = fixture(true);
    f.video.attributes.src = 'movie.m3u8';
    initNativeVideo(f.root);
    f.toggle.click();
    const hls = MockHls.instances.at(-1);
    const error = {
      fatal: true,
      type: 'networkError',
      details: 'manifestLoadError',
      response: { code },
    };
    hls.emit('error', error);
    assert.equal(hls.loads, code === 404 ? 1 : 2);
    assert.equal(hls.starts, 0, 'startLoad cannot reload a failed master manifest');
    hls.emit('error', error);
    assert.equal(hls.destroyed, 1);
  }
});

test('HLS setup failures become visible errors instead of escaping the control handler', (t) => {
  const errorLog = t.mock.method(console, 'error', () => {});
  const f = fixture(true);
  f.video.attributes.src = 'movie.m3u8';
  initNativeVideo(f.root);
  MockHls.throwOnCreate = true;
  try {
    assert.doesNotThrow(() => f.toggle.click());
    assert.equal(errorLog.mock.callCount(), 1);
    assert.equal(f.root.dataset.videoState, 'error');
    assert.equal(f.video.paused, true);
    assert.match(f.elements.status.textContent, /could not load/);
  } finally {
    MockHls.throwOnCreate = false;
  }
});

test('native child source errors surface even when the video element emits no error event', () => {
  MockHls.supported = false;
  const f = fixture(true);
  delete f.video.attributes.src;
  const source = childSource('movie.m3u8', 'application/vnd.apple.mpegurl');
  source.addEventListener = (name, callback) => {
    source[name] = callback;
  };
  source.removeEventListener = () => {};
  f.video.sources = [source];
  f.video.canPlayType = () => 'probably';
  initNativeVideo(f.root);
  assert.equal(typeof source.error, 'function');
  source.error();
  assert.equal(f.root.dataset.videoState, 'error');
  assert.match(f.elements.status.textContent, /could not load/);
});

test('media recovery resumes requested playback but respects a later viewport pause', () => {
  for (const leaveViewport of [false, true]) {
    const f = fixture();
    f.video.attributes.src = 'movie.m3u8';
    initNativeVideo(f.root);
    f.observer.change([{ isIntersecting: true }]);
    const hls = MockHls.instances.at(-1);
    hls.recoverMediaError = () => f.video.pause();
    hls.emit('error', { fatal: true, type: 'mediaError' });
    if (leaveViewport) f.observer.change([{ isIntersecting: false }]);
    hls.emit('attached');
    assert.equal(f.video.paused, leaveViewport);
  }
});

test('HLS backgrounds defer loading for reduced motion and save-data until explicit Play', () => {
  for (const preference of ['motion', 'data']) {
    const f = fixture(false, preference === 'motion');
    f.video.attributes.src = 'movie.m3u8';
    f.view.navigator.connection.saveData = preference === 'data';
    const count = MockHls.instances.length;
    initNativeVideo(f.root);
    f.observer.change([{ isIntersecting: true }]);
    assert.equal(MockHls.instances.length, count);
    assert.equal(f.video.paused, true);
    f.toggle.click();
    assert.equal(MockHls.instances.length, count + 1);
    assert.equal(f.video.paused, false);
    f.document.hidden = true;
    f.document.visibilitychange();
    MockHls.instances.at(-1).emit('attached');
    assert.equal(f.video.paused, true);
  }
});

test('an aborted pending HLS play after a viewport pause does not report a playback failure', async () => {
  const f = fixture();
  f.video.attributes.src = 'movie.m3u8';
  let rejectPlay;
  f.video.play = () =>
    new Promise((resolve, reject) => {
      rejectPlay = reject;
    });
  initNativeVideo(f.root);
  f.observer.change([{ isIntersecting: true }]);
  f.observer.change([{ isIntersecting: false }]);
  rejectPlay(new DOMException('Interrupted by pause', 'AbortError'));
  await Promise.resolve();
  assert.equal(f.elements.status.hidden, true);
});

test('deferred direct MP4 stays source-free until Controls Play or Background intersection', () => {
  for (const controls of [true, false]) {
    const f = fixture(controls);
    delete f.video.attributes.src;
    f.video.attributes['data-video-src'] = 'deferred.mp4';
    initNativeVideo(f.root);
    assert.equal(f.video.getAttribute('src'), null);
    assert.equal(f.video.loads || 0, 0);
    assert.equal(f.video.paused, true);
    if (controls) f.toggle.click();
    else f.observer.change([{ isIntersecting: true }]);
    assert.equal(f.video.getAttribute('src'), 'deferred.mp4');
    assert.equal(f.video.paused, false);
    f.toggle.click();
    f.toggle.click();
    assert.equal(f.video.getAttribute('src'), 'deferred.mp4');
  }
});

test('deferred and legacy source paths normalize without activation and preserve playable order', () => {
  for (const deferred of [true, false]) {
    for (const direct of [true, false]) {
      for (const hls of [true, false]) {
        const f = fixture(true);
        delete f.video.attributes.src;
        const url = hls ? 'selected.m3u8' : 'selected.mp4';
        const attribute = deferred ? 'data-video-src' : 'src';
        const first = childSource('skip.webm', 'video/webm');
        const selected = childSource(url, hls ? 'application/x-mpegURL' : 'video/mp4');
        if (deferred) {
          selected.setAttribute(attribute, url);
          selected.removeAttribute('src');
        }
        f.video.sources = [first, selected, childSource('later.m3u8')];
        if (direct) f.video.setAttribute(attribute, url);
        f.video.canPlayType = (type) => (type === 'video/mp4' ? 'probably' : '');
        const count = MockHls.instances.length;
        initNativeVideo(f.root);
        assert.equal(f.video.getAttribute('src'), null, 'legacy video src removed at init');
        assert.ok(
          f.video.sources.every((s) => !s.getAttribute('src')),
          'no active child sources'
        );
        assert.equal(MockHls.instances.length, count);
        f.toggle.click();
        if (hls) assert.equal(MockHls.instances.at(-1).source, url);
        else assert.equal(f.video.getAttribute('src'), url);
        assert.equal(f.video.paused, false);
      }
    }
  }
});

test('native HLS fallback attaches deferred video and child URLs only on explicit Play', () => {
  MockHls.supported = false;
  for (const child of [true, false]) {
    const f = fixture(true);
    delete f.video.attributes.src;
    if (child) {
      const source = childSource('', 'application/vnd.apple.mpegurl');
      source.setAttribute('data-video-src', '/stream?id=1');
      f.video.sources = [source];
    } else f.video.setAttribute('data-video-src', 'movie.m3u8');
    f.video.canPlayType = () => 'probably';
    const count = MockHls.instances.length;
    initNativeVideo(f.root);
    assert.equal(f.video.getAttribute('src'), null);
    f.toggle.click();
    assert.equal(f.video.getAttribute('src'), child ? '/stream?id=1' : 'movie.m3u8');
    assert.equal(f.video.paused, false);
    assert.equal(MockHls.instances.length, count);
  }
});

test('preferences keep deferred HLS and MP4 inactive and autoplay disabled even after manual resume', () => {
  for (const source of ['movie.m3u8', 'movie.mp4']) {
    for (const preference of ['motion', 'data']) {
      const f = fixture(false, preference === 'motion');
      delete f.video.attributes.src;
      f.video.setAttribute('data-video-src', source);
      f.view.navigator.connection.saveData = preference === 'data';
      const count = MockHls.instances.length;
      initNativeVideo(f.root);
      f.observer.change([{ isIntersecting: true }]);
      assert.equal(f.video.getAttribute('src'), null);
      assert.equal(MockHls.instances.length, count);
      assert.equal(f.video.paused, true);
      assert.equal(f.video.autoplay, false);
      f.toggle.click();
      assert.equal(f.video.paused, false);
      f.observer.change([{ isIntersecting: false }]);
      f.observer.change([{ isIntersecting: true }]);
      assert.equal(f.video.paused, false, 'explicit consent allows viewport resume');
      assert.equal(f.video.autoplay, false, 'preferences never enable native autoplay');
      f.toggle.click();
      f.observer.change([{ isIntersecting: false }]);
      f.observer.change([{ isIntersecting: true }]);
      assert.equal(f.video.paused, true, 'manual pause persists');
    }
  }
});

test('without IntersectionObserver background requires explicit Play', () => {
  const f = fixture();
  delete f.view.IntersectionObserver;
  delete f.video.attributes.src;
  f.video.setAttribute('data-video-src', 'movie.mp4');
  initNativeVideo(f.root);
  assert.equal(f.video.getAttribute('src'), null);
  assert.equal(f.video.paused, true);
  f.toggle.click();
  assert.equal(f.video.getAttribute('src'), 'movie.mp4');
  assert.equal(f.video.paused, false);
});

test('cleanup removes active native and HLS sources without restoring legacy downloads', () => {
  for (const source of ['movie.mp4', 'movie.m3u8']) {
    for (const supported of [true, false]) {
      MockHls.supported = supported;
      const f = fixture(true);
      f.video.attributes.src = source;
      f.video.canPlayType = () => 'probably';
      const cleanup = initNativeVideo(f.root);
      assert.equal(f.video.loads || 0, 0);
      f.toggle.click();
      const hls = source.endsWith('m3u8') && supported ? MockHls.instances.at(-1) : null;
      if (hls) f.video.setAttribute('src', 'blob:playing');
      cleanup();
      assert.equal(f.video.getAttribute('src'), null);
      assert.equal(f.video.getAttribute('data-video-src'), source);
      assert.equal(f.video.loads, 1, 'reset native media resource once');
      cleanup();
      assert.equal(f.video.loads, 1);
      if (hls) {
        hls.emit('manifest', {});
        hls.emit('error', { fatal: true, type: 'mediaError' });
        hls.emit('attached');
        assert.equal(
          hls.starts + hls.recoveries,
          0,
          'late callbacks cannot revive a disposed player'
        );
        assert.equal(hls.destroyed, 1);
      }
      initNativeVideo(f.root);
      assert.equal(f.video.getAttribute('src'), null);
      f.toggle.click();
      assert.equal(f.video.paused, false);
    }
  }
});

test('non-play controls never activate a deferred source; fullscreen enters, exits and reports failure', async () => {
  const f = fixture(true);
  delete f.video.attributes.src;
  f.video.setAttribute('data-video-src', 'movie.mp4');
  f.document.fullscreenEnabled = true;
  f.root.requestFullscreen = async () => {
    f.document.fullscreenElement = f.root;
    f.document.fullscreenchange();
  };
  f.document.exitFullscreen = async () => {
    f.document.fullscreenElement = null;
    f.document.fullscreenchange();
  };
  initNativeVideo(f.root);
  assert.equal(f.elements.fullscreen.disabled, false);
  f.elements.seek.value = '99';
  f.elements.seek.input();
  assert.equal(f.video.currentTime, f.video.duration);
  f.elements.volume.value = '0';
  f.elements.volume.input();
  assert.equal(f.video.muted, true);
  f.elements.mute.click();
  assert.equal(f.video.volume, 1);
  assert.equal(f.video.muted, false);
  f.elements.fullscreen.click();
  assert.equal(f.document.fullscreenElement, f.root);
  f.elements.fullscreen.click();
  assert.equal(f.document.fullscreenElement, null);
  f.root.requestFullscreen = () => Promise.reject(new Error('unavailable'));
  f.elements.fullscreen.click();
  await Promise.resolve();
  assert.match(f.elements.status.textContent, /Fullscreen is unavailable/);
  assert.equal(f.video.getAttribute('src'), null);
  assert.equal(f.video.paused, true);
});

test('direct deferred URL wins over legacy video src and ordered child sources', () => {
  const f = fixture(true);
  f.video.attributes.src = 'legacy.mp4';
  f.video.setAttribute('data-video-src', 'preferred.M3U8?token=1#stream');
  f.video.sources = [childSource('child.mp4', 'video/mp4')];
  f.video.canPlayType = () => 'probably';
  initNativeVideo(f.root);
  assert.equal(f.video.getAttribute('src'), null);
  f.toggle.click();
  assert.equal(MockHls.instances.at(-1).source, 'preferred.M3U8?token=1#stream');
});
