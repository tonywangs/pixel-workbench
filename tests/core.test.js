const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
const {inspect,hash,variant,buildPackage,settings}=require('../engine');
const tiny=()=>sharp({create:{width:80,height:40,channels:4,background:{r:240,g:50,b:10,alpha:.4}}}).png().toBuffer();
test('settings reject dangerous or ambiguous workloads',()=>{for(const c of [{widths:[],quality:70},{widths:[0],quality:70},{widths:[5000],quality:70},{widths:[20],quality:0},{widths:[20.5],quality:50}])assert.throws(()=>settings(c));assert.deepEqual(settings({widths:[32,16,32],quality:80}),{widths:[16,32],quality:80});});
test('invalid, unsupported and truncated inputs rejected',async()=>{for(const b of [Buffer.from('no image'),Buffer.from('<svg/>'),Buffer.from([255,216,255])])await assert.rejects(inspect(b,'bad'));const gif=await sharp(await tiny()).gif().toBuffer();await assert.rejects(inspect(gif,'animated.gif'));});
test('transparent output, no enlargement, same-name sources, accounting, originals unchanged',async()=>{
 const a=await tiny(),b=await sharp({create:{width:90,height:50,channels:3,background:'#00aa44'}}).jpeg().toBuffer();const ah=hash(a),bh=hash(b),dir=await fs.mkdtemp(path.join(os.tmpdir(),'desk-core-'));
 try{const m=await buildPackage([{sha256:ah,name:'same.png'},{sha256:bh,name:'same.png'}],{widths:[40,80,160],quality:75},id=>id===ah?a:b,dir);
 assert.deepEqual(m.counts,{exported:8,skipped:4,failed:0});assert.equal(m.sources[0].outputs.filter(o=>o.status==='exported'&&o.format==='png').length,2);
 const outputs=m.sources.flatMap(s=>s.outputs).filter(o=>o.status==='exported');assert.equal(new Set(outputs.map(o=>o.path)).size,8);
 for(const o of outputs){const buf=await fs.readFile(path.join(dir,o.path));assert.equal(hash(buf),o.sha256);assert.equal(buf.length,o.bytes);const meta=await sharp(buf).metadata();assert.equal(meta.width,o.width);assert.equal(meta.height,o.height);assert.equal(meta.orientation,undefined);assert.equal(meta.exif,undefined);}
 assert.equal(hash(a),ah);assert.equal(hash(b),bh);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('all EXIF orientations report oriented dimensions and strip orientation',async()=>{for(let orientation=1;orientation<=8;orientation++){const b=await sharp({create:{width:80,height:40,channels:3,background:'#ddaa22'}}).jpeg().withMetadata({orientation}).toBuffer();const s=await inspect(b,'oriented.jpg');assert.equal(s.width,orientation>=5?40:80);assert.equal(s.height,orientation>=5?80:40);const v=await variant(b,20,80,'webp');assert.equal(v.info.width,20);assert.equal(v.info.height,orientation>=5?40:10);assert.equal((await sharp(v.data).metadata()).orientation,undefined);}});
test('missing and hash-mismatched sources yield explicit failed variants',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desk-missing-'));try{const m=await buildPackage([{sha256:'a'.repeat(64),name:'missing'}],{widths:[40,80],quality:80},()=>Buffer.from('wrong bytes'),dir);assert.deepEqual(m.counts,{exported:0,skipped:0,failed:4});assert.ok(m.sources[0].outputs.every(o=>o.reason.includes('hash mismatch')));}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('tiny PNG size increases are reported instead of hidden',async()=>{const b=await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desk-increase-'));try{const m=await buildPackage([{sha256:hash(b),name:'pixel.png'}],{widths:[1],quality:100},()=>b,dir);assert.ok(m.sources[0].outputs.some(o=>o.largerThanSource));}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('valid synthetic two-frame APNG is rejected before single-frame decoder fallback',async()=>{
 const zlib=require('node:zlib');
 const chunk=(type,data)=>{const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(zlib.crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=6;
 const actl=Buffer.alloc(8);actl.writeUInt32BE(2,0);
 const fctl=seq=>{const b=Buffer.alloc(26);b.writeUInt32BE(seq);b.writeUInt32BE(2,4);b.writeUInt32BE(2,8);b.writeUInt16BE(1,20);b.writeUInt16BE(10,22);return b;};
 const red=zlib.deflateSync(Buffer.from([0,255,0,0,255,255,0,0,255,0,255,0,0,255,255,0,0,255]));const green=zlib.deflateSync(Buffer.from([0,0,255,0,255,0,255,0,255,0,0,255,0,255,0,255,0,255]));const seq=Buffer.alloc(4);seq.writeUInt32BE(2);
 const apng=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('acTL',actl),chunk('fcTL',fctl(0)),chunk('IDAT',red),chunk('fcTL',fctl(1)),chunk('fdAT',Buffer.concat([seq,green])),chunk('IEND',Buffer.alloc(0))]);
 assert.equal((await sharp(apng).metadata()).format,'png');await assert.rejects(inspect(apng,'animated.png'),/Animated PNG/);
});
