"""End-to-end interaction plus independent OpenCV verification of downloaded crops."""
import hashlib, json, os, pathlib, subprocess, sys, time, urllib.request
import cv2
import numpy as np
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH','/tmp/crop-browsers')
sys.path.insert(0,str(ROOT/'tests'))
from test_core import independent
out=ROOT/'.test-output';out.mkdir(exist_ok=True)
server=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--port','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(100):
  try:urllib.request.urlopen('http://127.0.0.1:8766');break
  except OSError:time.sleep(.1)
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8766')
  page.locator('#files').set_input_files(str(ROOT/'demo/photos/astronaut.png'))
  page.wait_for_function("document.querySelector('#status').textContent.includes('hash verified')")
  page.click('#add');page.fill('#name','Portrait');page.locator('#name').press('Tab');page.select_option('#aspect','4:5')
  assert int(page.input_value('#right'))*5==int(page.input_value('#bottom'))*4
  # Move and resize via actual mouse events.
  before=[page.input_value('#'+k) for k in ['left','top','right','bottom']]
  box=page.locator('#selection').bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']/2+20,box['y']+box['height']/2,steps=5);page.mouse.up()
  assert page.input_value('#left')!=before[0]
  handle=page.locator('[data-handle=se]').bounding_box();page.mouse.move(handle['x']+5,handle['y']+5);page.mouse.down();page.mouse.move(handle['x']-45,handle['y']-45,steps=5);page.mouse.up()
  r=[int(page.input_value('#'+k)) for k in ['left','top','right','bottom']];assert (r[2]-r[0])*5==(r[3]-r[1])*4
  page.select_option('#aspect','free')
  for k,v in zip(['left','top','right','bottom'],[20,30,220,330]):page.fill('#'+k,str(v))
  page.click('#apply');assert page.locator('#dimensions').inner_text().startswith('200 × 300')
  page.fill('#right','9999');page.click('#apply');assert 'Invalid' in page.locator('#status').inner_text();page.fill('#right','220');page.click('#apply')
  page.click('#add');page.fill('#name','Portrait');page.locator('#name').press('Tab');page.select_option('#aspect','3:2');page.click('#delete');assert page.locator('#crops button').count()==1;page.click('#undo');assert page.locator('#crops button').count()==2
  page.locator('#zoom').fill('150');page.locator('#zoom').dispatch_event('input');assert page.locator('#zoomLabel').inner_text()=='150%'
  with page.expect_download() as dl:page.click('#saveProject')
  project_path=out/'project.json';dl.value.save_as(project_path);saved=json.loads(project_path.read_text());assert len(saved['sources'][0]['crops'])==2
  page.reload();assert 'Reattach' in page.locator('#sources').inner_text();assert 'Reattach' in page.locator('#dimensions').inner_text();assert page.locator('#preview').evaluate('(c)=>c.width')==1;page.click('#export');page.wait_for_function("document.querySelector('#batchStatus').textContent.includes('2 failed')")
  # Wrong original cannot attach saved selections.
  page.locator('#files').set_input_files(str(ROOT/'demo/photos/coffee.png'));page.wait_for_function("document.querySelector('#status').textContent.includes('coffee.png')");assert page.locator('#crops button').count()==0
  page.locator('#projectFile').set_input_files(str(project_path));page.wait_for_function("document.querySelector('#status').textContent.includes('Project opened')")
  page.locator('#files').set_input_files(str(ROOT/'demo/photos/astronaut.png'));page.wait_for_function("document.querySelector('#status').textContent.includes('hash verified')");assert page.locator('#crops button').count()==2
  # A saved hash cannot lend credibility to tampered dimensions, even when already attached.
  tampered=json.loads(project_path.read_text());tampered['sources'][0]['width']=1024
  bad_project=out/'tampered.json';bad_project.write_text(json.dumps(tampered))
  page.locator('#projectFile').set_input_files(str(bad_project));page.wait_for_function("document.querySelector('#status').textContent.includes('dimensions do not match')")
  assert '512 × 512' in page.locator('#sourceInfo').inner_text()
  page.click('#export');page.wait_for_function("document.querySelector('#batchStatus').textContent.includes('Complete · 2 / 2')")
  with page.expect_download() as dl:page.locator('a[download="manifest.json"]').click()
  dl.value.save_as(out/'manifest.json');manifest=json.loads((out/'manifest.json').read_text());assert manifest['complete']
  src=independent((ROOT/'demo/photos/astronaut.png').read_bytes())
  for row in manifest['sources'][0]['results']:
   with page.expect_download() as dl:page.locator('a[download="'+row['file']+'"]').click()
   path=out/row['file'];dl.value.save_as(path);raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==row['sha256'];l,t,r,b=row['rect'];np.testing.assert_array_equal(independent(raw),src[t:b,l:r])
   # Browser's standalone image document, independent of the application preview.
   viewer=browser.new_page();viewer.goto(path.as_uri());viewer.wait_for_function('document.images[0].complete && document.images[0].naturalWidth > 0');assert viewer.locator('img').evaluate('(im)=>im.naturalWidth')==r-l;viewer.close()
  page.click('#demo');page.wait_for_function("document.querySelector('#status').textContent.includes('Six licensed')",timeout=60000)
  page.click('#export');page.wait_for_function("document.querySelector('#batchStatus').textContent.startsWith('Complete')",timeout=60000)
  with page.expect_download() as dl:page.locator('a[download="manifest.json"]').click()
  dl.value.save_as(out/'demo-manifest.json');demo=json.loads((out/'demo-manifest.json').read_text());assert demo['requested']==12
  sources={r['sha256']:ROOT/'demo/photos'/r['file'] for r in json.loads((ROOT/'demo/sources.json').read_text())}
  for s in demo['sources']:
   src=independent(sources[s['source_hash']].read_bytes())
   for row in s['results']:
    with page.expect_download() as dl:page.locator('a[download="'+row['file']+'"]').click()
    path=out/row['file'];dl.value.save_as(path);l,t,r,b=row['rect'];np.testing.assert_array_equal(independent(path.read_bytes()),src[t:b,l:r]);assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
  # Keep the visible demo screenshot focused on the full portrait composition.
  page.locator('#crops button').nth(1).click()
  page.screenshot(path=str(ROOT/'demo/workbench.png'),full_page=True)
  assert not errors,errors
  browser.close()
 print('PASS: Chromium import, pointer move/resize, numeric edit/rejection, aspect, undo, zoom, project save/import, reload/hash recovery, partial export, 12 real-demo crops independently decoded, output viewer')
finally:server.terminate();server.wait()
