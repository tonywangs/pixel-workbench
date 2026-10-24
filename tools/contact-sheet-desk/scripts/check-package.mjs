import {execFileSync} from 'node:child_process';
import {stat,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const files=[...new Set(execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split('\0').filter(Boolean))];
let total=0,largest=0;
for(const file of files){const info=await stat(file);assert.ok(info.size<=10*1024*1024,`${file} exceeds 10 MiB`);assert.ok(!file.endsWith('.log')||file==='results/tests.log',`Unpublishable log: ${file}`);total+=info.size;largest=Math.max(largest,info.size);}
assert.ok(total<=32*1024*1024,'Tree exceeds 32 MiB');assert.ok(files.length<=1000,'Tree exceeds 1000 files');
for(const p of ['results/demo-A4.pdf','results/demo-Letter.pdf','results/workbench.png','demo/provenance.json'])assert.ok((await readFile(p)).length>0);
console.log(`PASS package: ${files.length} files, ${total} bytes total, ${largest} bytes largest; file/tree/log limits satisfied`);
