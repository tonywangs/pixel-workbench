import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verify, sha256 } from './independent.mjs';
import { controls } from './fixtures.mjs';
import { exportProject } from '../lib/animation.mjs';

const ready = page => expect(page.locator('#status')).toContainText(/Ready|Recovered/);
async function download(page, action, path) {
  const pending = page.waitForEvent('download'); await action();
  const item = await pending; await item.saveAs(path); return readFile(path);
}
async function edit(page, selector, value, message) {
  await page.locator(selector).fill(String(value)); await page.locator(selector).press('Tab');
  await expect(page.locator('#status')).toContainText(message);
}
test('real artwork: import, order, timing, undo, playback, recovery, reconnection and independently decoded export', async ({ page, browser }, info) => {
  await page.goto('/'); await ready(page);
  const files = Array.from({length:16}, (_, i) => resolve(`samples/frames/${String(i+1).padStart(2,'0')}.png`));
  await page.locator('#import').setInputFiles(files);
  await expect(page.locator('#status')).toContainText('Imported 16 frames');
  await expect(page.locator('#frames li')).toHaveCount(16);
  const firstId = await page.locator('#frames li').first().getAttribute('data-id');
  await page.getByRole('button', {name:'Move later frame 1',exact:true}).click();
  await expect(page.locator('#status')).toContainText('Order updated');
  expect(await page.locator('#frames li').nth(1).getAttribute('data-id')).toBe(firstId);
  await page.getByRole('button', {name:'Duplicate frame 2',exact:true}).click();
  await expect(page.locator('#frames li')).toHaveCount(17);
  await page.getByRole('button', {name:'Remove frame 3',exact:true}).click();
  await expect(page.locator('#frames li')).toHaveCount(16);
  await page.locator('#undo').click(); await expect(page.locator('#frames li')).toHaveCount(17);
  await edit(page, '[aria-label="Duration frame 1"]', 37, 'Duration updated');
  await edit(page, '[aria-label="Duration frame 2"]', 143, 'Duration updated');
  await edit(page, '#loop', 2, 'Loop updated');
  await page.locator('#play').click(); await expect(page.locator('#play')).toHaveText('Playing');
  await expect(page.locator('#position')).not.toHaveText('1 / 17');
  await page.locator('#pause').click(); await expect(page.locator('#play')).toHaveText('Play');
  const position = await page.locator('#position').textContent(); await page.waitForTimeout(150); await expect(page.locator('#position')).toHaveText(position);
  await page.getByRole('button', {name:'Inspect frame 1',exact:true}).click();
  await page.locator('#next').click(); await expect(page.locator('#position')).toHaveText('2 / 17');
  await page.locator('#previous').click(); await expect(page.locator('#position')).toHaveText('1 / 17');
  const before = JSON.parse(await download(page, () => page.locator('#save').click(), info.outputPath('project.json')));
  await page.reload(); await expect(page.locator('#status')).toContainText('Recovered 17');
  const recovered = JSON.parse(await download(page, () => page.locator('#save').click(), info.outputPath('recovered.json')));
  expect(recovered).toEqual(before);
  await page.locator('#new').click(); await expect(page.locator('#frames li')).toHaveCount(0);
  await page.locator('#open').setInputFiles(info.outputPath('project.json'));
  await expect(page.locator('#status')).toContainText('Opened portable project');
  const referencesPath = info.outputPath('references.json');
  await download(page, () => page.locator('#references').click(), referencesPath);
  await page.locator('#open').setInputFiles(referencesPath); await expect(page.locator('#status')).toContainText('17 missing');
  await expect(page.locator('#export')).toBeDisabled();
  // A valid but unrelated PNG must not substitute for a missing original.
  const control = await controls();
  await page.locator('#reconnect').setInputFiles({name:'wrong.png',mimeType:'image/png',buffer:Buffer.from(control.sources[control.frames[0].hash].data,'base64')});
  await expect(page.locator('#status')).toContainText('SHA-256 does not match');
  await page.locator('#reconnect').setInputFiles(files); await expect(page.locator('#status')).toContainText('Matching originals reconnected');
  const reconnected = JSON.parse(await download(page, () => page.locator('#save').click(), info.outputPath('reconnected.json')));
  expect(reconnected.frames).toEqual(before.frames); expect(reconnected.loop).toBe(2);
  for (const [hash,s] of Object.entries(before.sources)) expect(reconnected.sources[hash].data).toBe(s.data);
  await page.locator('#export').click(); await expect(page.locator('#status')).toContainText('Encoded 17 occurrences');
  const output = {};
  for (const name of ['animation.webp','playback.html','manifest.json']) output[name] = await download(page, () => page.getByRole('link',{name,exact:true}).click(), info.outputPath(name));
  const result = await verify(browser, output['animation.webp'], JSON.parse(output['manifest.json']), reconnected, output['playback.html']);
  // Open the downloaded, standalone file in a fresh browser context, outside the editor.
  const viewer = await browser.newPage(); await viewer.goto(`file://${info.outputPath('playback.html')}`);
  await expect(viewer.locator('img')).toBeVisible();
  expect(await viewer.locator('img').evaluate(img => img.complete && img.naturalWidth === 64)).toBe(true);
  await viewer.close();
  await mkdir('results',{recursive:true});
  await mkdir('results/workflow',{recursive:true});
  for(const [name,bytes] of Object.entries(output)) await writeFile(`results/workflow/${name}`,bytes);
  await writeFile('results/workflow/project.json',JSON.stringify(reconnected,null,2));
  await page.screenshot({path:'results/browser-workflow.png',fullPage:true});
  await writeFile('results/browser-verification.json', JSON.stringify({executedAt:new Date().toISOString(),browser:browser.version(),projectHash:sha256(Buffer.from(JSON.stringify(reconnected,null,2))),outputs:JSON.parse(output['manifest.json']).outputs,...result,workflow:['real PNG import','explicit reorder','duplicate occurrence','remove and undo','unequal duration','finite loop','play/pause/step','reload recovery','portable reopen','hash mismatch rejection','matching reconnection','three downloads','standalone file viewer']},null,2));
});

