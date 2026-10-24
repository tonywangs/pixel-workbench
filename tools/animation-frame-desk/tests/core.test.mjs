import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { decodeSource, prepareProject, exportProject, hash } from '../lib/animation.mjs';
import { controls } from './fixtures.mjs';
import { parseWebP, compareTimeline } from './independent.mjs';

test('real licensed sample hashes, extraction, all 16 occurrences and exact timing', async () => {
  const provenance = JSON.parse(await readFile('samples/provenance.json'));
  assert.equal(hash(await readFile('samples/source/exp2_0.png')), provenance.sourceSha256);
  for (const f of provenance.files) assert.equal(hash(await readFile(`samples/${f.file}`)), f.sha256);
  const project = JSON.parse(await readFile('samples/project.json'));
  const result = await exportProject(project), metadata = parseWebP(result.webp);
  assert.equal(project.frames.length, 16); assert.equal(metadata.width, 64); assert.equal(metadata.height, 64);
  assert.deepEqual(metadata.durations, project.frames.map(f => f.duration)); assert.equal(metadata.loop, 0);
  assert.equal(result.manifest.totalDuration, 1700);
  assert.equal(hash(await readFile('samples/animation.webp')), hash(result.webp), 'sample reproducible byte-for-byte');
});

test('labeled controls: transparency, duplicate occurrences, unequal durations, mixed dimensions and orientation', async () => {
  const project = await controls(); const original = JSON.stringify(project);
  const p = await prepareProject(project);
  assert.equal(p.width, 3); assert.equal(p.height, 2);
  assert.deepEqual([...p.frames[0].rgba.subarray(0, 12)], [255,0,0,255, 0,255,0,128, 0,0,0,0]);
  assert.deepEqual([...p.frames[0].rgba.subarray(12, 24)], [0,0,255,64, 0,0,0,0, 0,0,0,0]);
  assert.equal(p.frames[0].hash, p.frames[1].hash); assert.notEqual(p.frames[0].id, p.frames[1].id);
  assert(p.frames[2].rgba.every(x => x === 0), 'transparent frame clears entire canvas');
  assert.equal(p.frames[3].source.width, 1); assert.equal(p.frames[3].source.height, 2); assert.equal(p.frames[3].source.orientation, 6);
  assert(p.frames[3].rgba[0] > 240 && p.frames[3].rgba[14] > 240, 'orientation puts red above blue');
  const result = await exportProject(project); assert.equal(JSON.stringify(project), original, 'original project unchanged');
  assert.deepEqual(parseWebP(result.webp).durations, [37,143,61,259]); assert.equal(parseWebP(result.webp).loop, 2);
  const decoded = await sharp(result.webp, { animated: true }).ensureAlpha().raw().toBuffer();
  assert.deepEqual(decoded, Buffer.concat(p.frames.map(f => f.rgba)), 'secondary libvips decode preserves exact pixels');
});

test('invalid settings, source substitutions, malformed files, animated and unsupported formats rejected', async () => {
  const p = await controls();
  for (const value of [0, -1, 1.5, 60001, '100', null]) { const q = structuredClone(p); q.frames[0].duration = value; await assert.rejects(prepareProject(q), /Duration/); }
  for (const value of [-1, 1.5, 65536, '0', null]) { const q = structuredClone(p); q.loop = value; await assert.rejects(prepareProject(q), /Loop/); }
  const duplicate = structuredClone(p); duplicate.frames[1].id = duplicate.frames[0].id; await assert.rejects(prepareProject(duplicate), /distinct/);
  const substituted = structuredClone(p); substituted.sources[p.frames[0].hash].data = p.sources[p.frames[2].hash].data; await assert.rejects(prepareProject(substituted), /SHA-256/);
  const missing = structuredClone(p); delete missing.sources[p.frames[0].hash].data; await assert.rejects(prepareProject(missing), /Missing source/);
  await assert.rejects(decodeSource(Buffer.from('not an image')));
  await assert.rejects(decodeSource(Buffer.from('<svg width="10" height="10"></svg>')), /PNG and JPEG/);
  // Two-frame APNG authored with Pillow: red then blue, 50/100 ms.
  const apng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAACAAAAAgAAAAAAAAAAADID6AAAtga1dgAAABRJREFUeJxj/M/A8J+BgYGBiQEKAB8XAgJPlM6+AAAAGmZjVEwAAAABAAAAAgAAAAIAAAAAAAAAAABkA+gAAJomZckAAAAYZmRBVAAAAAJ4nGNkYPj/n4GBgYGJAQoAHRkCAunm7jEAAAAASUVORK5CYII=', 'base64');
  await assert.rejects(decodeSource(apng), /APNG/);
  await assert.rejects(decodeSource(await readFile('samples/animation.webp')), /PNG and JPEG/);
  const deep = await sharp({create:{width:2,height:2,channels:3,background:'red'}}).toColourspace('rgb16').png().toBuffer();
  await assert.rejects(decodeSource(deep), /8-bit RGB/);
  const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).gif().toBuffer(); await assert.rejects(decodeSource(gif), /PNG and JPEG/);
  const cmyk = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).toColourspace('cmyk').jpeg().toBuffer(); await assert.rejects(decodeSource(cmyk), /8-bit RGB/);
  await assert.rejects(decodeSource(Buffer.alloc(8 * 1024 * 1024 + 1)), /8 MiB/);
  const huge = await sharp({ create: { width: 2049, height: 1, channels: 3, background: 'red' } }).png().toBuffer(); await assert.rejects(decodeSource(huge), /2048/);
});

test('timeline comparator permits merging equal neighbors and rejects wrong appearance, order or duration', () => {
  const expected = [{ hash: 'red', duration: 37 }, { hash: 'red', duration: 143 }, { hash: 'blue', duration: 61 }];
  assert.equal(compareTimeline(expected, [{ hash: 'red', duration: 180 }, { hash: 'blue', duration: 61 }]), 241);
  assert.throws(() => compareTimeline(expected, [{ hash: 'red', duration: 179 }, { hash: 'blue', duration: 62 }]));
  assert.throws(() => compareTimeline(expected, [{ hash: 'blue', duration: 61 }, { hash: 'red', duration: 180 }]));
});
