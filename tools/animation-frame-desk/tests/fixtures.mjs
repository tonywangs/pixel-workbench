import sharp from 'sharp';
import { hash } from '../lib/animation.mjs';
export async function controls() {
  const red = await sharp(Buffer.from([255,0,0,255, 0,255,0,128, 0,0,255,64, 99,88,77,0]), { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer();
  const clear = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#00000000' } }).png().toBuffer();
  const jpeg = await sharp(Buffer.from([255,0,0, 0,0,255]), { raw: { width: 2, height: 1, channels: 3 } }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).withMetadata({ orientation: 6 }).toBuffer();
  const bytes = [red, red, clear, jpeg]; const sources = {};
  const frames = bytes.map((b, i) => { const h = hash(b); sources[h] = { name: `control-${i}.png`, data: b.toString('base64') }; return { id: `control-${i}`, hash: h, name: `control-${i}`, duration: [37, 143, 61, 259][i] }; });
  return { version: 1, loop: 2, frames, sources };
}
