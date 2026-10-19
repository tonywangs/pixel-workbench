'use strict';
const sharp = require('sharp');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
sharp.cache(false);
sharp.concurrency(2);
const LIMITS = { bytes: 10 * 1024 * 1024, pixels: 24000000, sources: 40, widths: 6, width: 4096, packageBytes: 100 * 1024 * 1024 };
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const decode = b => sharp(b, {limitInputPixels: LIMITS.pixels, failOn: 'warning'});
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function settings(value) {
  if (!value || !Array.isArray(value.widths) || !value.widths.length || value.widths.length > LIMITS.widths || value.widths.some(w => !Number.isInteger(w) || w < 1 || w > LIMITS.width)) throw Error('Choose 1–6 integer widths between 1 and 4096.');
  if (!Number.isInteger(value.quality) || value.quality < 1 || value.quality > 100) throw Error('WebP quality must be an integer from 1 to 100.');
  return {widths: [...new Set(value.widths)].sort((a,b)=>a-b), quality: value.quality};
}
async function inspect(buffer, name, provenance = null) {
  if (!buffer.length || buffer.length > LIMITS.bytes) throw Error('Source must be between 1 byte and 10 MiB.');
  // Check signatures before invoking decoders for other formats.
  if (!(buffer[0] === 255 && buffer[1] === 216) && !buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Only static JPEG and PNG sources are supported.');
  if (buffer[0] === 137) {
    for(let offset=8;offset+12<=buffer.length;) {
      const length=buffer.readUInt32BE(offset), type=buffer.toString('ascii',offset+4,offset+8);
      if(type==='acTL') throw Error('Animated PNG images are not supported.');
      if(length>buffer.length-offset-12) throw Error('Truncated PNG chunk.');
      offset+=length+12;
      if(type==='IEND') break;
    }
  }
  const m = await decode(buffer).metadata();
  if (!['jpeg','png'].includes(m.format) || (m.pages || 1) !== 1) throw Error('Animated/multipage images are not supported.');
  await decode(buffer).stats(); // Force full decode before accepting a source.
  const swap = [5,6,7,8].includes(m.orientation);
  return {sha256: hash(buffer), name: String(name).slice(0,240), bytes: buffer.length, width: swap ? m.height : m.width, height: swap ? m.width : m.height, rawWidth:m.width,rawHeight:m.height, orientation:m.orientation || 1, format:m.format, alpha:!!m.hasAlpha, colorProfile:m.icc ? 'embedded ICC converted to sRGB' : 'untagged: assumed sRGB', provenance};
}
async function variant(buffer, width, quality, format) {
  const p = decode(buffer).autoOrient().resize({width, withoutEnlargement:true, kernel:'lanczos3'}).toColourspace('srgb');
  if (format === 'webp') p.webp({quality, effort:4});
  else if (format === 'jpeg') p.jpeg({quality:85, mozjpeg:false, chromaSubsampling:'4:4:4'});
  else p.png({compressionLevel:9});
  return p.toBuffer({resolveWithObject:true});
}
async function buildPackage(entries, config, getSource, dest) {
  config = settings(config);
  if (!Array.isArray(entries) || !entries.length || entries.length > LIMITS.sources || new Set(entries.map(e=>e.sha256)).size !== entries.length) throw Error('Select 1–40 unique source hashes.');
  await fs.mkdir(path.join(dest,'images'),{recursive:true});
  const manifest = {schema:1, engine:{sharp:sharp.versions.sharp,vips:sharp.versions.vips}, settings:config, policy:{orientation:'EXIF 1–8 applied before resize',enlargement:false,color:'sRGB; untagged assumed sRGB',metadata:'EXIF/XMP/IPTC/ICC removed after conversion',alpha:'preserved in WebP and PNG; JPEG fallback only for opaque sources',jpegQuality:85}, sources:[], counts:{exported:0,skipped:0,failed:0}, outputBytes:0};
  const figures=[];
  for (const entry of entries) {
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid source hash.');
    const item={sha256:entry.sha256,name:String(entry.name || 'image').slice(0,240), outputs:[]};
    manifest.sources.push(item);
    let buffer, source, sourceError;
    try {
      buffer=await getSource(entry.sha256);
      if(hash(buffer)!==entry.sha256) throw Error('Source hash mismatch; reconnect the exact original.');
      source=await inspect(buffer,item.name,entry.provenance || null);
      Object.assign(item,source);
    } catch(e) {sourceError=e.message;}
    for (const width of config.widths) {
      for (const format of ['webp',source ? (source.alpha?'png':'jpeg') : 'fallback']) {
        const result={requestedWidth:width,format}; item.outputs.push(result);
        if(sourceError) {Object.assign(result,{status:'failed',reason:sourceError});manifest.counts.failed++;continue;}
        if(width>source.width) {Object.assign(result,{status:'skipped',reason:`No enlargement: source width is ${source.width}px.`});manifest.counts.skipped++;continue;}
        try {
          const {data,info}=await variant(buffer,width,config.quality,format);
          if(manifest.outputBytes+data.length>LIMITS.packageBytes) throw Error('100 MiB package output limit reached.');
          const file=`images/${entry.sha256}-${width}.${format==='jpeg'?'jpg':format}`;
          await fs.writeFile(path.join(dest,file),data);
          Object.assign(result,{status:'exported',path:file,width:info.width,height:info.height,bytes:data.length,sha256:hash(data),largerThanSource:data.length>source.bytes});
          manifest.outputBytes+=data.length;manifest.counts.exported++;
        } catch(e) {Object.assign(result,{status:'failed',reason:e.message});manifest.counts.failed++;}
      }
    }
    const webp=item.outputs.filter(o=>o.status==='exported'&&o.format==='webp');
    const fallback=item.outputs.filter(o=>o.status==='exported'&&o.format!=='webp');
    if(fallback.length) {
      const biggest=fallback.at(-1), sizes='(max-width: 960px) calc(100vw - 32px), 928px';
      const srcset=list=>list.map(o=>`${o.path} ${o.width}w`).join(', ');
      figures.push(`<figure><picture>${webp.length?`<source type="image/webp" srcset="${srcset(webp)}" sizes="${sizes}">`:''}<img src="${biggest.path}" srcset="${srcset(fallback)}" sizes="${sizes}" width="${biggest.width}" height="${biggest.height}" alt="${escape(item.provenance?.title || item.name)}"></picture><figcaption>${escape(item.provenance?.title || item.name)} — ${escape(item.provenance?.creator || 'Local source')}. ${escape(item.provenance?.license || 'Rights not supplied')}${/^https?:\/\//.test(item.provenance?.sourceUrl || '')?` · <a href="${escape(item.provenance.sourceUrl)}">Source</a>`:''}</figcaption></figure>`);
    } else figures.push(`<p>${escape(item.name)}: no usable fallback exported. See manifest for reasons.</p>`);
  }
  await fs.writeFile(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(dest,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Responsive image specimen</title><style>body{max-width:928px;margin:24px auto;padding:0 16px;font:16px/1.6 system-ui;background:#f5f2eb;color:#242f2b}figure{margin:32px 0}img{display:block;width:100%;height:auto}figcaption{margin-top:8px}a{color:#146c57}</style><h1>Responsive image specimen</h1><p>Local assets only. Inspect currentSrc to see the browser's choice. ${manifest.counts.exported} exported, ${manifest.counts.skipped} skipped, ${manifest.counts.failed} failed.</p>${figures.join('\n')}</html>`);
  await fs.writeFile(path.join(dest,'README.txt'),'Open index.html locally or serve this folder. Copy each picture element with its images directory; adapt sizes to your actual layout and write useful alt text. The specimen uses a 928px maximum content width with 16px side padding. Browser resource choice varies with viewport, density, cache and browser policy. manifest.json accounts for all requested widths and both formats, including failures. JPEG fallback quality 85; transparent inputs use PNG. Original sources are never included or modified. Numerical compression settings do not establish perceived quality.\n');
  return manifest;
}
module.exports={LIMITS,hash,inspect,variant,settings,buildPackage};