test('independent decoder checks labeled controls and loop boundaries', async ({browser}) => {
  const project = await controls();
  for (const loop of [0,1,2,65535]) {
    project.loop = loop; const result = await exportProject(project);
    await verify(browser,result.webp,result.manifest,project,result.specimen);
  }
  project.frames = [{...project.frames[0],duration:1}]; project.loop=1;
  const single=await exportProject(project);
  await verify(browser,single.webp,single.manifest,project,single.specimen);
});

test('invalid edits and inputs leave the current sequence intact', async ({page}) => {
  await page.goto('/'); await ready(page); await page.locator('#sample').click();
  await expect(page.locator('#frames li')).toHaveCount(16);
  await edit(page,'[aria-label="Duration frame 1"]',0,'Duration must');
  await expect(page.locator('[aria-label="Duration frame 1"]')).toHaveValue('100');
  await edit(page,'#loop',-1,'Total plays must'); await expect(page.locator('#loop')).toHaveValue('0');
  await page.locator('#import').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('invalid')});
  await expect(page.locator('#status')).toHaveClass('error'); await expect(page.locator('#frames li')).toHaveCount(16);
  await page.locator('#open').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":2}')});
  await expect(page.locator('#status')).toContainText('Invalid version'); await expect(page.locator('#frames li')).toHaveCount(16);
});

test('JPEG orientation and mixed dimensions through the browser, finite playback and export', async ({page,browser},info) => {
  const project = await controls();
  await page.goto('/'); await ready(page);
  await page.locator('#import').setInputFiles(project.frames.map((f,i)=>({name:`control-${i}.${i===3?'jpg':'png'}`,mimeType:i===3?'image/jpeg':'image/png',buffer:Buffer.from(project.sources[f.hash].data,'base64')})));
  await expect(page.locator('#status')).toContainText('Imported 4 frames');
  await expect(page.locator('#dimensions')).toHaveText('3 × 2 · 4 occurrences');
  await edit(page,'#loop',1,'Loop updated');
  await page.locator('#play').click();
  await expect(page.locator('#position')).toHaveText('4 / 4');
  await expect(page.locator('#play')).toHaveText('Play');
  const saved = JSON.parse(await download(page,()=>page.locator('#save').click(),info.outputPath('project.json')));
  expect(saved.frames[0].hash).toBe(saved.frames[1].hash); expect(saved.frames[0].id).not.toBe(saved.frames[1].id);
  await page.locator('#export').click(); await expect(page.locator('#status')).toContainText('Encoded 4 occurrences');
  const output={};
  for(const name of ['animation.webp','manifest.json','playback.html']) output[name]=await download(page,()=>page.getByRole('link',{name,exact:true}).click(),info.outputPath(name));
  await verify(browser,output['animation.webp'],JSON.parse(output['manifest.json']),saved,output['playback.html']);
});
