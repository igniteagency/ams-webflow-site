import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Asset-authoring helper for macOS; normal builds use the checked-in previews.
const [scene, posterUrl] = process.argv.slice(2);
if (!['sydney', 'melbourne'].includes(scene) || !posterUrl?.startsWith('https://')) {
  throw new Error('Usage: node bin/refresh-home-hero-preview.js sydney|melbourne https://poster-url');
}
const directory = await mkdtemp(path.join(tmpdir(), 'ams-hero-preview-'));
try {
  const original = path.join(directory, 'original');
  const preview = path.join(directory, 'preview.jpg');
  execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '30', posterUrl, '-o', original]);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '35', '--resampleWidth', '64', original, '--out', preview]);
  const file = 'src/assets/home-hero-previews.json';
  const previews = JSON.parse(await readFile(file, 'utf8'));
  previews[scene] = {
    sourcePoster: posterUrl,
    dataUrl: 'data:image/jpeg;base64,' + (await readFile(preview)).toString('base64'),
  };
  await writeFile(file, JSON.stringify(previews, null, 2) + '\n');
} finally {
  await rm(directory, { recursive: true });
}
