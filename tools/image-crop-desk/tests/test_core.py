"""Real-photo pixel verification uses OpenCV independently of Pillow crop/export."""
import base64, hashlib, io, json, pathlib, sys, unittest
import cv2
import numpy as np
from PIL import Image
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from server import process, decode, png
ROOT=pathlib.Path(__file__).resolve().parents[1]
def request(raw,crops,**extra): return process(dict(action='export',data=base64.b64encode(raw).decode(),crops=crops,**extra))
def independent(raw):
    im=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_UNCHANGED)
    if im.ndim==2: return cv2.cvtColor(im,cv2.COLOR_GRAY2RGBA)
    return cv2.cvtColor(im,cv2.COLOR_BGRA2RGBA if im.shape[2]==4 else cv2.COLOR_BGR2RGBA)
class Core(unittest.TestCase):
    def test_real_photos(self):
        rows=json.loads((ROOT/'demo/sources.json').read_text());self.assertEqual(len(rows),6)
        out=ROOT/'demo/exports';out.mkdir(exist_ok=True)
        manifest=[]
        for row in rows:
            raw=(ROOT/'demo/photos'/row['file']).read_bytes();before=hashlib.sha256(raw).hexdigest();self.assertEqual(before,row['sha256'])
            original=independent(raw);h,w=original.shape[:2]
            k=min(w//4,h//5);q=min(w//3,h//2)
            boxes=[[0,0,4*k,5*k],[w-3*q,h-2*q,w,h],[w-1,h-1,w,h]]
            result=request(raw,[dict(name='duplicate',rect=r) for r in boxes]);self.assertTrue(result['complete'])
            names=[]
            for r,box in zip(result['results'],boxes):
                data=base64.b64decode(r.pop('data'));actual=independent(data);l,t,rr,b=box
                np.testing.assert_array_equal(actual,original[t:b,l:rr]);self.assertEqual(hashlib.sha256(data).hexdigest(),r['sha256']);names.append(r['file']);(out/r['file']).write_bytes(data)
            self.assertEqual(len(set(names)),3);self.assertEqual(hashlib.sha256((ROOT/'demo/photos'/row['file']).read_bytes()).hexdigest(),before);manifest.append(result)
        (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    def test_orientations(self):
        a=np.arange(6*9*4,dtype=np.uint8).reshape(6,9,4)
        transforms=[lambda a:a,lambda a:a[:,::-1],lambda a:a[::-1,::-1],lambda a:a[::-1],lambda a:a.transpose(1,0,2),lambda a:np.rot90(a,-1),lambda a:a.transpose(1,0,2)[::-1,::-1],lambda a:np.rot90(a)]
        for n,transform in enumerate(transforms,1):
            im=Image.fromarray(a);ex=Image.Exif();ex[274]=n;buf=io.BytesIO();im.save(buf,format='PNG',exif=ex);raw=buf.getvalue();expected=transform(a);h,w=expected.shape[:2]
            result=request(raw,[dict(name='orientation',rect=[0,0,w,h])]);actual=independent(base64.b64decode(result['results'][0]['data']));np.testing.assert_array_equal(actual,expected)
    def test_invalid_and_partial(self):
        raw=png(Image.new('RGBA',(10,10),(30,40,50,70)))
        boxes=[[0,0,10,10],[0,0,0,1],[-1,0,1,1],[0,0,11,10],[0,0,1.5,3],[False,0,1,1],None]
        result=request(raw,[dict(name='x',rect=r) for r in boxes]);self.assertFalse(result['complete']);self.assertEqual([x['status'] for x in result['results']],['exported']+['failed']*6)
        with self.assertRaisesRegex(ValueError,'hash mismatch'):request(raw,[],hash='0'*64)
        with self.assertRaises(ValueError):request(raw,[{}]*101)
    def test_transparency_palette_and_metadata(self):
        im=Image.new('P',(8,7));im.putpalette([255,0,0,0,255,0]+[0]*762);im.putpixel((2,3),1);buf=io.BytesIO();im.save(buf,format='PNG',transparency=0)
        raw=buf.getvalue();r=request(raw,[dict(name='alpha',rect=[1,1,8,7])]);data=base64.b64decode(r['results'][0]['data']);np.testing.assert_array_equal(independent(data),independent(raw)[1:7,1:8]);self.assertEqual(Image.open(io.BytesIO(data)).info,{})
    def test_output_budget(self):
        raw=png(Image.new('RGB',(1000,1000)))
        result=request(raw,[dict(name='large',rect=[0,0,1000,1000]) for _ in range(41)])
        self.assertFalse(result['complete']);self.assertEqual(sum(r['status']=='exported' for r in result['results']),40)
        self.assertIn('budget',result['results'][-1]['error'])

    def test_unsupported(self):
        for channels in (3,4):
            ok,encoded=cv2.imencode('.png',np.full((2,3,channels),32768,dtype=np.uint16));self.assertTrue(ok)
            with self.assertRaisesRegex(ValueError,'16-bit'):decode(encoded.tobytes())
        for fmt,mode in [('GIF','RGB'),('TIFF','RGB'),('JPEG','CMYK'),('PNG','I;16')]:
            im=Image.new(mode,(5,5));buf=io.BytesIO();im.save(buf,format=fmt)
            with self.assertRaises(ValueError):decode(buf.getvalue())
        buf=io.BytesIO();Image.new('RGB',(5,5)).save(buf,format='PNG',save_all=True,append_images=[Image.new('RGB',(5,5),'red')])
        with self.assertRaises(ValueError):decode(buf.getvalue())
        with self.assertRaises(Exception):decode(b'not an image')
if __name__=='__main__':unittest.main(verbosity=2)
