import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const base=new URL('../fixtures/artwork/',import.meta.url);
const specs=[{name:'lucide',repo:'lucide-icons/lucide',dir:'icons',license:'LICENSE',names:['camera','heart','bike','sun','rocket','flower']},{name:'tabler',repo:'tabler/tabler-icons',dir:'icons/outline',license:'LICENSE',names:['camera','heart','bike','sun','rocket','flower']}];
let prior;try{prior=JSON.parse(await readFile(new URL('sources.json',base)))}catch{}
const get=async u=>{const r=await fetch(u);if(!r.ok)throw Error(`${r.status} ${u}`);return Buffer.from(await r.arrayBuffer())};
const records=[];
for(const s of specs){
 const revision=prior?.find(x=>x.collection===s.name)?.revision ?? JSON.parse((await get(`https://api.github.com/repos/${s.repo}/commits/HEAD`)).toString()).sha;
 await mkdir(new URL(`${s.name}/`,base),{recursive:true});
 const licenseUrl=`https://raw.githubusercontent.com/${s.repo}/${revision}/${s.license}`;
 const license=await get(licenseUrl);await writeFile(new URL(`${s.name}/LICENSE.txt`,base),license);
 for(const name of s.names){const url=`https://raw.githubusercontent.com/${s.repo}/${revision}/${s.dir}/${name}.svg`;const data=await get(url);const file=`${s.name}/${name}.svg`;await writeFile(new URL(file,base),data);records.push({collection:s.name,revision,url,file,sha256:hash(data),licenseUrl,licenseFile:`${s.name}/LICENSE.txt`,licenseSha256:hash(license)});}
}
await writeFile(new URL('sources.json',base),JSON.stringify(records,null,2)+'\n');console.log(`Acquired ${records.length} pinned source files and licenses`);
