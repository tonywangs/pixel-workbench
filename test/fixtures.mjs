import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
export async function fixtures(root='results/fixtures'){
 await mkdir(root,{recursive:true});
 const raw=Buffer.alloc(120*80*3);const colors=[[240,20,20],[20,220,20],[20,20,240],[240,220,20]];
 for(let y=0;y<80;y++)for(let x=0;x<120;x++){const c=colors[(y>=40?2:0)+(x>=60?1:0)];for(let k=0;k<3;k++)raw[(y*120+x)*3+k]=c[k];}
 for(let orientation=1;orientation<=8;orientation++)await sharp(raw,{raw:{width:120,height:80,channels:3}}).jpeg({quality:100}).withMetadata({orientation}).toFile(`${root}/orientation-${orientation}.jpg`);
 await mkdir(`${root}/a`,{recursive:true});await mkdir(`${root}/b`,{recursive:true});
 const image=await sharp(raw,{raw:{width:120,height:80,channels:3}}).png().toBuffer();
 await writeFile(`${root}/a/duplicate.png`,image);await writeFile(`${root}/b/duplicate.png`,image);
 await writeFile(`${root}/${'very-long-filename-'.repeat(10)}end.png`,image);
 await writeFile(`${root}/東京-é-😀.png`,image);
 await sharp({create:{width:100,height:70,channels:4,background:{r:255,g:0,b:0,alpha:0}}}).png().toFile(`${root}/transparent.png`);
 await writeFile(`${root}/broken.jpg`,'This is intentionally not an image');
 await writeFile(`${root}/notes.txt`,'Controlled unsupported input');
 // Two explicit one-pixel frames (red then blue); no encoder frame deduplication.
 await writeFile(`${root}/animated.gif`,Buffer.from('47494638396101000100800000ff00000000ff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b','hex'));
 return root;
}
if(process.argv[1]?.endsWith('fixtures.mjs'))await fixtures();
