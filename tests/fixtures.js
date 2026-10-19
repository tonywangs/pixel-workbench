import fs from 'node:fs/promises';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
export const tool='node_modules/exiftool-vendored.pl/bin/exiftool';
export function oracle(path){return JSON.parse(execFileSync('perl',[tool,'-j','-G1','-a','-n',path],{encoding:'utf8'}))[0];}
export async function fixtures(){
 await fs.mkdir('data/controls',{recursive:true});const pixels=Buffer.alloc(80*48*3);for(let y=0;y<48;y++)for(let x=0;x<80;x++){let i=(y*80+x)*3;pixels[i]=x*3;pixels[i+1]=y*5;pixels[i+2]=(x<20&&y<20)?255:30;}
 for(let o=1;o<=8;o++){
  const path=`data/controls/orientation-${o}.jpg`;
  await sharp(pixels,{raw:{width:80,height:48,channels:3}}).jpeg({quality:90,progressive:o===8}).withIccProfile('srgb').toFile(path);
  execFileSync('perl',[tool,'-overwrite_original',`-Orientation#=${o}`,'-Artist=CONTROL_PRIVATE_ARTIST','-Make=CONTROL_CAMERA','-GPSLatitude=37.25','-GPSLatitudeRef=N','-GPSLongitude=122.5','-GPSLongitudeRef=W','-Comment=CONTROL_PRIVATE_COMMENT','-XMP-dc:Description=CONTROL_PRIVATE_XMP','-IPTC:Keywords=CONTROL_PRIVATE_IPTC','-ThumbnailImage<=data/anolis.jpg',path]);
 }
 // Duplicate complete EXIF containers and COM segments, intentionally labeled controls.
 const b=await fs.readFile('data/controls/orientation-6.jpg');const segments=[];let p=2;while(b[p+1]!==218){const len=b.readUInt16BE(p+2)+2;const s=b.subarray(p,p+len);if(s[1]===225&&s.subarray(4,10).equals(Buffer.from('Exif\0\0')))segments.push(s);if(s[1]===254)segments.push(s);p+=len;}
 await fs.writeFile('data/controls/duplicates.jpg',Buffer.concat([b.subarray(0,2),...segments,b.subarray(2)]));
 // Two identical Orientation tags and two Artist tags in one TIFF IFD.
 const t=Buffer.alloc(62);t.write('II');t.writeUInt16LE(42,2);t.writeUInt32LE(8,4);t.writeUInt16LE(4,8);
 for(let i=0;i<4;i++){const o=10+12*i;t.writeUInt16LE(i<2?274:315,o);t.writeUInt16LE(i<2?3:2,o+2);t.writeUInt32LE(i<2?1:4,o+4);if(i<2)t.writeUInt16LE(6,o+8);else t.write(i===2?'ONE\0':'TWO\0',o+8,'binary');}
 const app=Buffer.alloc(10+t.length);app.set([255,225,0,t.length+8]);app.write('Exif\0\0',4,'binary');t.copy(app,10);
 const body=[b.subarray(0,2),app];p=2;while(p<b.length){if(b[p+1]===218){body.push(b.subarray(p));break;}const len=b.readUInt16BE(p+2)+2;if(!(b[p+1]===225&&b.subarray(p+4,p+10).equals(Buffer.from('Exif\0\0'))))body.push(b.subarray(p,p+len));p+=len;}
 await fs.writeFile('data/controls/duplicate-tags.jpg',Buffer.concat(body));
 const conflict=Buffer.concat(body);conflict.writeUInt16LE(8,2+10+30);await fs.writeFile('data/controls/conflicting-tags.jpg',conflict);
 return [...Array.from({length:8},(_,i)=>`orientation-${i+1}.jpg`),'duplicates.jpg','duplicate-tags.jpg'];
}
