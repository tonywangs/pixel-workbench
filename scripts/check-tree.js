const {execFileSync}=require('node:child_process'),fs=require('node:fs');
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean))];let total=0;
for(const file of files){if(!fs.existsSync(file))continue;const n=fs.statSync(file).size;if(n>10*1024*1024)throw Error(`File exceeds 10 MiB: ${file}`);total+=n;if(file.endsWith('.log')&&file!=='results/tests.log')throw Error(`Disallowed log: ${file}`);}
if(files.length>1000||total>32*1024*1024)throw Error('Tree exceeds publication budget');console.log(`${files.length} files, ${total} bytes; per-file and tree publication budgets satisfied.`);
