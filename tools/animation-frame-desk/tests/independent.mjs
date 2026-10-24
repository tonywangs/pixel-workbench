// Verification deliberately does not import the exporter or sharp.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export function parseWebP(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'RIFF size');
  let width, height, loop; const durations = [];
  for (let p = 12; p < bytes.length;) {
    assert(p + 8 <= bytes.length, 'chunk header bounds');
    const tag = bytes.toString('ascii', p, p + 4), size = bytes.readUInt32LE(p + 4), d = p + 8;
    assert(d + size <= bytes.length, 'chunk data bounds');
    if (tag === 'VP8X') { assert.equal(size, 10); assert(bytes[d] & 2, 'animation flag'); width = bytes.readUIntLE(d + 4, 3) + 1; height = bytes.readUIntLE(d + 7, 3) + 1; }
    if (tag === 'ANIM') { assert.equal(size, 6); loop = bytes.readUInt16LE(d + 4); }
    if (tag === 'ANMF') { assert(size >= 16); durations.push(bytes.readUIntLE(d + 12, 3)); }
    p = d + size + size % 2; assert(p <= bytes.length);
  }
  assert(width && height && loop !== undefined && durations.length, 'animation metadata required');
  return { width, height, loop, durations };
}

// Compare piecewise-constant timelines. Either encoder may merge consecutive equal frames.
export function compareTimeline(expected, actual) {
  let i = 0, j = 0, left = expected[0]?.duration, right = actual[0]?.duration, elapsed = 0;
  while (i < expected.length && j < actual.length) {
    assert.equal(actual[j].hash, expected[i].hash, `Displayed pixels differ at ${elapsed} ms (occurrence ${i + 1}, decoded frame ${j + 1})`);
    const step = Math.min(left, right); assert(step > 0); elapsed += step; left -= step; right -= step;
    if (!left) left = expected[++i]?.duration;
    if (!right) right = actual[++j]?.duration;
  }
  assert.equal(i, expected.length, 'all requested occurrences accounted for');
  assert.equal(j, actual.length, 'no unrequested decoded time');
  return elapsed;
}

export async function verify(browser, webp, manifest, project, specimen) {
  const metadata = parseWebP(webp);
  assert.equal(sha256(webp), manifest.outputs['animation.webp'], 'WebP output SHA-256');
  if (specimen) assert.equal(sha256(specimen), manifest.outputs['playback.html'], 'specimen output SHA-256');
  assert.equal(metadata.width, manifest.width); assert.equal(metadata.height, manifest.height); assert.equal(metadata.loop, project.loop); assert.equal(manifest.loop, project.loop);
  assert.equal(manifest.frames.length, project.frames.length);
  const expected = project.frames.map((f, i) => {
    assert.equal(sha256(Buffer.from(project.sources[f.hash].data, 'base64')), f.hash, 'original hash');
    const m = manifest.frames[i]; assert.equal(m.id, f.id); assert.equal(m.sourceHash, f.hash); assert.equal(m.duration, f.duration);
    return { hash: m.normalizedRgbaHash, duration: f.duration };
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4317');
  const decoded = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const decoder = new ImageDecoder({ data: bytes, type: 'image/webp', preferAnimation: true });
    await decoder.tracks.ready; await decoder.completed;
    const track = decoder.tracks.selectedTrack, frames = [];
    for (let i = 0; i < track.frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
      const rgba = new Uint8Array(image.allocationSize({ format: 'RGBA' }));
      await image.copyTo(rgba, { format: 'RGBA' });
      for (let j = 0; j < rgba.length; j += 4) if (rgba[j + 3] === 0) rgba.fill(0, j, j + 3);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))].map(b => b.toString(16).padStart(2, '0')).join('');
      frames.push({ rgba: Array.from(rgba), hash, width: image.displayWidth, height: image.displayHeight, duration: image.duration / 1000, timestamp: image.timestamp / 1000 });
      image.close();
    }
    decoder.close(); return { frames, repetitionCount: track.repetitionCount };
  }, webp.toString('base64'));
  await page.close();
  assert.equal(decoded.frames.length, metadata.durations.length, 'decoder and parser agree on encoded frame count');
  let time = 0;
  for (const [i, f] of decoded.frames.entries()) {
    assert.equal(f.width, metadata.width); assert.equal(f.height, metadata.height);
    // Chromium clamps very short durations. The exact encoded timeline comes from RIFF.
    assert.equal(f.timestamp, time, 'decoder temporal order'); time += f.duration;
    f.duration = metadata.durations[i];
  }
  const python = process.env.PYTHON || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
  const check = spawnSync(python, ['scripts/verify_pixels.py'], {input:JSON.stringify({project,manifest,webp:webp.toString('base64')}),encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(check.status,0, `Independent pixel check failed: ${check.stderr || check.error}`);
  const pixels=JSON.parse(check.stdout);
  const duration=metadata.durations.reduce((a,b)=>a+b,0);
  assert.equal(duration,manifest.totalDuration);
  // Chromium can round semi-transparent RGB through premultiplication. Exact
  // source/manifest pixels are checked above using Pillow, never weakened here.

  return { decoder: 'Chromium WebCodecs ImageDecoder', containerChecker: 'independent RIFF parser', width: metadata.width, height: metadata.height, requestedOccurrences: expected.length, encodedFrames: decoded.frames.length, totalDurationMs: duration, loop: metadata.loop, exactRgbaTimeline: true, pixels, sourceHashes: true, outputHashes: true, independentOriginalAppearance: true, jpegChannelTolerance: 3 };
}
