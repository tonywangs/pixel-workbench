// Independent consumer: PDF.js parses/renders the PDF; no generator functions imported.
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const results=[];
for(const kind of ['demo','fixtures']){
 const project=JSON.parse(await readFile(`results/browser/${kind==='demo'?'project':'fixtures-project'}.json`));
 for(const paper of ['A4','Letter']){
  const manifest=JSON.parse(await readFile(`results/${kind}-${paper}.json`));
  const pdf=await getDocument({data:new Uint8Array(await readFile(`results/${kind}-${paper}.pdf`)),useSystemFonts:false}).promise;
  assert.equal(pdf.numPages,manifest.pages);assert.deepEqual(manifest.selected.map(s=>s.id),project.order);
  assert.equal(new Set(manifest.selected.map(s=>s.id)).size,project.order.length);
  assert.equal(manifest.inputs.length,project.files.length);
  let maxRMSE=0,imageCount=0;
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),viewport=page.getViewport({scale:2});
   assert.ok(Math.abs(viewport.width/2-manifest.pageSize[0])<.05);assert.ok(Math.abs(viewport.height/2-manifest.pageSize[1])<.05);
   const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   const rendered=canvas.toBuffer('image/png');await sharp(rendered).resize({width:900}).jpeg({quality:90}).toFile(`results/${kind}-${paper}-page-${n}.jpg`);
   const content=await page.getTextContent(),text=content.items.map(x=>x.str).join('\n');
   const ops=await page.getOperatorList();const images=ops.fnArray.filter(op=>op===OPS.paintImageXObject||op===OPS.paintInlineImageXObject).length;const selected=manifest.selected.filter(x=>x.page===n);assert.equal(images,selected.length);imageCount+=images;
   for(const item of selected){
    assert.ok(text.includes(item.identity),`identity missing ${item.id}`);
    for(const line of item.labelLines)assert.ok(text.includes(line),`label missing ${line}`);
    const source=project.files.find(f=>f.id===item.id);assert.equal(source.sha256,item.sha256);
    const b=item.imageBounds,c=item.cellBounds;assert.ok(b.x>=c.x&&b.y>=c.y&&b.x+b.width<=c.x+c.width+.01&&b.y+b.height<=item.labelBounds.y);
    assert.ok(Math.abs(b.width/b.height-item.width/item.height)<.00001,'aspect ratio');
    const matching=content.items.filter(t=>t.str===item.identity);assert.equal(matching.length,1);
    const identity=matching[0];const iy=manifest.pageSize[1]-identity.transform[5];assert.ok(identity.transform[4]>=c.x&&identity.transform[4]+identity.width<=c.x+c.width+.1&&iy<c.y+c.height,'identity bounds');
    for(const line of item.labelLines){const candidates=content.items.filter(t=>t.str===line);assert.ok(candidates.some(t=>{const ty=manifest.pageSize[1]-t.transform[5];return t.transform[4]>=c.x&&t.transform[4]+t.width<=c.x+c.width+.1&&ty>=item.labelBounds.y&&ty<item.labelBounds.y+item.labelBounds.height+1;}),'label fits cell');}
    // Compare each rendered image with its selected original, not a generator preview.
    const original=await sharp(Buffer.from(source.sourceBase64,'base64')).autoOrient().flatten({background:'white'}).toColourspace('srgb').resize(24,24,{fit:'fill'}).removeAlpha().raw().toBuffer();
    const crop=await sharp(rendered).extract({left:Math.round(b.x*2),top:Math.round(b.y*2),width:Math.floor(b.width*2),height:Math.floor(b.height*2)}).resize(24,24,{fit:'fill'}).removeAlpha().raw().toBuffer();
    let sq=0;for(let i=0;i<original.length;i++)sq+=(original[i]-crop[i])**2;const rmse=Math.sqrt(sq/original.length);maxRMSE=Math.max(maxRMSE,rmse);assert.ok(rmse<12,`${kind} ${paper} ${item.id} visual mismatch RMSE ${rmse}`);
   }
  }
  assert.equal(imageCount,project.order.length);await pdf.destroy();results.push({kind,paper,pages:manifest.pages,selected:imageCount,maxPixelRMSE:maxRMSE});
 }
}
await writeFile('results/pdf-inspection.json',JSON.stringify({method:'PDF.js independent rendering, extracted text/bounds, image operator count, per-cell source pixel comparison (24x24 RGB, RMSE <12)',results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
