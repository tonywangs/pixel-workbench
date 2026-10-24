import sharp from 'sharp';
import { createHash } from 'node:crypto';

export const limits = { frames: 120, sourceBytes: 8 * 1024 * 1024, totalBytes: 24 * 1024 * 1024, side: 2048, timelinePixels: 32000000, duration: 60000 };
export const hash = data => createHash('sha256').update(data).digest('hex');
export const policy = { canvas: 'Maximum oriented width and height; transparent top-left padding, no scaling', orientation: 'Apply EXIF orientation once', color: 'Convert embedded profiles to sRGB; untagged RGB assumed sRGB; reject non-RGB/grayscale and >8-bit inputs', alpha: 'Straight RGBA; fully transparent RGB canonicalized to zero; lossless visible pixels', timing: 'Integer milliseconds, 1..60000 per occurrence; browser scheduling is approximate', loop: '0 = infinite; 1..65535 = total plays', metadata: 'Source bytes preserved; exported image metadata removed' };
const fail = message => { throw new Error(message); };
const integer = (x, min, max, name) => { if (!Number.isInteger(x) || x < min || x > max) fail(`${name} must be an integer from ${min} to ${max}`); };

export async function decodeSource(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > limits.sourceBytes) fail('Source must be 1 byte to 8 MiB');
  // libvips may expose only the default PNG image for APNG. Inspect the
  // standard animation-control chunk before accepting a purported still PNG.
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    for (let offset = 8; offset + 8 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      if (offset + 12 + length > bytes.length) fail('Truncated PNG chunk');
      if (type === 'acTL') fail('Only single-frame PNG and JPEG inputs are supported; APNG is animated');
      offset += 12 + length;
      if (type === 'IEND') break;
    }
  }
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: limits.side ** 2 });
  const meta = await image.metadata();
  if (!['png', 'jpeg'].includes(meta.format) || (meta.pages || 1) !== 1) fail('Only single-frame PNG and JPEG inputs are supported');
  if (!['srgb', 'b-w'].includes(meta.space) || meta.depth !== 'uchar' || (meta.bitsPerSample || 8) > 8) fail('Only 8-bit RGB or grayscale images are supported');
  const { data, info } = await image.autoOrient().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width > limits.side || info.height > limits.side) fail('Oriented dimensions must not exceed 2048 pixels per side');
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0) data.fill(0, i, i + 3);
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { data, width: info.width, height: info.height, png, sourceHash: hash(bytes), format: meta.format, orientation: meta.orientation || 1, profile: meta.hasProfile ? 'embedded profile converted to sRGB' : 'assumed sRGB' };
}

