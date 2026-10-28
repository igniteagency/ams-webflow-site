import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../dist/prod/components/internal-navbar.js', import.meta.url), 'utf8');

function setup({ home = false, scroll = 0, reduced = false } = {}) {
  const bar = { getBoundingClientRect: () => ({ bottom: 80 }) };
  const border = {};
  const hero = {};
  const nav = { querySelector: (selector) => selector.includes('navbar-bar') ? bar : border };
  const calls = [];
  const listeners = {};
  const progress = [];
  let config;
  const trigger = { start: 320, end: 460, scroll: () => scroll, refresh() { config.onRefresh(this); } };
  const context = {
    document: {
      documentElement: { dataset: { wfPage: home ? '6ac58464423a10a23dfeb5a0' : 'internal' } },
      querySelector: (selector) => selector.includes('page-hero') ? hero : nav,
      fonts: { ready: Promise.resolve() },
    },
    gsap: { registerPlugin() {}, set() {}, timeline: () => ({
      fromTo: (target, from, values) => calls.push({ target, from, values }),
      progress: (value) => progress.push(value),
    }) },
    innerHeight: 1000,
    ScrollTrigger: { create: (options) => { config = options; return trigger; } },
    getComputedStyle: () => ({ borderBottomColor: 'rgba(255,255,255,0.3)' }),
    matchMedia: () => ({ matches: reduced, addEventListener() {} }),
    addEventListener: (name, handler) => { listeners[name] = handler; },
    console,
  };
  context.window = { Webflow: { push: (fn) => fn() } };
  vm.runInNewContext(script, context);
  return { calls, progress, bar, border, config, listeners, trigger, setScroll: (value) => { scroll = value; config.onUpdate(trigger); } };
}

test('fade starts at hero midpoint over the same 14vh distance as home and reverses', () => {
  const state = setup();
  assert.equal(state.config.start(), 'center top+=80');
  assert.ok(Math.abs(Number(state.config.end().slice(2)) - 140) < 1e-8);
  assert.equal(state.progress.at(-1), 0);
  state.setScroll(390);
  assert.equal(state.progress.at(-1), 0.5);
  state.setScroll(460);
  assert.equal(state.progress.at(-1), 1);
  assert.equal(state.calls[0].values.backgroundColor, 'rgba(128,128,128,0.5)');
  assert.equal(state.calls[0].values.backdropFilter, 'blur(36.3px)');
  assert.equal(state.progress.at(-1), 1);
  state.setScroll(10000);
  assert.equal(state.calls.at(-1).values.borderBottomColor, 'transparent');
  state.setScroll(0);
  assert.equal(state.progress.at(-1), 0);
  assert.ok(state.calls.every(({ target }) => target === state.bar || target === state.border));
});

test('restored scroll and refresh immediately apply the correct state', () => {
  const state = setup({ scroll: 2000 });
  assert.equal(state.progress.at(-1), 1);
  state.trigger.start = 2500;
  state.trigger.end = 2640;
  state.listeners.pageshow();
  assert.equal(state.progress.at(-1), 0);
});

test('homepage has no internal handler and reduced motion has no fade duration', () => {
  assert.equal(setup({ home: true }).config, undefined);
  const state = setup({ reduced: true });
  state.setScroll(321);
  assert.equal(state.progress.at(-1), 1);
});
