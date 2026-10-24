"""Bounded hash-pinned public acquisition. Never rewrites a mismatching existing file."""
import hashlib, json, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def acquire():
    (ROOT/'data').mkdir(exist_ok=True)
    for source in json.loads((ROOT/'provenance.json').read_text()):
        target=ROOT/'data'/source['file']
        if target.exists(): data=target.read_bytes()
        else:
            req=urllib.request.Request(source['url'],headers={'User-Agent':'PhotoMetadataDesk/1.0 (local reproducible demo)'})
            with urllib.request.urlopen(req,timeout=45) as r: data=r.read(10*1024*1024+1)
        if len(data)>10*1024*1024: raise RuntimeError('Download exceeds 10 MiB')
        if hashlib.sha256(data).hexdigest()!=source['sha256']: raise RuntimeError('Hash mismatch: '+source['file'])
        if not target.exists(): target.write_bytes(data)
        print(source['file'],len(data),'bytes; SHA-256 verified',flush=True)
if __name__=='__main__': acquire()
