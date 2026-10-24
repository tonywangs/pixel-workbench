"""Independent Pillow source normalization and composited WebP timeline check.
No imports from the application. Receives a JSON bundle on stdin from verify.mjs.
"""
import base64
import hashlib
import io
import json
import sys
from PIL import Image, ImageCms, ImageOps, features


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(image):
    data = bytearray(image.convert('RGBA').tobytes())
    for i in range(0, len(data), 4):
        if data[i + 3] == 0:
            data[i:i + 3] = b'\0\0\0'
    return bytes(data)


def verify(bundle):
    project, manifest = bundle['project'], bundle['manifest']
    webp = base64.b64decode(bundle['webp'], validate=True)
    assert digest(webp) == manifest['outputs']['animation.webp'], 'output hash'
    width, height = manifest['width'], manifest['height']
    sources = {}
    for key in {f['hash'] for f in project['frames']}:
        original = base64.b64decode(project['sources'][key]['data'], validate=True)
        assert digest(original) == key, 'original hash'
        image = Image.open(io.BytesIO(original))
        jpeg = image.format == 'JPEG'
        orientation = image.getexif().get(274, 1)
        image = ImageOps.exif_transpose(image)
        profile = image.info.get('icc_profile')
        if profile:
            image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile('sRGB'), outputMode='RGBA')
        image = image.convert('RGBA')
        canvas = Image.new('RGBA', (width, height))
        canvas.paste(image, (0, 0))  # Do not alpha-composite: retain straight alpha.
        sources[key] = (canonical(canvas), image.size, orientation, jpeg)
    assert (max(s[1][0] for s in sources.values()), max(s[1][1] for s in sources.values())) == (width, height), 'common canvas'
    animation = Image.open(io.BytesIO(webp))
    assert animation.size == (width, height), 'decoded dimensions'
    assert animation.info['loop'] == project['loop'] == manifest['loop'], 'loop'
    actual = []
    for i in range(animation.n_frames):
        animation.seek(i)
        animation.load()
        actual.append((canonical(animation), animation.info['duration']))
    assert len(project['frames']) == len(manifest['frames']), 'occurrence accounting'
    j, position, end = 0, 0, actual[0][1]
    for i, frame in enumerate(project['frames']):
        record = manifest['frames'][i]
        assert (record['id'], record['sourceHash'], record['duration']) == (frame['id'], frame['hash'], frame['duration']), 'ordered occurrence'
        expected, size, orientation, jpeg = sources[frame['hash']]
        assert size == (record['sourceWidth'], record['sourceHeight']), 'oriented dimensions'
        assert orientation == record['orientationApplied'], 'orientation transformation'
        assert record['placement'] == {'x': 0, 'y': 0}, 'placement'
        target = position + frame['duration']
        while position < target:
            while position >= end:
                j += 1
                assert j < len(actual), 'missing decoded time'
                end += actual[j][1]
            pixels = actual[j][0]
            assert digest(pixels) == record['normalizedRgbaHash'], f'manifest pixels occurrence {i+1}'
            if jpeg:
                assert all(abs(a-b) <= (0 if c % 4 == 3 else 3) for c, (a, b) in enumerate(zip(pixels, expected))), f'JPEG source appearance {i+1}'
            else:
                assert pixels == expected, f'exact PNG source appearance {i+1}'
            position = min(target, end)
    assert position == sum(d for _, d in actual) == manifest['totalDuration'], 'total duration'
    return {'decoder': 'Pillow ' + Image.__version__, 'libwebp': features.version('webp'), 'encodedFrames': len(actual), 'exactManifestPixels': True, 'independentOriginalAppearance': True, 'pngTolerance': 0, 'jpegRgbTolerance': 3, 'totalDurationMs': position}


if __name__ == '__main__':
    print(json.dumps(verify(json.load(sys.stdin))))
