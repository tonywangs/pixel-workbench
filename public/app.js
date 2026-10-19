'use strict';
const $=id=>document.getElementById(id), key='image-desk-project-v1';
let project={schema:1,settings:{widths:[160,320,480,960],quality:78},images:[],active:null}, busy=false, previewURL=null;
const bytes=n=>`${(n/1024).toFixed(1)} KiB`;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function api(url,options){const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw Error(result.error || response.statusText);return result;}
const post=(url,data)=>api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function save(){try{localStorage.setItem(key,JSON.stringify(project));}catch{status('Browser storage is unavailable. Save project to a JSON file before closing.',true);}}
function validate(p){
 if(p.schema!==1||!p.settings||!Array.isArray(p.settings.widths)||!p.settings.widths.length||p.settings.widths.length>6||p.settings.widths.some(w=>!Number.isInteger(w)||w<1||w>4096)||!Number.isInteger(p.settings.quality)||p.settings.quality<1||p.settings.quality>100||!Array.isArray(p.images)||p.images.length>40)throw Error('Invalid project settings or source list.');
 if(p.images.some(i=>!i||!/^[a-f0-9]{64}$/.test(i.sha256)||typeof i.name!=='string'||typeof i.selected!=='boolean')||new Set(p.images.map(i=>i.sha256)).size!==p.images.length)throw Error('Invalid or duplicate source hashes in project.');
 return {schema:1,settings:{widths:[...new Set(p.settings.widths)].sort((a,b)=>a-b),quality:p.settings.quality},images:p.images.map(i=>({...i,connected:false})),active:p.images.some(i=>i.sha256===p.active)?p.active:p.images[0]?.sha256 || null};
}
function selected(){return project.images.filter(i=>i.selected);}
function active(){return project.images.find(i=>i.sha256===project.active);}
function invalidate(){previewURL=null;$('output').removeAttribute('src');$('output').hidden=true;$('output-meta').textContent='Settings or source changed. Generate preview.';$('export-result').hidden=true;}
function render(){
 $('count').textContent=project.images.length;$('list').replaceChildren();
 for(const item of project.images){
  const row=document.createElement('div');row.className='image-row'+(project.active===item.sha256?' active':'');
  const cb=document.createElement('input');cb.type='checkbox';cb.checked=item.selected;cb.setAttribute('aria-label',`Export ${item.name}`);cb.onchange=()=>{item.selected=cb.checked;save();};
  const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-label',`Inspect ${item.name}`);
  if(item.connected){const img=document.createElement('img');img.src='/api/original/'+item.sha256;img.alt='';btn.append(img);}
  const text=document.createElement('span'),name=document.createElement('strong'),meta=document.createElement('small');name.textContent=item.name;meta.textContent=item.connected?`${item.width} × ${item.height} · ${bytes(item.bytes)}`:'Missing · reconnect original';text.append(name,meta);btn.append(text);
  btn.onclick=()=>{project.active=item.sha256;invalidate();save();render();};row.append(cb,btn);$('list').append(row);
 }
 const item=active();$('empty').hidden=!!item;$('comparison').hidden=!item;$('image-name').textContent=item?.name || 'Your comparison desk';
 if(item){if(item.connected)$('original').src='/api/original/'+item.sha256;else $('original').removeAttribute('src');$('original-meta').textContent=item.connected?`${item.width} × ${item.height} · ${bytes(item.bytes)} · EXIF ${item.orientation}`:'Reconnect the exact original to inspect or export.';$('provenance').textContent=item.provenance?`${item.provenance.title} · ${item.provenance.creator} · ${item.provenance.license}`:'Local source · rights and attribution not supplied.';}
 $('widths').value=project.settings.widths.join(', ');$('quality').value=project.settings.quality;$('quality-value').value=project.settings.quality;
 const prior=$('preview-width').value;$('preview-width').replaceChildren();for(const width of project.settings.widths){const opt=new Option(width+' px',width);$('preview-width').add(opt);}if(project.settings.widths.includes(+prior))$('preview-width').value=prior;
}
async function run(task){if(busy)return;busy=true;document.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);try{await task();}catch(e){status(e.message,true);}finally{busy=false;document.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);}}
function readSettings(){const widths=$('widths').value.split(',').map(s=>s.trim()).map(s=>s?Number(s):NaN),quality=+$('quality').value;const next=validate({...project,settings:{widths,quality}});const changed=JSON.stringify(project.settings)!==JSON.stringify(next.settings);project.settings=next.settings;save();if(changed)invalidate();render();}
$('widths').onchange=()=>{try{readSettings();status('Settings saved. Generate a new preview to inspect this recipe.');}catch(e){status(e.message,true);}};
$('quality').oninput=()=>{$('quality-value').value=$('quality').value;};$('quality').onchange=()=>{try{readSettings();}catch(e){status(e.message,true);}};
async function importFiles(files){let accepted=0,failures=[];for(const file of files){status(`Importing ${file.name}…`);try{
 const form=new FormData();form.append('file',file);const item=await api('/api/import',{method:'POST',body:form});const existing=project.images.find(i=>i.sha256===item.sha256);
 if(existing){Object.assign(existing,item,{name:existing.name,connected:true});}else{if(project.images.length>=40)throw Error('Project limit is 40 sources.');project.images.push({...item,selected:true,connected:true});}
 project.active ||= item.sha256;accepted++;
 }catch(e){failures.push(`${file.name}: ${e.message}`);}}
 save();invalidate();render();status(`${accepted} imported or hash-matched. ${failures.length} rejected.${failures.length?' '+failures.join(' | '):''} Originals are unchanged.`,failures.length>0);
}
$('files').onchange=()=>run(async()=>{await importFiles([...$('files').files]);$('files').value='';});
$('drop').ondragover=e=>e.preventDefault();$('drop').ondrop=e=>{e.preventDefault();run(()=>importFiles([...e.dataTransfer.files]));};
$('demo').onclick=()=>run(async()=>{const sources=await api('/api/demo');const files=[];for(const src of sources){const r=await fetch('/demo/'+src.path);if(!r.ok)throw Error('Demo source unavailable.');files.push(new File([await r.blob()],src.name,{type:'image/jpeg'}));}await importFiles(files);});
$('all').onclick=()=>{project.images.forEach(i=>i.selected=true);save();render();};$('none').onclick=()=>{project.images.forEach(i=>i.selected=false);save();render();};
$('zoom').onchange=()=>$('comparison').classList.toggle('zoom',$('zoom').checked);
$('preview').onclick=()=>run(async()=>{readSettings();const item=active();if(!item?.connected)throw Error('Import or reconnect an original first.');status('Encoding WebP preview…');const result=await post('/api/preview',{sha256:item.sha256,width:+$('preview-width').value,quality:project.settings.quality});previewURL=result.url;$('output').src=previewURL;$('output').hidden=false;const delta=(result.bytes/item.bytes-1)*100;$('output-meta').textContent=`${result.width} × ${result.height} · ${bytes(result.bytes)} · ${Math.abs(delta).toFixed(1)}% ${delta>0?'larger':'smaller'} than source`;status('Preview ready. Inspect the image before choosing a quality setting.');});
function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('save').onclick=()=>{try{readSettings();download('image-desk-project.json',new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));status('Project saved. Keep original files separately; reconnect requires their exact SHA-256 hashes.');}catch(e){status(e.message,true);}};
async function reconnect(){for(const item of project.images){try{const live=await api('/api/sources/'+item.sha256);if(live.sha256!==item.sha256)throw Error('Source hash mismatch');Object.assign(item,live,{name:item.name,connected:true});}catch{item.connected=false;}}save();render();const missing=project.images.filter(i=>!i.connected).length;if(missing)status(`${missing} missing originals. Import the exact files to reconnect by SHA-256. Different bytes are added separately and cannot replace a missing source.`,true);}
$('open').onchange=()=>run(async()=>{const file=$('open').files[0];if(!file)return;if(file.size>256*1024)throw Error('Project JSON limit is 256 KiB.');project=validate(JSON.parse(await file.text()));invalidate();await reconnect();status(`Project opened: ${project.images.filter(i=>i.connected).length} connected; ${project.images.filter(i=>!i.connected).length} missing. Reimport exact originals to reconnect missing hashes.`);$('open').value='';});
$('export').onclick=()=>run(async()=>{readSettings();const entries=selected();if(!entries.length)throw Error('Select at least one image.');if(entries.some(i=>!i.connected))throw Error('Reconnect all selected originals before export, or deselect missing images.');status(`Exporting ${entries.length} images…`);const result=await post('/api/export',{entries,settings:project.settings});const box=$('export-result');box.replaceChildren();box.hidden=false;const p=document.createElement('p'),c=result.manifest.counts;p.textContent=`${c.exported} variants exported · ${c.skipped} skipped · ${c.failed} failed · ${bytes(result.manifest.outputBytes)} total`;box.append(p);for(const [label,url] of [['Download package.zip',result.download],['Open local specimen ↗',result.url],['Inspect manifest',`/packages/${result.id}/manifest.json`]]){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';box.append(a);}status(`Export finished. ${c.skipped} skipped and ${c.failed} failed variants are explained in the manifest.`,c.failed>0);});
$('reset').onclick=()=>{project={schema:1,settings:{widths:[160,320,480,960],quality:78},images:[],active:null};save();invalidate();render();status('Project cleared. Server copies remain in .work; original files are unchanged.');};
try{const stored=localStorage.getItem(key);if(stored)project=validate(JSON.parse(stored));}catch(e){status('Saved project could not be read: '+e.message,true);}render();run(reconnect);
