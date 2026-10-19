import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {inspect,LIMITS} from './policy.js';
import {sourceData,batch} from './batch.js';
import {render} from './render.js';
const root=new URL('../',import.meta.url);
export function createServer(){let busy=false;return http.createServer(async(req,res)=>{
 const host=req.headers.host;const validHost=/^(127\.0\.0\.1|localhost):\d+$/.test(host||'');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
 const send=(code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data)};
 try{
  if(!validHost) return send(403,{error:'Local host required'});
  if(req.headers.origin&&req.headers.origin!==`http://${host}`)return send(403,{error:'Same origin required'});
  const url=new URL(req.url,`http://${host}`);
  if(req.method==='GET'){
   const routes={'/':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css','/demo/sources.json':'fixtures/artwork/sources.json'};
   let path=routes[url.pathname];if(/^\/demo\/(lucide|tabler)\/[a-z-]+\.svg$/.test(url.pathname))path='fixtures/artwork/'+url.pathname.slice(6);
   if(!path)return send(404,{error:'Not found'});const type=path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'application/json';
   const data=await readFile(new URL(path,root));res.writeHead(200,{'Content-Type':type});return res.end(data);
  }
  if(req.method!=='POST'||!['/api/inspect','/api/preview','/api/export'].includes(url.pathname))return send(404,{error:'Not found'});
  if(req.headers['content-type']!=='application/json')return send(415,{error:'JSON required'});
  if(busy)return send(429,{error:'Another operation is running; try again shortly'});
  busy=true;
  try{
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>9*1024*1024)throw Error('Request exceeds 9 MiB');chunks.push(chunk)}
   const data=JSON.parse(Buffer.concat(chunks));
   if(url.pathname==='/api/inspect'){if(!Array.isArray(data.sources)||data.sources.length>LIMITS.sources)throw Error('At most 24 sources');return send(200,{sources:data.sources.map(s=>{try{const {normalized,...info}=inspect(sourceData(s));return {name:s.name,...info}}catch(e){return {name:s?.name,error:e.message}}})})}
   if(url.pathname==='/api/preview'){const out=await render(sourceData(data.source),data.width,data.background);return send(200,out.png,'image/png')}
   const out=await batch(data.sources,data.widths,data.background);res.setHeader('X-Batch-Status',out.manifest.status);res.setHeader('Content-Disposition','attachment; filename="svg-export.zip"');return send(200,Buffer.from(out.zip),'application/zip');
  }finally{busy=false}
 }catch(e){if(!res.headersSent)send(400,{error:e.message});else res.end()}
})}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||4173);const server=createServer();server.requestTimeout=30000;server.listen(port,'127.0.0.1',()=>console.log(`SVG Export Desk: http://127.0.0.1:${port}`));}
