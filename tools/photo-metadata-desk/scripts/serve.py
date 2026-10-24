"""Loopback-only, read-only static server with explicit public routes."""
import http.server
from pathlib import Path
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parents[1]
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        routes = {'/': 'web/index.html', '/app.js':'web/app.js', '/jpeg.js':'web/jpeg.js', '/style.css':'web/style.css', '/exif-reader.js':'node_modules/exifreader/dist/exif-reader.js', '/provenance.json':'provenance.json'}
        if path in ['/data/iguana.jpg','/data/gps.jpg','/data/anolis.jpg']: routes[path]=path[1:]
        if path not in routes: self.send_error(404); return
        f=ROOT/routes[path]
        if not f.is_file(): self.send_error(404, 'Run npm ci and python3 scripts/acquire.py'); return
        data=f.read_bytes();self.send_response(200)
        self.send_header('Content-Type', {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.json':'application/json'}[f.suffix])
        self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; object-src 'none'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
if __name__=='__main__':
    print('Photo Metadata Desk: http://127.0.0.1:18766',flush=True)
    http.server.HTTPServer(('127.0.0.1',18766), Handler).serve_forever()
