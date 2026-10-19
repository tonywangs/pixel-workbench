import express from 'express';
import multer from 'multer';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {inspect,restore,exportPDF,LIMITS} from './core.js';
export const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
 const host=req.headers.host||'';
 if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return res.status(403).json({error:'Local access only'});
 if(req.headers.origin&&!['http://'+host].includes(req.headers.origin))return res.status(403).json({error:'Cross-origin requests are disabled'});
 res.set('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'");next();
});
app.use(express.json({limit:'75mb'}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:LIMITS.fileBytes,files:1,fields:1,fieldSize:4096}});
app.post('/api/inspect',upload.single('file'),async(req,res)=>{
 if(!req.file)throw Error('Missing file');res.json(await inspect(req.file.buffer,req.body.name||req.file.originalname));
});
app.post('/api/restore',async(req,res)=>res.json(await restore(req.body)));
app.post('/api/export',async(req,res)=>{const project=await restore(req.body);const {pdf,manifest}=await exportPDF(project);res.json({pdf:pdf.toString('base64'),manifest});});
app.get('/api/demo',async(req,res)=>{
 const p=JSON.parse(await readFile(new URL('./demo/provenance.json',import.meta.url)));
 const files=[];for(const [i,e] of p.images.entries())files.push({...await inspect(await readFile(new URL('./demo/images/'+e.filename,import.meta.url)),`Met-demo/${e.filename}`),id:`S${String(i+1).padStart(4,'0')}`});
 res.json({version:1,files,order:files.filter(f=>f.status==='ready').map(f=>f.id),settings:{paper:'A4',columns:3,rows:4,labels:'filename'}});
});
app.use(express.static(new URL('./public/',import.meta.url).pathname));
app.use((err,req,res,next)=>{res.status(400).json({error:err.message});});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.env.PORT||4317);app.listen(port,'127.0.0.1',()=>console.log(`Contact Sheet Desk: http://127.0.0.1:${port}`));}
