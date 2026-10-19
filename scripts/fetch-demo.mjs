import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../demo/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`${r.status} ${url}`);return Buffer.from(await r.arrayBuffer());}
await mkdir(new URL('images/',root),{recursive:true});
let manifest;
try{manifest=JSON.parse(await readFile(new URL('provenance.json',root)));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!manifest){
 manifest={retrieved_at:new Date().toISOString(),license:'CC0',license_url:'https://www.metmuseum.org/about-the-met/policies-and-documents/open-access',api_docs:'https://metmuseum.github.io/',images:[]};
 for(let id=436500;id<436600&&manifest.images.length<24;id++){
  const metadata_url=`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
  let record;try{record=JSON.parse(await get(metadata_url));}catch(e){if(e.message.startsWith('404 '))continue;throw e;}
  if(!record.isPublicDomain||!record.primaryImageSmall)continue;
  manifest.images.push({filename:`${id}.jpg`,url:record.primaryImageSmall,metadata_url,record_url:record.objectURL,record});
  await new Promise(r=>setTimeout(r,250));
 }
 if(manifest.images.length!==24)throw Error('Need 24 public-domain images');
 await writeFile(new URL('provenance.json',root),JSON.stringify(manifest,null,2)+'\n');
}
for(const entry of manifest.images){
 const path=new URL(`images/${entry.filename}`,root);let bytes;
 try{bytes=await readFile(path);}catch{bytes=await get(entry.url);if(bytes.length>10*1024*1024)throw Error('Image exceeds 10 MiB');await writeFile(path,bytes);await new Promise(r=>setTimeout(r,300));}
 const hash=sha(bytes);if(entry.sha256&&entry.sha256!==hash)throw Error(`Upstream image changed: ${entry.filename}`);
 entry.sha256=hash;entry.bytes=bytes.length;console.log(entry.filename,bytes.length);
}
await writeFile(new URL('provenance.json',root),JSON.stringify(manifest,null,2)+'\n');
