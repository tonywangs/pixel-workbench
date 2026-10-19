import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {createHash} from 'node:crypto';
export const POLICY='static-shapes-v1';
export const LIMITS={inputBytes:262144,elements:2000,depth:32,attributeBytes:100000,width:4096,pixels:8388608,variants:48,sources:24,renderMs:5000};
export const sha256=b=>createHash('sha256').update(b).digest('hex');
const tags=new Set('svg g defs title desc path rect circle ellipse line polyline polygon clipPath linearGradient radialGradient stop'.split(' '));
const attrs=new Set('xmlns id class version viewBox width height preserveAspectRatio x y x1 y1 x2 y2 cx cy r rx ry d points transform fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color clip-path clip-rule clipPathUnits gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity fx fy fr'.split(' '));
const fail=m=>{throw Error(m)};
export function inspect(bytes){
 if(bytes.length>LIMITS.inputBytes)fail('Input exceeds 256 KiB');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{fail('Only UTF-8 SVG is supported')}
 if(/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(text))fail('DTD, entities and processing instructions are unsupported');
 let errors=[];let doc;
 try{doc=new DOMParser({onError:(level,msg)=>errors.push(msg)}).parseFromString(text,'image/svg+xml')}catch(e){fail(`Invalid XML: ${e.message}`)}
 if(errors.length)fail('Invalid XML: '+errors[0]);
 const root=doc.documentElement;
 if(root?.tagName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg')fail('Expected SVG namespace and svg root');
 let count=0;const ids=new Map(),refs=[];
 function visit(el,depth){
  if(++count>LIMITS.elements||depth>LIMITS.depth)fail('SVG complexity limit exceeded');
  if(!tags.has(el.tagName)||el.namespaceURI!==root.namespaceURI||(el!==root&&el.tagName==='svg'))fail(`Unsupported element: ${el.tagName}`);
  for(const a of Array.from(el.attributes)){
   if(!attrs.has(a.name))fail(`Unsupported attribute: ${a.name}`);
   if(a.value.length>LIMITS.attributeBytes)fail('Attribute complexity limit exceeded');
   if(/[\\]|@|(?:https?:|data:|file:)/i.test(a.value)&&a.name!=='xmlns')fail('External resources and CSS escapes are unsupported');
   if(/url\s*\(/i.test(a.value)){
    const m=/^url\(#([A-Za-z_][\w.-]*)\)$/.exec(a.value);if(!m)fail('Only local fragment paint/clip references are supported');
    if(!['fill','stroke','clip-path'].includes(a.name))fail('Unsupported reference');refs.push([el,a.name,m[1]]);
   }
   if(a.name==='id'){if(ids.has(a.value))fail('Duplicate SVG id');ids.set(a.value,el)}
  }
  for(const c of Array.from(el.childNodes)){if(c.nodeType===1)visit(c,depth+1);else if(c.nodeType===3&&c.data.trim()&&!['title','desc'].includes(el.tagName))fail('Text rendering is unsupported; convert text to paths')}
 }
 visit(root,1);
 for(const [el,attr,id] of refs){const target=ids.get(id);if(!target)fail(`Unresolved reference: ${id}`);if(attr==='clip-path'?target.tagName!=='clipPath':!['linearGradient','radialGradient'].includes(target.tagName))fail('Reference target type unsupported');if(target===el||target.getElementsByTagName('*').length&&Array.from(target.getElementsByTagName('*')).some(n=>refs.some(r=>r[0]===n)))fail('Nested resource references unsupported');}
 let vb=null;if(root.hasAttribute('viewBox')){vb=root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0)fail('Invalid viewBox')}
 const length=s=>{const m=/^(\d+(?:\.\d+)?|\.\d+)(px|in|cm|mm|pt|pc)?$/.exec(s);if(!m)fail('Dimensions must use positive absolute units (no percentages)');return Number(m[1])*({px:1,in:96,cm:96/2.54,mm:96/25.4,pt:96/72,pc:16}[m[2]||'px'])};
 let w=root.hasAttribute('width')?length(root.getAttribute('width')):null,h=root.hasAttribute('height')?length(root.getAttribute('height')):null;
 if(w===null&&h===null&&vb){w=vb[2];h=vb[3]}else if(w===null&&vb)w=h*vb[2]/vb[3];else if(h===null&&vb)h=w*vb[3]/vb[2];
 if(!w||!h||!Number.isFinite(w+h)||w>1e6||h>1e6)fail('Positive finite intrinsic dimensions or a viewBox are required');
 const par=root.getAttribute('preserveAspectRatio');if(par&&!/^(none|x(Min|Mid|Max)Y(Min|Mid|Max)( (meet|slice))?)$/.test(par))fail('Unsupported preserveAspectRatio');
 root.setAttribute('width',String(w));root.setAttribute('height',String(h));
 return {sha256:sha256(bytes),width:w,height:h,elements:count,normalized:new XMLSerializer().serializeToString(doc)};
}
export function dimensions(info,width){if(!Number.isInteger(width)||width<1||width>LIMITS.width)fail('Width must be an integer from 1 to 4096');const height=Math.max(1,Math.round(width*info.height/info.width));if(height>LIMITS.width||width*height>LIMITS.pixels)fail('Output dimension/pixel limit exceeded');return {width,height}}
export function background(value){if(value!=='transparent'&&!/^#[0-9a-f]{6}$/i.test(value))fail('Background must be transparent or #RRGGBB');return value}
