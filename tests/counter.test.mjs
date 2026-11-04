import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const globalSource = readFileSync(new URL('../src/global.ts', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8');

test('counter is requested only when its attribute exists', () => {
  for (const present of [false, true]) {
    const requests = [];
    const window = { loadScript: (url) => requests.push(url) };
    const context = vm.createContext({
      window,
      document: { querySelector: (selector) => present && selector === '[data-el="counter"]' },
      duplicateMarqueeList() {},
      initDetailsGroups() {},
    });
    vm.runInContext(
      entrySource.slice(entrySource.indexOf('window.conditionalLoadScript =')),
      context
    );
    const ui = globalSource.match(/function UIFunctions\(\) \{[\s\S]*?\n\}/)[0];
    vm.runInContext(`${ui}\nUIFunctions();`, context);
    assert.deepEqual(requests, present ? ['components/counter.js'] : []);
  }
  assert.doesNotMatch(globalSource, /import .*counter|countup/i);
  const bundle = readFileSync(new URL('../dist/prod/global.js', import.meta.url), 'utf8');
  assert.doesNotMatch(bundle, /smartEasingThreshold/);
  assert.match(
    readFileSync(new URL('../dist/prod/components/counter.js', import.meta.url), 'utf8'),
    /smartEasingThreshold/
  );
});

test('counter preserves formatting, parses ungrouped thousands, and avoids duplicate starts', async () => {
  const instances = [];
  class CountUp {
    constructor(span, endValue, options) {
      instances.push({ span, endValue, options });
    }
    start() {
      assert.fail('scroll spy must own the start');
    }
  }
  const createElement = (textContent) => {
    const attributes = new Map();
    return {
      textContent,
      getAttribute: (name) => attributes.get(name),
      setAttribute: (name, value) => attributes.set(name, value),
      querySelectorAll() {
        return [...this.innerHTML.matchAll(/data-val="([^"]+)"/g)].map((match) => ({
          dataset: { val: match[1] },
        }));
      },
    };
  };
  const elements = [
    '$1234.50+',
    '12,345',
    '-42%',
    '2.2K',
    '30+',
    '5K',
    '6',
    '24/7',
    '12:30',
    '10–20',
    'Heading',
    '1.2.3',
  ].map(createElement);
  const result = await build({
    entryPoints: [new URL('../src/components/counter.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'iife',
    plugins: [
      {
        name: 'mock-countup',
        setup(builder) {
          builder.onResolve({ filter: /^countup.js$/ }, () => ({
            path: 'countup',
            namespace: 'mock',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
            contents: 'export const CountUp = globalThis.MockCountUp;',
          }));
        },
      },
    ],
  });
  const context = vm.createContext({
    MockCountUp: CountUp,
    console,
    document: { querySelectorAll: () => elements },
    window: { matchMedia: () => ({ matches: false }) },
  });
  vm.runInContext(result.outputFiles[0].text, context);
  vm.runInContext(result.outputFiles[0].text, context);
  assert.deepEqual(
    instances.map((item) => item.endValue),
    [1234.5, 12345, -42, 2.2, 30, 5, 6]
  );
  assert.equal(instances[0].options.decimalPlaces, 2);
  assert.equal(instances[0].options.useGrouping, false);
  assert.equal(instances[1].options.useGrouping, true);
  assert.ok(instances.every((item) => item.options.enableScrollSpy && item.options.scrollSpyOnce));
  assert.match(elements[0].innerHTML, /^\$<span/);
  assert.match(elements[2].innerHTML, /<\/span>%$/);
  assert.match(elements[3].innerHTML, /<\/span>K$/);
  assert.equal(instances[3].options.decimalPlaces, 1);
  assert.ok(elements.slice(7).every((element) => element.innerHTML === undefined));
  const reduced = createElement('30+');
  const reducedContext = vm.createContext({
    MockCountUp: CountUp,
    console,
    document: { querySelectorAll: () => [reduced] },
    window: { matchMedia: () => ({ matches: true }) },
  });
  vm.runInContext(result.outputFiles[0].text, reducedContext);
  assert.equal(reduced.innerHTML, undefined);
  assert.equal(instances.length, 7);
});
