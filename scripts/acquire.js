// Re-download frozen originals, verifying hashes BEFORE replacing local fixtures.
import {readFile,writeFile} from 'node:fs/promises';
import {hash} from '../engine.js';
import {setTimeout as delay} from 'node:timers/promises';
const manifest=JSON.parse(await readFile(new URL('../demo/manifest.json',import.meta.url)));
for(const row of manifest.files.filter(f=>f.kind==='real')){
 let response;
 for(let attempt=0;attempt<4;attempt++){
  response=await fetch(row.url,{headers:{'User-Agent':'PhotoReviewResearch/1.0'},signal:AbortSignal.timeout(30000)});
  if(![429,503].includes(response.status)||attempt===3)break;
  const retry=Number(response.headers.get('retry-after'));
  const seconds=Math.min(45,Math.max(3*(attempt+1),Number.isFinite(retry)?retry:0));
  console.log(`${row.file}: HTTP ${response.status}; retrying in ${seconds}s`);
  await response.body?.cancel();await delay(seconds*1000);
 }
 if(!response.ok)throw Error(`${row.file}: HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(hash(bytes)!==row.sha256)throw Error(`${row.file}: source changed; expected ${row.sha256}`);
 await writeFile(new URL('../demo/images/'+row.file,import.meta.url),bytes);
 console.log('Verified acquisition:',row.file);
 await delay(1000);
}
await import('./controls.js');
