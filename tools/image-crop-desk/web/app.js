'use strict';
const $=id=>document.getElementById(id), KEY='crop-desk-v1';
let project={version:1,sources:[]}, attached=new Map(), sourceIndex=0,cropIndex=0,deleted=[],urls=[];
const source=()=>project.sources[sourceIndex], crop=()=>source()?.crops[cropIndex];
const message=(text,error=false)=>{$('status').textContent=text;$('status').className=error?'error':''};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(project))}catch(e){message('Storage unavailable. Save a project file before closing.',true)}}
function validateProject(p){
 if(p?.version!==1||!Array.isArray(p.sources)||p.sources.length>30)throw Error('Invalid project or more than 30 sources');
 const hashes=new Set();
 for(const s of p.sources){if(!/^[a-f0-9]{64}$/.test(s.hash)||hashes.has(s.hash)||typeof s.name!=='string'||s.name.length>200||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||s.width*s.height>20000000||!Array.isArray(s.crops)||s.crops.length>100)throw Error('Invalid source');hashes.add(s.hash);for(const c of s.crops){if(typeof c.name!=='string'||c.name.length>100||!['free','1:1','4:5','3:2','16:9'].includes(c.aspect)||!validRect(c.rect,s)||!ratioValid(c.rect,c.aspect))throw Error('Invalid crop in project')}}
 for(const s of p.sources){const a=attached.get(s.hash);if(a&&(a.img.naturalWidth!==s.width||a.img.naturalHeight!==s.height))throw Error('Saved dimensions do not match attached source')}
 return p;
}
function validRect(r,s=source()){return Array.isArray(r)&&r.length===4&&r.every(Number.isInteger)&&r[0]>=0&&r[1]>=0&&r[2]>r[0]&&r[3]>r[1]&&r[2]<=s.width&&r[3]<=s.height}
function ratioValid(r,aspect){if(aspect==='free')return true;const [a,b]=aspect.split(':').map(Number);return (r[2]-r[0])*b===(r[3]-r[1])*a}
async function api(payload){const res=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const v=await res.json();if(!res.ok)throw Error(v.error||'Processing failed');return v}
function b64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file)})}
async function importFile(file){
 if(file.size>10*1024*1024)throw Error('Maximum file size: 10 MiB');
 const data=await b64(file), info=await api({action:'inspect',data});
 let s=project.sources.find(s=>s.hash===info.hash);
 if(!s){if(project.sources.length>=30)throw Error('Maximum 30 sources');s={hash:info.hash,name:file.name.slice(0,200),width:info.width,height:info.height,crops:[]};project.sources.push(s)}
 if(s.width!==info.width||s.height!==info.height)throw Error('Saved dimensions do not match source');
 const img=new Image();img.src='data:image/png;base64,'+info.preview;await img.decode();
 attached.set(s.hash,{data,img});sourceIndex=project.sources.indexOf(s);cropIndex=0;persist();render();message('Attached '+s.name+' · source hash verified');
}
function newCrop(){const s=source();if(!s||!attached.has(s.hash))return message('Reattach this source first.',true);if(s.crops.length>=100)return message('Maximum 100 crops per source.',true);s.crops.push({name:'Composition '+(s.crops.length+1),aspect:'free',rect:[0,0,s.width,s.height]});cropIndex=s.crops.length-1;persist();render()}
function button(text,active,fn){const b=document.createElement('button');b.textContent=text;b.className=active?'active':'';b.onclick=fn;return b}
function render(){
 $('sources').replaceChildren();project.sources.forEach((s,i)=>{const b=button(s.name,i===sourceIndex,()=>{sourceIndex=i;cropIndex=0;render()});const small=document.createElement('small');small.textContent=attached.has(s.hash)?`${s.width} × ${s.height} · attached`:'Reattach matching original';b.append(small);$('sources').append(b)});
 $('crops').replaceChildren();source()?.crops.forEach((c,i)=>$('crops').append(button(c.name,i===cropIndex,()=>{cropIndex=i;render()})));
 $('undo').disabled=!deleted.length;
 const s=source(),a=s&&attached.get(s.hash),c=crop();
 $('empty').hidden=!!a;$('photo').style.display=a?'block':'none';$('selection').hidden=!a||!c;
 $('sourceInfo').textContent=s?`${s.name} / ${s.width} × ${s.height}`:'Your photograph goes here';
 if(a){$('photo').src=a.img.src;const fit=Math.min(1,Math.max(100,$('viewport').clientWidth-40)/s.width,415/s.height),scale=fit*Number($('zoom').value)/100;$('stage').style.width=s.width*scale+'px';$('stage').style.height=s.height*scale+'px'}else{$('stage').style.width='0';$('stage').style.height='0'}
 for(const id of ['name','aspect','left','top','right','bottom','apply','delete'])$(id).disabled=!c;
 $('add').disabled=!a;
 if(c){$('name').value=c.name;$('aspect').value=c.aspect;['left','top','right','bottom'].forEach((id,i)=>$(id).value=c.rect[i]);draw()}else{$('preview').width=1;$('preview').height=1;$('dimensions').textContent='No composition selected'}
}
function draw(){const s=source(),c=crop(),a=attached.get(s.hash);if(!a||!c){$('preview').width=1;$('preview').height=1;$('dimensions').textContent='Reattach the matching original to preview';return;}const [l,t,r,b]=c.rect;Object.assign($('selection').style,{left:l/s.width*100+'%',top:t/s.height*100+'%',width:(r-l)/s.width*100+'%',height:(b-t)/s.height*100+'%'});const cv=$('preview'),scale=Math.min(1,420/(r-l),380/(b-t));cv.width=Math.max(1,Math.round((r-l)*scale));cv.height=Math.max(1,Math.round((b-t)*scale));cv.getContext('2d').drawImage(a.img,l,t,r-l,b-t,0,0,cv.width,cv.height);$('dimensions').textContent=`${r-l} × ${b-t} px · native-resolution PNG`;}
$('files').onchange=async e=>{for(const f of e.target.files){try{await importFile(f)}catch(e){message(e.message,true)}}e.target.value=''};
$('demo').onclick=async()=>{try{message('Opening licensed photographs…');const rows=await(await fetch('/demo/sources.json')).json();for(const row of rows){const blob=await(await fetch('/demo/photos/'+row.file)).blob();await importFile(new File([blob],row.file));if(!source().crops.length){newCrop();$('aspect').value='4:5';$('aspect').dispatchEvent(new Event('change'));crop().name='Portrait';newCrop();$('aspect').value='3:2';$('aspect').dispatchEvent(new Event('change'));crop().name='Landscape';persist()}}sourceIndex=0;cropIndex=0;render();message('Six licensed photographs ready. Select a composition to edit.')}catch(e){message(e.message,true)}};
$('add').onclick=newCrop;
$('name').onchange=()=>{if(crop()){crop().name=$('name').value;persist();render()}};
$('apply').onclick=()=>{const c=crop();if(!c)return;const r=['left','top','right','bottom'].map(id=>$(id).value.trim()===''?NaN:Number($(id).value));if(!validRect(r)||!ratioValid(r,c.aspect))return message('Invalid bounds or aspect ratio. Selection unchanged.',true);c.rect=r;persist();render();message('Coordinates applied.')};
$('aspect').onchange=()=>{const c=crop(),s=source();if(!c)return;const aspect=$('aspect').value;if(aspect!=='free'){const [a,b]=aspect.split(':').map(Number),[l,t,r,bt]=c.rect,k=Math.floor(Math.min((r-l)/a,(bt-t)/b));if(k<1){$('aspect').value=c.aspect;return message('Selection is too small for this exact ratio.',true)}c.rect=[l,t,l+k*a,t+k*b]}c.aspect=aspect;persist();render()};
$('delete').onclick=()=>{if(crop()){deleted.push({hash:source().hash,index:cropIndex,crop:source().crops.splice(cropIndex,1)[0]});cropIndex=Math.max(0,cropIndex-1);persist();render()}};
$('undo').onclick=()=>{const d=deleted.at(-1),s=d&&project.sources.find(s=>s.hash===d.hash);if(!s)return;if(s.crops.length>=100)return message('Delete a crop before restoring this one.',true);deleted.pop();s.crops.splice(d.index,0,d.crop);sourceIndex=project.sources.indexOf(s);cropIndex=d.index;persist();render()};
$('zoom').oninput=()=>{$('zoomLabel').textContent=$('zoom').value+'%';render()};window.addEventListener('resize',render);
let drag=null;
$('selection').onpointerdown=e=>{e.preventDefault();const bounds=$('stage').getBoundingClientRect();drag={x:e.clientX,y:e.clientY,rect:[...crop().rect],handle:e.target.dataset.handle,scale:source().width/bounds.width};$('selection').setPointerCapture(e.pointerId)};
$('selection').onpointermove=e=>{if(!drag)return;const s=source(),c=crop(),[l,t,r,b]=drag.rect,dx=Math.round((e.clientX-drag.x)*drag.scale),dy=Math.round((e.clientY-drag.y)*drag.scale);let box;if(!drag.handle){const x=Math.max(0,Math.min(s.width-(r-l),l+dx)),y=Math.max(0,Math.min(s.height-(b-t),t+dy));box=[x,y,x+r-l,y+b-t]}else{const west=drag.handle.includes('w'),north=drag.handle.includes('n'),ax=west?r:l,ay=north?b:t;let w=Math.max(1,Math.min(west?ax:s.width-ax,(r-l)+(west?-dx:dx))),h=Math.max(1,Math.min(north?ay:s.height-ay,(b-t)+(north?-dy:dy)));if(c.aspect!=='free'){const [a,bb]=c.aspect.split(':').map(Number);const k=Math.max(1,Math.min(Math.round(w/a),Math.floor((west?ax:s.width-ax)/a),Math.floor((north?ay:s.height-ay)/bb)));w=k*a;h=k*bb}box=[west?ax-w:ax,north?ay-h:ay,west?ax:ax+w,north?ay:ay+h]};if(validRect(box)&&ratioValid(box,c.aspect)){c.rect=box;['left','top','right','bottom'].forEach((id,i)=>$(id).value=box[i]);draw()}};
$('selection').onpointerup=()=>{if(drag){drag=null;persist()}};$('selection').onpointercancel=()=>{drag=null;persist()};
function download(data,name,type,parent){const url=URL.createObjectURL(new Blob([data],{type}));urls.push(url);const a=document.createElement('a');a.href=url;a.download=name;a.textContent=name;if(parent)parent.append(a);else{a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}return a}
$('saveProject').onclick=()=>download(JSON.stringify(project,null,2),'crop-desk-project.json','application/json');
$('projectFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>1024*1024)throw Error('Project exceeds 1 MiB');const p=validateProject(JSON.parse(await f.text()));project=p;deleted=[];sourceIndex=0;cropIndex=0;persist();render();message('Project opened. Reattach originals; only exact SHA-256 matches restore selections.')}catch(e){message(e.message,true)}e.target.value=''};
$('export').onclick=async()=>{
 const snapshot=structuredClone(project);$('export').disabled=true;$('outputs').hidden=false;$('batchStatus').textContent='Export in progress…';$('downloads').replaceChildren();urls.forEach(URL.revokeObjectURL);urls=[];
 const manifest={version:1,complete:false,sources:[],requested:snapshot.sources.reduce((n,s)=>n+s.crops.length,0),exported:0,failed:0};
 for(const s of snapshot.sources){if(!s.crops.length)continue;let result;try{const a=attached.get(s.hash);if(!a)throw Error('Original not attached; exact hash required');result=await api({action:'export',data:a.data,hash:s.hash,crops:s.crops})}catch(e){result={source_hash:s.hash,dimensions:[s.width,s.height],complete:false,results:s.crops.map((c,index)=>({index,name:c.name,rect:c.rect,status:'failed',error:e.message}))}}
 for(const r of result.results){if(r.status==='exported'){const bytes=Uint8Array.from(atob(r.data),x=>x.charCodeAt(0));const a=download(bytes,r.file,'image/png',$('downloads'));const img=document.createElement('img');img.src=a.href;img.alt=r.name;a.prepend(img);delete r.data;manifest.exported++}else{manifest.failed++;const p=document.createElement('p');p.className='error';p.textContent=r.name+': '+r.error;$('downloads').append(p)}}manifest.sources.push(result)}
 manifest.complete=manifest.requested>0&&manifest.failed===0&&manifest.exported===manifest.requested;download(JSON.stringify(manifest,null,2),'manifest.json','application/json',$('downloads'));$('batchStatus').textContent=`${manifest.complete?'Complete':'INCOMPLETE'} · ${manifest.exported} / ${manifest.requested} exported · ${manifest.failed} failed`;$('batchStatus').className=manifest.complete?'':'error';$('export').disabled=false;message(manifest.complete?'Export ready. Download PNGs and manifest below.':'Export incomplete. See individual failures below.',!manifest.complete);
};
try{const saved=localStorage.getItem(KEY);if(saved)project=validateProject(JSON.parse(saved))}catch(e){message('Saved project could not be read: '+e.message,true)}render();
