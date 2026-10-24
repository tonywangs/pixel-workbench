import {zipSync} from 'fflate';
import {render,RENDERER} from './render.js';
import {sha256,POLICY,LIMITS,inspect} from './policy.js';
export function sourceData(source){if(typeof source?.name!=='string'||source.name.length>240||typeof source?.data!=='string'||source.data.length>350000)throw Error('Invalid source envelope');const bytes=Buffer.from(source.data,'base64');if(bytes.length>LIMITS.inputBytes)throw Error('Input exceeds 256 KiB');return bytes}
export async function batch(sources,widths,bg){
 if(!Array.isArray(sources)||!sources.length||sources.length>LIMITS.sources||!Array.isArray(widths)||!widths.length||sources.length*widths.length>LIMITS.variants)throw Error('Batch requires 1–24 sources and at most 48 variants');
 const files={},manifest={schema:1,policy:POLICY,renderer:RENDERER,created:new Date().toISOString(),status:'complete',sources:[],variants:[]};
 for(const [index,source] of sources.entries()){
  let bytes,info,error;try{bytes=sourceData(source);info=inspect(bytes)}catch(e){error=e.message}
  const hash=bytes?sha256(bytes):null;const stem=String(source?.name||'artwork').replace(/\.svg$/i,'').replace(/[^a-z0-9_-]/gi,'_').slice(0,64)||'artwork';const id=`${index+1}-${stem}-${hash?.slice(0,12)||'invalid'}`;
  const original=bytes?`originals/${id}.svg`:null;if(bytes)files[original]=bytes;
  manifest.sources.push({id,name:source?.name,sha256:hash,original,width:info?.width,height:info?.height});
  for(const [variantIndex,width] of widths.entries()){
   const record={sourceId:id,sourceSha256:hash,requestedWidth:width,background:bg,status:'failed'};
   try{if(error)throw Error(error);const out=await render(bytes,width,bg);const file=`png/${id}-${variantIndex+1}-${out.width}x${out.height}.png`;files[file]=out.png;Object.assign(record,{status:'exported',file,width:out.width,height:out.height,sha256:sha256(out.png)})}catch(e){record.reason=e.message}
   manifest.variants.push(record);
  }
 }
 if(manifest.variants.some(v=>v.status!=='exported'))manifest.status=manifest.variants.some(v=>v.status==='exported')?'partial':'failed';
 files['manifest.json']=Buffer.from(JSON.stringify(manifest,null,2)+'\n');return {manifest,zip:zipSync(files,{level:6})};
}