export async function prepareProject(project) {
  if (!project || project.version !== 1 || !Array.isArray(project.frames) || !project.sources || typeof project.sources !== 'object') fail('Invalid version 1 project');
  integer(project.loop, 0, 65535, 'Loop');
  integer(project.frames.length, 1, limits.frames, 'Frame count');
  const ids = new Set(), decoded = new Map();
  let totalBytes = 0;
  for (const frame of project.frames) {
    if (!frame || typeof frame.id !== 'string' || !/^[\w-]{1,100}$/.test(frame.id) || ids.has(frame.id)) fail('Occurrence IDs must be distinct');
    ids.add(frame.id);
    integer(frame.duration, 1, limits.duration, 'Duration');
    if (typeof frame.hash !== 'string' || !/^[a-f0-9]{64}$/.test(frame.hash)) fail('Invalid source hash');
    if (!decoded.has(frame.hash)) {
      const source = project.sources[frame.hash];
      if (!source || typeof source.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(source.data)) fail('Missing source: reconnect the original matching file');
      const bytes = Buffer.from(source.data, 'base64');
      totalBytes += bytes.length;
      if (totalBytes > limits.totalBytes) fail('Unique source bytes exceed 24 MiB');
      if (hash(bytes) !== frame.hash) fail('Source SHA-256 mismatch; reconnect the original matching file');
      decoded.set(frame.hash, await decodeSource(bytes));
    }
  }
  const width = Math.max(...[...decoded.values()].map(s => s.width));
  const height = Math.max(...[...decoded.values()].map(s => s.height));
  if (width * height * project.frames.length > limits.timelinePixels) fail('Timeline exceeds 32 million canvas pixels');
  const frames = project.frames.map(frame => {
    const source = decoded.get(frame.hash), rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < source.height; y++) source.data.copy(rgba, y * width * 4, y * source.width * 4, (y + 1) * source.width * 4);
    return { ...frame, rgba, source };
  });
  return { width, height, frames, loop: project.loop };
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + (data.length % 2));
  out.write(type); out.writeUInt32LE(data.length, 4); data.copy(out, 8); return out;
}
function u24(buf, value, offset) { buf.writeUIntLE(value, offset, 3); }
export async function exportProject(project) {
  const prepared = await prepareProject(project);
  const { width, height, frames, loop } = prepared;
  const extended = Buffer.alloc(10); extended[0] = 0x12;
  u24(extended, width - 1, 4); u24(extended, height - 1, 7);
  const anim = Buffer.alloc(6); anim.writeUInt16LE(loop, 4);
  const chunks = [chunk('VP8X', extended), chunk('ANIM', anim)];
  // Full-canvas, no-blend frames make both identical occurrences and transparent clears explicit.
  for (const frame of frames) {
    const encoded = await sharp(frame.rgba, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 4 }).toBuffer();
    const payloads = [];
    for (let pos = 12; pos < encoded.length;) {
      const length = encoded.readUInt32LE(pos + 4), type = encoded.toString('ascii', pos, pos + 4);
      if (type === 'VP8L') payloads.push(encoded.subarray(pos, pos + 8 + length + (length % 2)));
      pos += 8 + length + (length % 2);
    }
    if (payloads.length !== 1) fail('Encoder did not produce one lossless VP8L payload');
    const header = Buffer.alloc(16); u24(header, width - 1, 6); u24(header, height - 1, 9); u24(header, frame.duration, 12); header[15] = 2;
    chunks.push(chunk('ANMF', Buffer.concat([header, ...payloads])));
  }
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const riff = Buffer.alloc(8); riff.write('RIFF'); riff.writeUInt32LE(body.length, 4);
  const webp = Buffer.concat([riff, body]);
  const specimen = Buffer.from(`<!doctype html><meta charset="utf-8"><title>Animation Frame Desk — playback specimen</title><style>body{background:#17212b;color:#eee;font:18px system-ui;text-align:center;padding:3rem}img{width:min(70vw,512px);image-rendering:pixelated;background:repeating-conic-gradient(#ddd 0% 25%,#aaa 0% 50%) 0/24px 24px}a{color:#9ee}</style><h1>Animation playback specimen</h1><p>${frames.length} occurrences · ${width} × ${height} · ${frames.reduce((n,f)=>n+f.duration,0)} ms per play · ${loop === 0 ? 'infinite plays' : loop + ' total plays'}</p><img alt="Exported animation" src="data:image/webp;base64,${webp.toString('base64')}"><p>Standalone embedded WebP. Reload to restart. Browser timing may be clamped.</p>`);
  const manifest = { version: 1, status: 'encoded', width, height, loop, totalDuration: frames.reduce((n, f) => n + f.duration, 0), policy, encoder: { container: 'animation-frame-desk/1 full-canvas ANMF', sharp: sharp.versions }, outputs: { 'animation.webp': hash(webp), 'playback.html': hash(specimen) }, frames: frames.map(f => ({ id: f.id, sourceHash: f.hash, duration: f.duration, sourceWidth: f.source.width, sourceHeight: f.source.height, orientationApplied: f.source.orientation, color: f.source.profile, placement: { x: 0, y: 0 }, normalizedRgbaHash: hash(f.rgba) })) };
  return { webp, specimen, manifest, prepared };
}
