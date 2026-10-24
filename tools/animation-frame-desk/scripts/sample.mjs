import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { hash, exportProject } from '../lib/animation.mjs';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('samples/source/exp2_0.png', root));
const sourceHash = hash(source);
await mkdir(new URL('samples/frames/', root), { recursive: true });
const frames = [], sources = {}, files = [];
for (let i = 0; i < 16; i++) {
  const rect = { left: (i % 4) * 64, top: Math.floor(i / 4) * 64, width: 64, height: 64 };
  const png = await sharp(source).extract(rect).toColourspace('srgb').png().toBuffer();
  const name = `${String(i + 1).padStart(2, '0')}.png`, h = hash(png);
  await writeFile(new URL(`samples/frames/${name}`, root), png);
  files.push({ file: `frames/${name}`, sha256: h, rectangle: rect });
  frames.push({ id: `sample-${i + 1}`, name, hash: h, duration: i === 15 ? 500 : 80 });
  sources[h] = { name, width: 64, height: 64, data: png.toString('base64') };
}
const project = { version: 1, loop: 0, frames, sources };
const output = await exportProject(project);
for (const [name, data] of [['animation.webp', output.webp], ['playback.html', output.specimen], ['manifest.json', JSON.stringify(output.manifest, null, 2)], ['project.json', JSON.stringify(project, null, 2)]]) await writeFile(new URL(`samples/${name}`, root), data);
const provenance = { title: 'explosion', author: 'Cuzco', page: 'https://opengameart.org/content/explosion', published: '2010-12-02', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', sourceUrl: 'https://opengameart.org/sites/default/files/exp2_0.png', sourceFile: 'source/exp2_0.png', sourceSha256: sourceHash, revision: `Content-addressed source revision sha256:${sourceHash}; upstream does not expose an immutable revision URL`, acquired: '2026-10-22', extraction: 'Explicit sprite-sheet extraction: 256×256 sheet, sixteen 64×64 tiles in row-major order. Embedded profile converted to sRGB by sharp; PNG metadata stripped. No generated frames.', extractionEncoder: sharp.versions, files };
await writeFile(new URL('samples/provenance.json', root), JSON.stringify(provenance, null, 2));
console.log(`Generated real-artwork sample: ${frames.length} frames, ${output.manifest.totalDuration} ms, ${output.webp.length} WebP bytes`);
