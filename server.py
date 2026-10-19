"""Loopback-only image workbench. Originals stay in request memory, never written."""
import base64, hashlib, io, json, re, warnings
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parent
Image.MAX_IMAGE_PIXELS=20_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
POLICY={'coordinates':'oriented source pixels; integer [left, top, right, bottom), right/bottom exclusive', 'color':'8-bit RGBA samples; RGB/gray/palette expanded; ICC ignored (no color management); interpreted as sRGB', 'metadata':'all metadata stripped', 'resampling':'none', 'orientation':'EXIF transposed before coordinates', 'formats':'single-frame 8-bit JPEG/PNG only; CMYK, 16-bit, animation rejected'}
def digest(data): return hashlib.sha256(data).hexdigest()
def decode(data):
    if len(data)>10*1024*1024: raise ValueError('Maximum source size: 10 MiB')
    if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data)>24 and data[24]==16: raise ValueError('16-bit PNG is unsupported')
    im=Image.open(io.BytesIO(data))
    if im.format not in ('JPEG','PNG') or getattr(im,'n_frames',1)!=1: raise ValueError('Only single-frame JPEG/PNG supported')
    if im.mode not in ('1','L','LA','P','RGB','RGBA'): raise ValueError('Only 8-bit RGB, grayscale, or palette inputs supported')
    if im.width*im.height>20_000_000: raise ValueError('Maximum image size: 20 megapixels')
    im=ImageOps.exif_transpose(im).convert('RGBA'); im.info.clear()
    return im

def png(im):
    out=io.BytesIO(); im.save(out,format='PNG'); return out.getvalue()
def rect(value,w,h):
    if not isinstance(value,list) or len(value)!=4 or any(type(v) is not int for v in value): raise ValueError('Bounds must be four integers')
    l,t,r,b=value
    if not 0<=l<r<=w or not 0<=t<b<=h: raise ValueError('Empty or out-of-bounds crop')
    return value

def process(req):
    raw=base64.b64decode(req['data'],validate=True); sha=digest(raw); im=decode(raw)
    if req.get('hash',sha)!=sha: raise ValueError('Source hash mismatch: selections cannot be restored')
    if req['action']=='inspect': return dict(hash=sha,width=im.width,height=im.height,preview=base64.b64encode(png(im)).decode())
    if req['action']!='export': raise ValueError('Unknown action')
    crops=req['crops']
    if not isinstance(crops,list) or len(crops)>100: raise ValueError('Maximum 100 crops per source')
    results=[]
    total_pixels=0
    for i,c in enumerate(crops):
        row={'index':i,'name':c.get('name','') if isinstance(c,dict) else ''}
        try:
            box=rect(c['rect'],im.width,im.height)
            pixels=(box[2]-box[0])*(box[3]-box[1])
            if total_pixels+pixels>40_000_000: raise ValueError('Per-source export budget: 40 megapixels; export fewer crops')
            total_pixels+=pixels
            data=png(im.crop(tuple(box)))
            name=re.sub(r'[^a-zA-Z0-9_-]+','-',str(c.get('name','crop')))[:50] or 'crop'
            row.update(status='exported',file=f'{sha[:16]}-{i+1:03d}-{name}.png',rect=box,dimensions=[box[2]-box[0],box[3]-box[1]],sha256=digest(data),data=base64.b64encode(data).decode())
        except (ValueError,KeyError,TypeError) as e: row.update(status='failed',error=str(e))
        results.append(row)
    return dict(source_hash=sha,dimensions=list(im.size),policy=POLICY,complete=all(r['status']=='exported' for r in results),results=results)

class Handler(BaseHTTPRequestHandler):
    def send(self,data,kind='application/json',status=200):
        self.send_response(status); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(data))); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        path=self.path.split('?')[0]
        allowed={'/':ROOT/'web/index.html','/app.js':ROOT/'web/app.js','/style.css':ROOT/'web/style.css','/demo/sources.json':ROOT/'demo/sources.json'}
        if path.startswith('/demo/photos/') and Path(path).name in [x.name for x in (ROOT/'demo/photos').glob('*')]: allowed[path]=ROOT/'demo/photos'/Path(path).name
        p=allowed.get(path)
        if not p: return self.send(b'Not found','text/plain',404)
        import mimetypes
        self.send(p.read_bytes(),mimetypes.guess_type(str(p))[0] or 'application/octet-stream')
    def do_POST(self):
        if self.path!='/api': return self.send(b'{}',status=404)
        # Require same-origin JSON; no CORS. Reject cross-origin browser requests.
        if self.headers.get('Origin') not in (None,f'http://{self.headers.get("Host")}'): return self.send(b'{}',status=403)
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=15*1024*1024: raise ValueError('Request limit: 15 MiB')
            if self.headers.get_content_type()!='application/json': raise ValueError('JSON required')
            result=process(json.loads(self.rfile.read(n)))
            self.send(json.dumps(result).encode())
        except Exception as e: self.send(json.dumps({'error':str(e)}).encode(),status=400)
if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);a=p.parse_args()
    print(f'Crop Desk → http://127.0.0.1:{a.port}',flush=True)
    HTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
