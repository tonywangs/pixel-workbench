import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import {createHash} from 'node:crypto';
export const LIMITS={files:100,fileBytes:10*1024*1024,totalBytes:50*1024*1024,pixels:40_000_000};
export const hash=b=>createHash('sha256').update(b).digest('hex');
const font=new URL('./assets/DejaVuSans.ttf',import.meta.url).pathname;
export async function inspect(buffer,name){
 if(typeof name!=='string'||!name||name.length>1024)throw Error('Filename must contain 1–1024 characters');
 const base={name,sha256:hash(buffer),bytes:buffer.length};
 try{
  if(buffer.length>LIMITS.fileBytes)throw Error('Exceeds 10 MiB per-file limit');
  const image=sharp(buffer,{limitInputPixels:LIMITS.pixels,failOn:'warning'});
  const meta=await image.metadata();
  if(!['jpeg','png','webp','gif','tiff'].includes(meta.format))throw Error('Unsupported format (JPEG, PNG, WebP, GIF and TIFF only)');
  if((meta.pages||1)>1)throw Error('Animated or multipage images are not supported');
  const {data,info}=await image.autoOrient().flatten({background:'#ffffff'}).toColourspace('srgb').resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer({resolveWithObject:true});
  return {...base,status:'ready',format:meta.format,originalWidth:meta.width,originalHeight:meta.height,exifOrientation:meta.orientation||1,width:info.width,height:info.height,preview:`data:image/jpeg;base64,${data.toString('base64')}`,sourceBase64:buffer.toString('base64')};
 }catch(e){return {...base,status:'rejected',reason:e.message};}
}
export function settings(input={}){
 const paper=input.paper??'A4',columns=Number(input.columns??3),rows=Number(input.rows??4),labels=input.labels??'filename';
 if(!['A4','Letter'].includes(paper)||![2,3,4].includes(columns)||![3,4,5].includes(rows)||!['filename','path'].includes(labels))throw Error('Invalid paper, grid or label setting');
 return {paper,columns,rows,labels};
}
export async function restore(project){
 if(project?.version!==1||!Array.isArray(project.files)||project.files.length>LIMITS.files||!Array.isArray(project.order))throw Error('Invalid project or more than 100 files');
 let total=0;const files=[];
 for(const [index,entry] of project.files.entries()){
  let file;
  if(entry.sourceBase64){
   if(typeof entry.sourceBase64!=='string'||entry.sourceBase64.length>Math.ceil(LIMITS.fileBytes/3)*4)throw Error('Source exceeds file limit');
   const bytes=Buffer.from(entry.sourceBase64,'base64');total+=bytes.length;if(total>LIMITS.totalBytes)throw Error('Project exceeds 50 MiB');
   file=await inspect(bytes,entry.name);
   if(entry.sha256&&entry.sha256!==file.sha256)throw Error(`Source hash mismatch: ${entry.name}`);
  }else{
   if(entry.status!=='rejected'||typeof entry.name!=='string'||!entry.name||entry.name.length>1024||typeof entry.reason!=='string')throw Error('Missing source image');
   file={name:entry.name,bytes:Number(entry.bytes)||0,sha256:entry.sha256??null,status:'rejected',reason:entry.reason.slice(0,1000),evidence:'Import-time rejection; original bytes not retained'};
  }
  files.push({...file,id:`S${String(index+1).padStart(4,'0')}`});
 }
 const ready=new Set(files.filter(f=>f.status==='ready').map(f=>f.id));
 if(new Set(project.order).size!==project.order.length||project.order.some(id=>!ready.has(id)))throw Error('Order contains duplicate or unavailable images');
 return {version:1,files,order:project.order,settings:settings(project.settings)};
}
export function portable(project){return {...project,files:project.files.map(({preview,...file})=>file)};}
function printable(text){return Array.from(text).map(c=>{const cp=c.codePointAt(0);return cp>=32&&cp<=126?c:`[U+${cp.toString(16).toUpperCase().padStart(4,'0')}]`;}).join('');}
function labelLines(doc,text,width){
 const lines=[];let line='';
 for(const c of text){if(doc.widthOfString(line+c)>width&&line){lines.push(line);line='';}line+=c;}
 if(line)lines.push(line);
 if(lines.length>3){lines.length=3;let tail=lines[2];while(doc.widthOfString(tail+'...')>width)tail=tail.slice(0,-1);lines[2]=tail+'...';}
 return lines;
}
export async function exportPDF(project){
 const {paper,columns,rows,labels}=settings(project.settings);
 if(!project.order.length)throw Error('Select at least one image');
 const doc=new PDFDocument({size:paper==='Letter'?'LETTER':'A4',margin:0,autoFirstPage:false,info:{Title:'Contact Sheet Desk',Author:'Contact Sheet Desk'}});
 const chunks=[];const done=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const [pw,ph]=paper==='Letter'?[612,792]:[595.28,841.89];
 const margin=30,gap=10,top=55,bottom=35,cw=(pw-2*margin-(columns-1)*gap)/columns,ch=(ph-top-bottom-(rows-1)*gap)/rows;
 const byId=new Map(project.files.map(f=>[f.id,f]));
 const manifest={version:1,paper,pageSize:[pw,ph],columns,rows,labelMode:labels,coordinateSystem:'PDF points from top left',pages:Math.ceil(project.order.length/(columns*rows)),selected:[],inputs:project.files.map(f=>({id:f.id,name:f.name,sha256:f.sha256,bytes:f.bytes,status:f.status==='rejected'?'rejected':project.order.includes(f.id)?'included':'excluded',reason:f.status==='rejected'?f.reason:project.order.includes(f.id)?'Selected by user':'Not selected by user'}))};
 for(const [index,id] of project.order.entries()){
  const f=byId.get(id);if(!f||f.status!=='ready')throw Error('Unavailable selected image');
  const cell=index%(columns*rows),page=Math.floor(index/(columns*rows))+1;
  if(cell===0){doc.addPage();doc.font(font).fontSize(15).fillColor('#182b2d').text('Contact Sheet Desk',margin,23,{lineBreak:false});doc.fontSize(8).text(`${paper} · ${columns} × ${rows} · Page ${page} / ${manifest.pages}`,pw-230,28,{width:200,align:'right',lineBreak:false});}
  const x=margin+(cell%columns)*(cw+gap),y=top+Math.floor(cell/columns)*(ch+gap),imageBox={x:x+5,y:y+5,width:cw-10,height:ch-61};
  doc.lineWidth(.5).strokeColor('#cdd4d3').rect(x,y,cw,ch).stroke();
  const scale=Math.min(imageBox.width/f.width,imageBox.height/f.height),w=f.width*scale,h=f.height*scale;
  const bounds={x:imageBox.x+(imageBox.width-w)/2,y:imageBox.y+(imageBox.height-h)/2,width:w,height:h};
  doc.image(Buffer.from(f.preview.split(',')[1],'base64'),bounds.x,bounds.y,{width:w,height:h});
  doc.font(font).fontSize(8).fillColor('#182b2d');
  const displayName=labels==='path'?f.name:f.name.split(/[\\/]/).pop();
  const lines=labelLines(doc,printable(displayName),cw-10);
  const labelY=y+ch-48;
  lines.forEach((line,i)=>doc.text(line,x+5,labelY+i*10,{lineBreak:false}));
  const identity=`${id} | ${f.sha256.slice(0,10)}`;
  doc.fontSize(7).fillColor('#42615e').text(identity,x+5,y+ch-13,{lineBreak:false});
  manifest.selected.push({id,name:f.name,sha256:f.sha256,page,cell:cell+1,order:index+1,width:f.width,height:f.height,exifOrientation:f.exifOrientation,imageBounds:bounds,cellBounds:{x,y,width:cw,height:ch},labelLines:lines,labelBounds:{x:x+5,y:labelY,width:cw-10,height:30},identity});
 }
 doc.end();return {pdf:await done,manifest};
}
