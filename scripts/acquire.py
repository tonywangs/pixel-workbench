#!/usr/bin/env python3
"""Acquire pinned CC0 Met photographs of artworks; reruns verify exact hashes."""
import json, pathlib, hashlib, urllib.request, time
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'demo'
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ResponsiveImageDesk/1.0 (local educational image processing demo)'}),timeout=45) as r: return r.read()
manifest=out/'sources.json'
if manifest.exists():
    for s in json.loads(manifest.read_text()):
        p=out/s['path']
        if not p.exists(): p.write_bytes(fetch(s['downloadUrl']))
        assert hashlib.sha256(p.read_bytes()).hexdigest()==s['sha256'], s['path']
    print('Verified pinned source hashes'); raise SystemExit
sources=[]
for id in [436535,436532,436533,436534,437133,437127,436121,436105,436095,436090,436002,437853,437881,437854,436896,436529,436530,436531]:
    try:
        url=f'https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}'
        data=fetch(url); obj=json.loads(data)
        if not obj.get('isPublicDomain') or not obj.get('primaryImageSmall'): continue
        image=fetch(obj['primaryImageSmall'])
        if len(image)>10*1024*1024: continue
        path=f'images/met-{id}.jpg'
        (out/path).write_bytes(image)
        (out/'evidence'/f'met-{id}.json').write_bytes(data)
        sources.append(dict(id=str(id),name=f'met-{id}.jpg',title=obj['title'],creator=obj['artistDisplayName'],path=path,sourceUrl=obj['objectURL'],downloadUrl=obj['primaryImageSmall'],apiUrl=url,license='CC0-1.0',licenseUrl='https://www.metmuseum.org/policies/image-resources',evidence=f'evidence/met-{id}.json',sha256=hashlib.sha256(image).hexdigest(),bytes=len(image),kind='real photograph of artwork'))
        print(id,obj['title'],len(image),flush=True)
        if len(sources)==12: break
    except Exception as e: print(id,str(e),flush=True)
    time.sleep(.3)
assert len(sources)==12, f'Only {len(sources)} acquired'
manifest.write_text(json.dumps(sources,indent=2)+'\n')
