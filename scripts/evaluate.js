import {readFile,writeFile} from 'node:fs/promises';
import {analyze,hash,algorithm} from '../engine.js';
import {pairs} from '../public/model.js';
const read=p=>readFile(new URL('../'+p,import.meta.url));
const manifest=JSON.parse(await read('demo/manifest.json'));
const labels=JSON.parse(await read('demo/labels.json'));
const analyzed=new Map();
for(const [i,row] of manifest.files.entries()){
 const bytes=await read('demo/images/'+row.file);if(hash(bytes)!==row.sha256)throw Error('Source hash changed: '+row.file);
 analyzed.set(row.file,{id:'f'+(i+1),name:row.file,status:'processed',...await analyze(bytes)});
}
const result={algorithm,labelSetSHA256:hash(await read('demo/labels.json')),protocol:labels.protocol,real:{tp:0,fp:0,tn:0,fn:0},controls:{tp:0,fp:0,tn:0,fn:0},exactOnlyBaseline:{tp:0,fp:0,tn:0,fn:0},pairs:[]};
for(const label of labels.pairs){
 const p=pairs([analyzed.get(label.a),analyzed.get(label.b)])[0];const detected=p.type!=='noncandidate';
 const outcome=detected?(label.candidateExpected?'tp':'fp'):(label.candidateExpected?'fn':'tn');
 result[label.kind==='control'?'controls':'real'][outcome]++;
 const exact=['bytes','pixels'].includes(p.type);result.exactOnlyBaseline[exact?(label.candidateExpected?'tp':'fp'):(label.candidateExpected?'fn':'tn')]++;
 result.pairs.push({...label,type:p.type,distance:p.distance,outcome});
}
result.limitations=['Six real photographs, four from one event; not representative of personal libraries.','Agent visual labels are subjective and have no independent human agreement estimate.','Sharp is also used by direct-array tests: independent comparison logic, not an independent decoder.','Similarity scores are Hamming distances, never probabilities. False negatives are preserved.'];
await writeFile(new URL('../results/evaluation.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({real:result.real,controls:result.controls,exactOnlyBaseline:result.exactOnlyBaseline},null,2));
