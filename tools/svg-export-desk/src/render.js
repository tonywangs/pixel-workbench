import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {inspect,dimensions,background,LIMITS} from './policy.js';
export const RENDERER={name:'@resvg/resvg-js',version:createRequire(import.meta.url)('@resvg/resvg-js/package.json').version};
export async function render(bytes,width,bg){const info=inspect(bytes),size=dimensions(info,width);background(bg);return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./render-worker.js',import.meta.url),{workerData:{svg:info.normalized,width,background:bg},resourceLimits:{maxOldGenerationSizeMb:64}});
 const timer=setTimeout(()=>{worker.terminate();reject(Error('Renderer exceeded 5 second execution limit'))},LIMITS.renderMs);
 worker.once('message',data=>{clearTimeout(timer);worker.terminate();if(data.error)reject(Error(data.error));else {const png=Buffer.from(data.png);if(png.readUInt32BE(16)!==size.width||png.readUInt32BE(20)!==size.height)reject(Error('Renderer dimensions disagree with requested viewport'));else resolve({png,info,...size})}});
 worker.once('error',e=>{clearTimeout(timer);reject(e)});
 worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('Renderer terminated'))});
})}
