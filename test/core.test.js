import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {inspect,restore,exportPDF,portable,hash} from '../core.js';
import {fixtures} from './fixtures.mjs';
await fixtures();
const source=await readFile('results/fixtures/orientation-1.jpg');
test('all eight EXIF orientations have independently expected corner placement',async()=>{
 const expected=[[0,1,2,3],[1,0,3,2],[3,2,1,0],[2,3,0,1],[0,2,1,3],[2,0,3,1],[3,1,2,0],[1,3,0,2]];
 const colors=[[240,20,20],[20,220,20],[20,20,240],[240,220,20]];
 for(let o=1;o<=8;o++){
  const f=await inspect(await readFile(`results/fixtures/orientation-${o}.jpg`),`o${o}.jpg`);assert.equal(f.status,'ready');assert.equal(f.width,o<5?120:80);assert.equal(f.height,o<5?80:120);
  const {data,info}=await sharp(Buffer.from(f.preview.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true});
  [[10,10],[info.width-11,10],[10,info.height-11],[info.width-11,info.height-11]].forEach(([x,y],i)=>{const rgb=Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3));const target=colors[expected[o-1][i]];assert.ok(rgb.every((v,k)=>Math.abs(v-target[k])<8),`orientation ${o}, corner ${i}: ${rgb}`);});
 }
});
test('reject damaged, unsupported and animated inputs; flatten transparency on white',async()=>{
 for(const name of ['broken.jpg','notes.txt','animated.gif'])assert.equal((await inspect(await readFile('results/fixtures/'+name),name)).status,'rejected',name);
 const f=await inspect(await readFile('results/fixtures/transparent.png'),'transparent.png');const raw=await sharp(Buffer.from(f.preview.split(',')[1],'base64')).raw().toBuffer();assert.deepEqual(Array.from(raw.subarray(0,3)),[255,255,255]);
});
test('project recovery validates hashes, order, settings, and preserves originals',async()=>{
 const f=await inspect(source,'folder/image.jpg');const p={version:1,files:[f],order:['S0001'],settings:{paper:'Letter',columns:4,rows:5,labels:'path'}};
 const restored=await restore(p);assert.deepEqual(portable(restored).order,['S0001']);assert.equal(restored.files[0].sha256,hash(source));assert.equal(hash(await readFile('results/fixtures/orientation-1.jpg')),hash(source));
 await assert.rejects(restore({...p,order:['S0001','S0001']}),/duplicate/);await assert.rejects(restore({...p,order:['S0002']}),/unavailable/);await assert.rejects(restore({...p,settings:{rows:99}}),/Invalid/);await assert.rejects(restore({...p,files:[{...f,sha256:'wrong'}]}),/mismatch/);
 for(const paper of ['A4','Letter']){const result=await exportPDF({...restored,settings:{...restored.settings,paper}});assert.equal(result.pdf.subarray(0,4).toString(),'%PDF');assert.equal(result.manifest.inputs[0].status,'included');assert.equal(result.manifest.selected[0].id,'S0001');}
});
test('bundled real inputs match recorded public-domain provenance and hashes',async()=>{
 const p=JSON.parse(await readFile('demo/provenance.json'));assert.equal(p.images.length,24);
 for(const e of p.images){assert.equal(e.record.isPublicDomain,true);assert.equal(hash(await readFile('demo/images/'+e.filename)),e.sha256);}
});
