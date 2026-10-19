import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {analyze,hash,algorithm,limits} from '../engine.js';
import {pairs,validate,report,SCHEMA} from '../public/model.js';
const root=new URL('../demo/images/',import.meta.url);
const load=name=>readFile(new URL(name,root));
const manifest=JSON.parse(await readFile(new URL('../demo/manifest.json',import.meta.url)));
const files=[];
for(const [i,row] of manifest.files.entries())files.push({id:'f'+(i+1),name:row.file,status:'processed',...await analyze(await load(row.file))});
const get=name=>files.find(f=>f.name===name);
const pair=(a,b)=>pairs([get(a),get(b)])[0];
test('frozen source hashes and input preservation after processing',async()=>{for(const row of manifest.files)assert.equal(hash(await load(row.file)),row.sha256,row.file);});
test('byte, pixel and perceptual evidence are distinct',()=>{
 assert.equal(pair('astronaut.png','control-byte-copy.png').type,'bytes');
 assert.equal(pair('astronaut.png','control-pixel-copy.png').type,'pixels');
 assert.equal(pair('astronaut.png','control-orientation.png').type,'pixels');
 assert.equal(pair('astronaut.png','control-recompress.jpg').type,'similar');
 assert.equal(pair('astronaut.png','control-resize.jpg').type,'similar');
 assert.equal(pair('astronaut.png','coffee.png').type,'noncandidate');
});
test('independent direct byte and decoded array comparisons verify every exact finding',async()=>{
 const decoded=new Map();for(const f of files)decoded.set(f.id,await sharp(await load(f.name)).autoOrient().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}));
 for(const p of pairs(files)){
  const a=files.find(f=>f.id===p.a),b=files.find(f=>f.id===p.b),da=decoded.get(p.a),db=decoded.get(p.b);
  const bytes=(await load(a.name)).equals(await load(b.name));
  const pixels=da.info.width===db.info.width&&da.info.height===db.info.height&&da.data.equals(db.data);
  assert.equal(p.type==='bytes',bytes,p.id);
  assert.equal(['bytes','pixels'].includes(p.type),pixels,p.id);
 }
});
test('transparent RGB, dimensions and alpha affect exact pixel hashes',async()=>{
 const encode=(data,width,height)=>sharp(Buffer.from(data),{raw:{width,height,channels:4}}).png().toBuffer();
 const a=await analyze(await encode([255,0,0,0,0,0,0,255],2,1));
 const b=await analyze(await encode([0,255,0,0,0,0,0,255],2,1));
 const c=await analyze(await encode([255,0,0,0,0,0,0,255],1,2));
 assert.notEqual(a.pixelHash,b.pixelHash);assert.notEqual(a.pixelHash,c.pixelHash);
});
test('reject corrupt, unsupported, oversized and excessive pixel inputs',async()=>{
 await assert.rejects(analyze(Buffer.from('not an image')));
 await assert.rejects(analyze(Buffer.alloc(limits.bytes+1)),/8 MiB/);
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
 await assert.rejects(analyze(svg),/Only JPEG/);
 const huge=await sharp({create:{width:5000,height:5000,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(analyze(huge),/pixel limit/);
});
test('portable projects validate evidence and reject invalid decisions and executable previews',()=>{
 const p={schema:SCHEMA,algorithm,files,decisions:{}};assert.equal(validate(p),p);
 const missingSize=structuredClone(p);delete missingSize.files[0].bytes;assert.throws(()=>validate(missingSize));
 const bad=structuredClone(p);bad.files[0].thumb='javascript:alert(1)';assert.throws(()=>validate(bad));
 const other=structuredClone(p);other.decisions['f1:f99']={choice:'keep-left',note:'',at:'today'};assert.throws(()=>validate(other));
 const duplicate=structuredClone(p);duplicate.files[1].id=duplicate.files[0].id;assert.throws(()=>validate(duplicate));
 const x=structuredClone(p);x.files[0].name='<img src=x onerror=alert(1)>';assert.ok(!report(x).includes('<img src=x'));
 assert.equal(pairs(files).length,files.length*(files.length-1)/2);
});
