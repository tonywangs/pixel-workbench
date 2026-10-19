'use strict';
const express=require('express'), multer=require('multer'), fs=require('node:fs/promises'), path=require('node:path'), crypto=require('node:crypto');
const {zipSync}=require('fflate');
const {LIMITS,inspect,hash,settings,variant,buildPackage}=require('./engine');
const ROOT=__dirname, WORK=path.resolve(process.env.DESK_WORK || path.join(ROOT,'.work'));
async function createApp() {
  await fs.mkdir(path.join(WORK,'sources'),{recursive:true});await fs.mkdir(path.join(WORK,'packages'),{recursive:true});
  const app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{
    const host=req.headers.host || '';
    if(!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return res.status(403).json({error:'Loopback host required.'});
    if(req.headers.origin && req.headers.origin!==`http://${host}`) return res.status(403).json({error:'Same-origin requests only.'});
    res.set('X-Content-Type-Options','nosniff');next();
  });
  app.use(express.json({limit:'256kb'}));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:LIMITS.bytes,files:1,fields:0,parts:2}}).single('file');
  const sourcePath=id=>{if(!/^[a-f0-9]{64}$/.test(id)) throw Error('Invalid source hash.');return path.join(WORK,'sources',id);};
  const getSource=async id=>{const b=await fs.readFile(sourcePath(id));if(hash(b)!==id)throw Error('Stored source hash mismatch. Reimport the exact original to repair this copy.');return b;};
  const demo=JSON.parse(await fs.readFile(path.join(ROOT,'demo/sources.json'),'utf8'));
  const provenance=id=>demo.find(s=>s.sha256===id) || null;
  app.get('/api/demo',(req,res)=>res.json(demo));
  app.get('/api/sources/:id',async(req,res)=>{try {res.json(await inspect(await getSource(req.params.id),'reconnected',provenance(req.params.id)));}catch(e){res.status(404).json({error:e.message});}});
  app.post('/api/import',upload,async(req,res)=>{
    if(!req.file) throw Error('Choose a JPEG or PNG.');
    const metadata=await inspect(req.file.buffer,req.file.originalname,provenance(hash(req.file.buffer)));
    const files=await fs.readdir(path.join(WORK,'sources'));
    if(!files.includes(metadata.sha256)&&files.length>=LIMITS.sources) throw Error('Workspace holds 40 sources. Stop the server and remove .work to reset after saving your project.');
    await fs.writeFile(sourcePath(metadata.sha256),req.file.buffer);
    res.json(metadata);
  });
  app.get('/api/original/:id',async(req,res)=>{const b=await getSource(req.params.id);res.type(b[0]===255?'jpeg':'png').send(b);});
  let busy=false;
  async function exclusive(res,fn){if(busy) return res.status(409).json({error:'Image processor is busy. Try again when the current operation finishes.'});busy=true;try{await fn();}finally{busy=false;}}
  app.post('/api/preview',async(req,res)=>exclusive(res,async()=>{
    const config=settings({widths:[req.body.width],quality:req.body.quality});const b=await getSource(req.body.sha256);const src=await inspect(b,'preview');
    if(config.widths[0]>src.width) throw Error(`No enlargement: source is ${src.width}px wide. Choose a smaller width.`);
    const {data,info}=await variant(b,config.widths[0],config.quality,'webp');res.json({width:info.width,height:info.height,bytes:data.length,sha256:hash(data),url:`data:image/webp;base64,${data.toString('base64')}`});
  }));
  app.post('/api/export',async(req,res)=>exclusive(res,async()=>{
    const id=crypto.randomUUID(), dir=path.join(WORK,'packages',id);
    const entries=req.body.entries?.map(e=>({...e,provenance:provenance(e.sha256) || e.provenance || null}));
    const manifest=await buildPackage(entries,req.body.settings,getSource,dir);
    const files={};for(const name of ['index.html','manifest.json','README.txt'])files[name]=await fs.readFile(path.join(dir,name));
    for(const name of await fs.readdir(path.join(dir,'images')))files['images/'+name]=await fs.readFile(path.join(dir,'images',name));
    await fs.writeFile(path.join(dir,'package.zip'),zipSync(files,{level:0}));
    res.json({id,manifest,url:`/packages/${id}/index.html`,download:`/packages/${id}/package.zip`});
  }));
  app.use('/packages',express.static(path.join(WORK,'packages')));
  app.use('/demo',express.static(path.join(ROOT,'demo')));
  app.use(express.static(path.join(ROOT,'public')));
  app.use((err,req,res,next)=>res.status(400).json({error:err.message}));
  return app;
}
if(require.main===module)createApp().then(app=>app.listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log(`Image Desk: http://127.0.0.1:${process.env.PORT || 4173}`)));
module.exports={createApp};
