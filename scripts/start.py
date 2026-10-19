import subprocess
from pathlib import Path
from acquire import acquire
ROOT=Path(__file__).resolve().parents[1]
if not (ROOT/'node_modules/exifreader/dist/exif-reader.js').exists():
    subprocess.run(['npm','ci','--omit=dev'],cwd=ROOT,check=True)
acquire()
subprocess.run(['python3','scripts/serve.py'],cwd=ROOT,check=True)
