export const SCHEMA='photo-review/1';
export const key=(a,b)=>[a,b].sort().join(':');
export function pairs(files) {
 const out=[];const valid=files.filter(f=>f.status==='processed');
 for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++) {
  const a=valid[i],b=valid[j];const distance=[...a.dhash].filter((v,k)=>v!==b.dhash[k]).length;
  const type=a.sha256===b.sha256?'bytes':a.pixelHash===b.pixelHash?'pixels':distance<=8?'similar':'noncandidate';
  out.push({id:key(a.id,b.id),a:a.id,b:b.id,type,distance});
 }return out;
}
export function validate(p) {
 const bad=()=>{throw Error('Invalid or incompatible project file');};
 if(!p||p.schema!==SCHEMA||!Array.isArray(p.files)||p.files.length>40||!p.decisions||typeof p.decisions!=='object'||Array.isArray(p.decisions)||!p.algorithm||p.algorithm.version!==1)bad();
 const ids=new Set();
 for(const f of p.files){
  if(!f||typeof f.id!=='string'||!/^f[0-9]+$/.test(f.id)||ids.has(f.id)||typeof f.name!=='string'||f.name.length>1024||!['processed','rejected'].includes(f.status))bad();
  ids.add(f.id);
  if(f.status==='processed' && (!Number.isInteger(f.bytes)||f.bytes<1||f.bytes>8*1024*1024||!['jpeg','png','webp'].includes(f.format)||!/^[a-f0-9]{64}$/.test(f.sha256)||!/^[a-f0-9]{64}$/.test(f.pixelHash)||!/^[01]{64}$/.test(f.dhash)||!Number.isInteger(f.width)||!Number.isInteger(f.height)||f.width<1||f.height<1||f.width*f.height>20_000_000||typeof f.thumb!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(f.thumb)||f.thumb.length>500000))bad();
 }
 const allowed=new Set(pairs(p.files).map(x=>x.id));
 for(const [id,d] of Object.entries(p.decisions))if(!allowed.has(id)||!['keep-left','keep-right','keep-both','unresolved'].includes(d.choice)||typeof d.note!=='string'||d.note.length>2000||typeof d.at!=='string')bad();
 return p;
}
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function report(p) {
 const e=escapeHTML;
 const all=pairs(p.files);
 return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Photo review report</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem}img{max-width:40%;max-height:300px}section{border-top:1px solid #aaa;padding:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}td{padding:.5rem;border:1px solid #ccc}</style><h1>Photo review report</h1><p>Explicit pair decisions only. No source files were changed. Similarity is a candidate signal, not a probability or proof of redundancy. Thumbnails are previews, not originals.</p><h2>Inputs and source references</h2>'+p.files.map(f=>`<section><h3>${e(f.id)} · ${e(f.name)}</h3><p>${e(f.status)} · ${e(f.error||'')} · source: ${e(f.verification||'not checked in this session')}</p><pre>SHA-256: ${e(f.sha256||'unavailable')}\nDimensions: ${e(f.width)} × ${e(f.height)}\nProvenance: ${e(JSON.stringify(f.provenance||null))}</pre></section>`).join('')+'<h2>All pairwise evidence</h2>'+all.map(pair=>{const a=p.files.find(f=>f.id===pair.a),b=p.files.find(f=>f.id===pair.b),d=p.decisions[pair.id];return `<section><h3>${e(a.id+' '+a.name)} ↔ ${e(b.id+' '+b.name)}</h3><img alt="Left preview" src="${a.thumb}"><img alt="Right preview" src="${b.thumb}"><p>${e(pair.type)} · dHash distance ${pair.distance}/64</p><p>Decision: ${e(d?.choice||'unresolved')} · ${e(d?.note||'')} · ${e(d?.at||'')}</p></section>`;}).join('')+'<h2>Complete traceable manifest</h2><pre>'+e(JSON.stringify({...p,pairs:all},null,2))+'</pre>';
}
