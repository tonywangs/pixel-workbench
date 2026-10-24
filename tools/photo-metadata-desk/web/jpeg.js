// Policy v1: allowlisted JPEG structure, fresh minimal EXIF, no pixel re-encoding.
export const LIMIT = 20 * 1024 * 1024;
const ascii = b => new TextDecoder('latin1').decode(b);
const starts = (b,s) => s.split('').every((c,i)=>b[i]===c.charCodeAt(0));
export function join(parts) { const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let o=0; for(const p of parts){b.set(p,o);o+=p.length;} return b; }
export function segment(marker,p) {return join([Uint8Array.of(255,marker,(p.length+2)>>8,(p.length+2)&255),p]);}
export function exif(orientation=1,color=1,position=1) {
  // TIFF offsets are relative to II; only three rendering fields and one pointer.
  const t=new Uint8Array(68),v=new DataView(t.buffer); t.set([73,73,42,0,8,0,0,0]);v.setUint16(8,3,true);
  [[0x112,3,orientation],[0x213,3,position],[0x8769,4,50]].forEach(([tag,type,val],i)=>{let o=10+i*12;v.setUint16(o,tag,true);v.setUint16(o+2,type,true);v.setUint32(o+4,1,true);v.setUint32(o+8,val,true);});
  v.setUint16(50,1,true);v.setUint16(52,0xa001,true);v.setUint16(54,3,true);v.setUint32(56,1,true);v.setUint16(60,color,true);
  return segment(225,join([Uint8Array.of(69,120,105,102,0,0),t]));
}
function rendering(p) {
  const t=p.subarray(6),v=new DataView(t.buffer,t.byteOffset,t.length);let le;
  const fail=()=>{throw Error('Malformed EXIF rendering fields');};
  if(t.length<8)fail(); if(t[0]===73&&t[1]===73)le=true;else if(t[0]===77&&t[1]===77)le=false;else fail();
  const u16=o=>{if(o<0||o+2>t.length)fail();return v.getUint16(o,le);};
  const u32=o=>{if(o<0||o+4>t.length)fail();return v.getUint32(o,le);};
  if(u16(2)!==42)fail();const out={orientation:[],color:[],position:[]};
  function ifd(off,root) {
    if(off<8)fail();const n=u16(off);if(n>4096||off+2+n*12+4>t.length)fail();
    for(let i=0;i<n;i++) {const o=off+2+i*12,tag=u16(o),type=u16(o+2),count=u32(o+4);
      let key=root?({274:'orientation',531:'position'})[tag]:tag===40961?'color':null;
      if(key){if(type!==3||count!==1)fail();out[key].push(u16(o+8));}
      if(root && [318,319,529,532,769].includes(tag))throw Error('Unsupported EXIF color calibration');
      if(root&&tag===34665){if(type!==4||count!==1)fail();ifd(u32(o+8),false);}
    }
  }
  ifd(u32(4),true);return out;
}
export function clean(input) {
  const b=input instanceof Uint8Array?input:new Uint8Array(input);
  if(b.length>LIMIT)throw Error('File exceeds 20 MiB');
  if(b[0]!==255||b[1]!==216)throw Error('Only JPEG files are supported');
  let i=2,frame=false,scans=0,ended=false;const kept=[],inventory=[],values={orientation:[],color:[],position:[]},icc=[],xmp=[];let jfif=0,adobe=0;
  while(i<b.length){const start=i;if(b[i++]!==255)throw Error('Invalid JPEG marker');while(b[i]===255)i++;const m=b[i++];
    if(m===217){if(!frame||!scans)throw Error('Missing image data');if(i!==b.length)throw Error('Trailing data or multiple images unsupported');kept.push(Uint8Array.of(255,217));ended=true;break;}
    if(i+2>b.length)throw Error('Truncated JPEG');const len=(b[i]<<8)|b[i+1];if(len<2||i+len>b.length)throw Error('Invalid JPEG segment length');const p=b.subarray(i+2,i+len);i+=len;const raw=b.subarray(start,i);
    let action='retain',kind='Structure';
    if(m>=224&&m<=239||m===254){
      if(scans)throw Error('Metadata between scans unsupported');
      if(m===225&&starts(p,'Exif\0\0')){kind='EXIF (personal fields, GPS, thumbnail)';action='replace';const r=rendering(p);for(const k of Object.keys(values))values[k].push(...r[k]);}
      else if(m===225&&(starts(p,'http://ns.adobe.com/xap/1.0/\0')||starts(p,'http://ns.adobe.com/xmp/extension/\0'))){kind='XMP';action='remove';xmp.push(ascii(p));}
      else if(m===237&&starts(p,'Photoshop 3.0\0')){kind='Photoshop / IPTC';action='remove';}
      else if(m===254){kind='Comment';action='remove';}
      else if(m===224&&starts(p,'JFXX\0')){kind='JFXX thumbnail';action='remove';}
      else if(m===224&&starts(p,'JFIF\0')){
        if(++jfif>1||p.length<14||p.length!==14+3*p[12]*p[13])throw Error('Malformed/duplicate JFIF');
        kind='JFIF density/version (thumbnail removed)';action='normalize';const q=p.slice(0,14);q[12]=q[13]=0;kept.push(segment(m,q));
      } else if(m===226&&starts(p,'ICC_PROFILE\0')){if(p.length<14)throw Error('Malformed ICC');kind='ICC profile (may identify device/author)';icc.push(p);kept.push(raw);}
      else if(m===238&&starts(p,'Adobe')){if(++adobe>1||p.length!==12||p[11]>2)throw Error('Unsupported Adobe color transform');kind='Adobe color transform';kept.push(raw);}
      else if(m===226&&starts(p,'MPF\0'))throw Error('APP2 MPF multi-picture JPEG unsupported; export refused');
      else throw Error(`Unrecognized metadata container APP${m-224}; export refused`);
    } else {
      if(![192,194,196,219,221,218].includes(m))throw Error(`Unsupported JPEG marker 0x${m.toString(16)}`);
      if(m===192||m===194){if(frame||p.length<6||p[0]!==8||![1,3].includes(p[5])||p.length!==6+3*p[5])throw Error('Only 8-bit grayscale/RGB baseline or progressive JPEG supported');const h=p[1]*256+p[2],w=p[3]*256+p[4];if(!w||!h||w*h>24000000)throw Error('Image exceeds 24 megapixels or has invalid dimensions');frame={width:w,height:h,progressive:m===194};}
      if(m===218){if(!frame||p.length<4||p.length!==1+2*p[0]+3)throw Error('Invalid scan header');scans++;}
      kept.push(raw);
      if(m===218){const a=i;while(i<b.length){if(b[i]!==255){i++;continue;}let j=i+1;while(b[j]===255)j++;if(b[j]===0||(b[j]>=208&&b[j]<=215)){i=j+1;continue;}break;}kept.push(b.subarray(a,i));}
    }
    inventory.push({marker:`0x${m.toString(16)}`,kind,bytes:raw.length,action});
  }
  if(!ended)throw Error('Missing JPEG end marker');
  for(const [key,vs] of Object.entries(values))if(new Set(vs).size>1)throw Error(`Conflicting duplicate ${key}`);
  const orientation=values.orientation[0]??1,color=values.color[0]??1,position=values.position[0]??1;
  if(orientation<1||orientation>8||![1,2].includes(position)||![1,65535].includes(color))throw Error('Unsupported EXIF rendering value');
  if(color===65535&&!icc.length)throw Error('Uncalibrated EXIF color without ICC profile unsupported');
  const warnings=xmp.some(s=>/tiff:Orientation/i.test(s))?['XMP orientation removed; retained EXIF orientation is authoritative. XMP-aware renderers are unverified.']:[];
  if(icc.length){const total=icc[0][13];if(total!==icc.length||!total||icc.some(p=>p[13]!==total)||new Set(icc.map(p=>p[12])).size!==total||icc.some(p=>p[12]<1||p[12]>total))throw Error('Incomplete/duplicate ICC profile');const profile=join([...icc].sort((a,b)=>a[12]-b[12]).map(p=>p.subarray(14)));if(profile.length<128||new DataView(profile.buffer).getUint32(0)!==profile.length||ascii(profile.subarray(36,40))!=='acsp')throw Error('Malformed ICC profile');}
  const output=join([Uint8Array.of(255,216),exif(orientation,color,position),...kept]);
  return {output,inventory,frame,orientation,color,position,warnings,icc:icc.length>0,policy:'jpeg-allowlist-v1'};
}
export async function hash(b){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Minimal ustar: generated neutral unique names, no source names or audit data.
export function archive(files){const parts=[];for(const [index,b] of files.entries()){const h=new Uint8Array(512);const put=(o,s)=>h.set(new TextEncoder().encode(s),o);put(0,`clean-${String(index+1).padStart(3,'0')}.jpg`);put(100,'0000644\0');put(108,'0000000\0');put(116,'0000000\0');put(124,b.length.toString(8).padStart(11,'0')+'\0');put(136,'00000000000\0');h.fill(32,148,156);h[156]=48;put(257,'ustar\0');put(263,'00');const sum=h.reduce((a,v)=>a+v,0);put(148,sum.toString(8).padStart(6,'0')+'\0 ');parts.push(h,b,new Uint8Array((512-b.length%512)%512));}parts.push(new Uint8Array(1024));return join(parts);}
