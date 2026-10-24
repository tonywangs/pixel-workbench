"""Recheck pinned real artwork and sprite extraction with Pillow, not sharp."""
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageCms
from verify_pixels import canonical

provenance = json.loads(Path('samples/provenance.json').read_text())
source = Path('samples', provenance['sourceFile']).read_bytes()
assert hashlib.sha256(source).hexdigest() == provenance['sourceSha256']
sheet = Image.open(io.BytesIO(source))
assert sheet.size == (256, 256)
if sheet.info.get('icc_profile'):
    sheet = ImageCms.profileToProfile(sheet, ImageCms.ImageCmsProfile(io.BytesIO(sheet.info['icc_profile'])), ImageCms.createProfile('sRGB'), outputMode='RGBA')
assert len(provenance['files']) == 16
for i, record in enumerate(provenance['files']):
    data = Path('samples', record['file']).read_bytes()
    assert hashlib.sha256(data).hexdigest() == record['sha256']
    r = record['rectangle']
    assert r == {'left': (i % 4)*64, 'top': (i // 4)*64, 'width': 64, 'height': 64}
    tile = sheet.crop((r['left'], r['top'], r['left']+64, r['top']+64))
    assert canonical(tile) == canonical(Image.open(io.BytesIO(data))), f'tile {i+1}'
print('PASS: pinned real artwork SHA-256 and all 16 row-major tile appearances independently verified with Pillow')
