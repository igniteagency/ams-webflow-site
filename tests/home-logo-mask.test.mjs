import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const compiled = await build({
  entryPoints: [new URL('../src/utils/home-logo-mask.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
});
const context = vm.createContext({ module: { exports: {} } });
vm.runInContext(compiled.outputFiles[0].text, context);
const { homeLogoMaskImage, homeLogoMaskRect } = context.module.exports;

test('bridge stays registered to the video cover crop at desktop and mobile sizes', () => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [820, 1180], [667, 375], [393, 852]]) {
    const rect = homeLogoMaskRect({ left: 0, top: 0, width, height });
    assert.ok(rect.width >= width && rect.height >= height);
    assert.ok(Math.abs(rect.width / rect.height - 16 / 9) < 1e-10);
    // The video's optical centre and the Figma canvas centre must coincide.
    assert.equal(rect.left + rect.width / 2, width / 2);
    assert.equal(rect.top + rect.height / 2, height / 2);
    assert.ok(Math.abs(rect.width - width) < 1e-9 || Math.abs(rect.height - height) < 1e-9);
  }
});

test('scroll moves the bridge cutout with the scene, independently of logo scale and position', () => {
  const initial = homeLogoMaskRect({ left: 0, top: 0, width: 1440, height: 900 });
  for (const scroll of [20, 50, 315, 630, 315, 50, 0]) {
    const rect = homeLogoMaskRect({ left: 0, top: -scroll, width: 1440, height: 900 });
    assert.equal(rect.top, initial.top - scroll);
    assert.equal(rect.left, initial.left);
    assert.equal(rect.width, initial.width);
    assert.equal(rect.height, initial.height);
  }
});

test('feather remains one CSS pixel at every cover scale', () => {
  const image = 'url("data:image/svg+xml,%3CfeGaussianBlur%20stdDeviation%3D%221%22%2F%3E")';
  for (const [width, height] of [[1920, 1080], [1440, 900], [820, 1180], [667, 375], [393, 852]]) {
    const mask = homeLogoMaskRect({ left: 0, top: 0, width, height });
    const svg = decodeURIComponent(homeLogoMaskImage(image, mask.width));
    const deviation = Number(svg.match(/stdDeviation="([^"]+)"/)[1]);
    assert.ok(Math.abs(deviation * mask.width / 1920 - 1) < 1e-10);
  }
  assert.equal(homeLogoMaskImage(image, 0), image);
});

test('readable SVG respects the edited feather value, including a sharp edge', () => {
  for (const feather of [0, 0.5, 1, 2]) {
    const image = `url("data:image/svg+xml,<svg><feGaussianBlur in='SourceAlpha' stdDeviation='${feather}'/></svg>")`;
    for (const [width, height] of [[1920, 1080], [1440, 900], [820, 1180], [667, 375], [393, 852]]) {
      const mask = homeLogoMaskRect({ left: 0, top: 0, width, height });
      const result = homeLogoMaskImage(image, mask.width);
      const deviation = Number(result.match(/stdDeviation='([^']+)'/)[1]);
      assert.ok(Math.abs(deviation * mask.width / 1920 - feather) < 1e-10);
    }
  }
});
