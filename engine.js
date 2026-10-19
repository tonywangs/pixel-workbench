import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const limits = {files:40, bytes:8*1024*1024, pixels:20_000_000};
export const algorithm = {version:1, decoder:`sharp ${sharp.versions.sharp} / vips ${sharp.versions.vips}`, pixels:'EXIF-oriented 8-bit sRGB RGBA; dimensions included; transparent RGB retained', similarity:'64-bit horizontal dHash; white alpha flatten; grayscale; 9x8 Lanczos3; Hamming distance <= 8', threshold:8};
export const hash = b => createHash('sha256').update(b).digest('hex');
export async function analyze(bytes) {
 if(bytes.length>limits.bytes) throw Error('File exceeds 8 MiB');
 const opts={limitInputPixels:limits.pixels,failOn:'warning'};
 const meta=await sharp(bytes,opts).metadata();
 if(!['jpeg','png','webp'].includes(meta.format)) throw Error('Only JPEG, PNG and WebP are supported');
 if((meta.pages||1)>1) throw Error('Animated/multipage images are not supported');
 const {data,info}=await sharp(bytes,opts).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixelHash=hash(Buffer.concat([Buffer.from(`${info.width}x${info.height}:RGBA8\0`),data]));
 const raw={width:info.width,height:info.height,channels:4};
 const small=await sharp(data,{raw}).flatten({background:'#ffffff'}).greyscale().resize(9,8,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer();
 let dhash='';for(let y=0;y<8;y++) for(let x=0;x<8;x++) dhash+=small[y*9+x]>small[y*9+x+1]?'1':'0';
 const thumb=await sharp(data,{raw}).resize(480,480,{fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:85}).toBuffer();
 return {sha256:hash(bytes),pixelHash,dhash,width:info.width,height:info.height,format:meta.format,bytes:bytes.length,orientation:meta.orientation||1,thumb:'data:image/jpeg;base64,'+thumb.toString('base64')};
}
