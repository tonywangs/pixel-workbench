import {readdir,stat} from 'node:fs/promises';
const skip=new Set(['.git','.agents','.codex','node_modules','.venv','test-results','playwright-report']);
let count=0,total=0;
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(skip.has(entry.name))continue;const p=dir+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Unexpected symlink: '+p);if(entry.isDirectory()){await walk(p);continue;}const s=await stat(p);if(s.size>10*1024*1024)throw Error('File exceeds 10 MiB: '+p);if(p.endsWith('.log')&&p!=='./results/tests.log')throw Error('Unexpected log: '+p);count++;total+=s.size;}}
await walk('.');if(count>1000||total>32*1024*1024)throw Error('Publication size budget exceeded');console.log(JSON.stringify({files:count,bytes:total,withinLimits:true}));
