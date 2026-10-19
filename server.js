import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyze,algorithm,limits} from './engine.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4317);
let busy=false;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 const send=(code,value,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(type==='application/json'&&!Buffer.isBuffer(value)?JSON.stringify(value):value);};
 const host=req.headers.host;
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return send(403,{error:'Local host only'});
 if(req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin))return send(403,{error:'Same origin only'});
 const pathname=new URL(req.url,'http://localhost').pathname;
 try{
  if(req.method==='POST'&&pathname==='/api/analyze'){
   if(req.headers['content-type']!=='application/octet-stream')return send(415,{error:'Binary image required'});
   if(busy)return send(429,{error:'Another image is processing; retry shortly'});
   busy=true;
   try {let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>limits.bytes){send(413,{error:'File exceeds 8 MiB'});return;}parts.push(chunk);}const result=await analyze(Buffer.concat(parts));send(200,result);}finally{busy=false;}return;
  }
  if(req.method!=='GET')return send(405,{error:'Method not allowed'});
  if(pathname==='/api/config')return send(200,{algorithm,limits});
  let relative;
  if(pathname==='/')relative='public/index.html';
  else if(['/app.js','/model.js','/style.css'].includes(pathname))relative='public'+pathname;
  else if(pathname==='/demo/manifest.json'||/^\/demo\/images\/[a-z0-9.-]+$/.test(pathname))relative=pathname.slice(1);
  else return send(404,{error:'Not found'});
  send(200,await readFile(path.join(root,relative)),mime[path.extname(relative)]||'application/octet-stream');
 }catch(e){send(pathname==='/api/analyze'?422:404,{error:pathname==='/api/analyze'?e.message:'Not found'});}
});
server.requestTimeout=30000;
server.listen(port,'127.0.0.1',()=>console.log(`Photo review: http://127.0.0.1:${port}`));
