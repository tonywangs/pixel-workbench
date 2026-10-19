"""Acquire bounded public photographs, checking their recorded hashes on repeat runs."""
import hashlib, json, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = 'https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/'
PHOTOS = {'astronaut.png': ('NASA', 'Public domain'), 'camera.png': ('Lav Varshney', 'CC0'), 'chelsea.png': ('Stefan van der Walt', 'CC0'), 'coffee.png': ('Rachel Michetti', 'CC0'), 'hubble_deep_field.jpg': ('NASA', 'Public domain'), 'clock_motion.png': ('Stefan van der Walt', 'Public domain')}
def main():
    from PIL import Image
    manifest = ROOT / 'demo/sources.json'
    old = {x['file']:x for x in json.loads(manifest.read_text())} if manifest.exists() else {}
    rows=[]
    for name,(author,license) in PHOTOS.items():
        data=urllib.request.urlopen(BASE+name).read(10*1024*1024+1)
        assert len(data)<=10*1024*1024
        digest=hashlib.sha256(data).hexdigest()
        if name in old: assert old[name]['sha256']==digest, name
        path=ROOT/'demo/photos'/name; path.write_bytes(data)
        with Image.open(path) as im: size=list(im.size)
        rows.append(dict(file=name,url=BASE+name,revision='v0.25.2',author=author,license=license,sha256=digest,dimensions=size,license_evidence=BASE+'_fetchers.py'))
    manifest.write_text(json.dumps(rows,indent=2)+'\n')
    print('Acquired and hash-checked',len(rows),'licensed photographs')
if __name__=='__main__': main()
