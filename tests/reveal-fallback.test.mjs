import { transformSync } from 'esbuild';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const code = transformSync(
  readFileSync(new URL('../src/utils/reveal-fallback.ts', import.meta.url), 'utf8'),
  { loader: 'ts', format: 'cjs' }
).code;
function element(top = 800, children = [], stopped = false) {
  const values = new Map();
  const classes = new Set();
  return {
    top,
    children,
    classes,
    calls: [],
    style: {
      get opacity() {
        return values.get('opacity') || '';
      },
      set opacity(v) {
        values.set('opacity', v);
      },
      getPropertyValue: (k) => values.get(k) || '',
      getPropertyPriority: () => '',
      setProperty: (k, v) => values.set(k, v),
      removeProperty: (k) => values.delete(k),
    },
    classList: { add: (v) => classes.add(v) },
    hasAttribute: () => children.length > 0,
    querySelectorAll: (selector) => {
      assert.equal(selector, ":scope > *:not(.display-contents):not([class*='spacer'])");
      return children;
    },
    closest: () => stopped,
    getBoundingClientRect() {
      return { top: this.top };
    },
    animate(frames, options) {
      const animation = {
        cancel() {
          this.oncancel?.();
        },
        frames,
        options,
      };
      this.calls.push(animation);
      return animation;
    },
  };
}
function setup(elements, options = {}) {
  const listeners = new Map();
  const motion = {
    matches: !!options.reduced,
    addEventListener: (k, fn) => listeners.set('motion', fn),
    removeEventListener: () => listeners.delete('motion'),
  };
  const observers = [];
  class IO {
    constructor(callback, config) {
      if (options.ioError) throw Error('IO');
      this.callback = callback;
      this.config = config;
      this.observed = new Set();
      observers.push(this);
    }
    observe(e) {
      this.observed.add(e);
    }
    unobserve(e) {
      this.observed.delete(e);
    }
    disconnect() {
      this.observed.clear();
    }
    trigger(e, top, intersect = true) {
      this.callback([{ target: e, boundingClientRect: { top }, isIntersecting: intersect }]);
    }
  }
  const window = {
    innerHeight: 1000,
    matchMedia: () => motion,
    addEventListener: (k, fn) => listeners.set(k, fn),
    removeEventListener: (k) => listeners.delete(k),
  };
  if (!options.noIO) window.IntersectionObserver = IO;
  const context = {
    module: { exports: {} },
    window,
    document: { querySelectorAll: () => elements, documentElement: {} },
    CSS: { supports: () => !!options.native },
    IntersectionObserver: IO,
    getComputedStyle: () => ({ getPropertyValue: (k) => options.vars?.[k] || '' }),
  };
  vm.runInNewContext(code, context);
  context.module.exports.initRevealFallback();
  return { observers, listeners, motion, window };
}
test('native CSS owns motion, with stagger indices only', () => {
  const a = element(),
    b = element();
  const group = element(800, [a, b]);
  const s = setup([group], { native: true });
  assert.equal(s.observers.length, 0);
  assert.equal(a.style.opacity, '');
  assert.equal(a.calls.length, 0);
  assert.equal(b.style.getPropertyValue('--reveal-index'), '1');
});
test('observer triggers once at halfway, staggers, and releases effects/listeners', () => {
  const a = element(),
    b = element(),
    excluded = element(800, [], true);
  const group = element(800, [a, excluded, b]);
  const s = setup([group]);
  const io = s.observers[0];
  assert.equal(io.config.rootMargin, '0px 0px -500px 0px');
  assert.equal(a.style.opacity, '0');
  assert.equal(excluded.style.opacity, '');
  io.trigger(group, 501);
  assert.equal(a.calls.length, 0);
  io.trigger(group, 500);
  io.trigger(group, 400);
  assert.equal(a.calls.length, 1);
  assert.equal(b.calls[0].options.delay, 80);
  assert.equal(a.calls[0].options.duration, 800);
  a.calls[0].onfinish();
  b.calls[0].onfinish();
  assert.equal(a.style.opacity, '');
  assert.equal(a.style.transform, undefined);
  assert.equal(s.listeners.size, 0);
});
test('initial deep-link targets reveal and resize refreshes midpoint', () => {
  const past = element(-2000),
    below = element(800);
  const s = setup([past, below]);
  assert.equal(past.calls.length, 1);
  s.window.innerHeight = 1800;
  s.listeners.get('resize')();
  assert.equal(below.calls.length, 1);
});
test('reduced motion explicitly visible even with native CSS', () => {
  const e = element();
  const s = setup([e], { reduced: true, native: true });
  assert.equal(e.style.opacity, '1');
  assert.equal(e.style.animation, 'none');
  assert.equal(e.calls.length, 0);
  assert.equal(s.observers.length, 0);
});
test('live reduced motion cancels pending and active animation', () => {
  const a = element(0),
    b = element();
  const s = setup([a, b]);
  s.motion.matches = true;
  s.listeners.get('motion')();
  assert.equal(a.style.opacity, '1');
  assert.equal(b.style.opacity, '1');
  assert.equal(s.listeners.size, 0);
});
for (const option of ['noIO', 'ioError', 'noWAAPI', 'animationError'])
  test(`${option} fails visible`, () => {
    const e = element();
    if (option === 'noWAAPI') e.animate = undefined;
    if (option === 'animationError') {
      e.top = 0;
      e.animate = () => {
        throw Error('WAAPI');
      };
    }
    const s = setup([e], { [option]: true });
    assert.equal(e.style.opacity, '');
    assert.equal(s.listeners.size, 0);
  });
test('no elements is a noop', () => {
  const s = setup([]);
  assert.equal(s.observers.length, 0);
  assert.equal(s.listeners.size, 0);
});
test('custom properties control keyframes and timings', () => {
  const e = element(0);
  setup([e], {
    vars: {
      '--reveal-duration': '1.2s',
      '--reveal-y': '7rem',
      '--animation--fade-distance': '2rem',
      '--reveal-opacity': '0.2',
    },
  });
  assert.equal(e.calls[0].options.duration, 1200);
  assert.equal(e.calls[0].frames[0].transform, 'translateY(2rem)');
  assert.equal(e.calls[0].frames[0].opacity, '0.2');
});
