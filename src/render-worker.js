import {parentPort,workerData} from 'node:worker_threads';
import {Resvg} from '@resvg/resvg-js';
const {svg,width,background}=workerData;
try{const png=new Resvg(svg,{fitTo:{mode:'width',value:width},background:background==='transparent'?undefined:background,font:{loadSystemFonts:false}}).render().asPng();parentPort.postMessage({png})}catch(e){parentPort.postMessage({error:e.message})}
