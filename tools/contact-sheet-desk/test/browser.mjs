import {chromium} from 'playwright';
import {app} from '../server.js';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {hash} from '../core.js';
import {fixtures} from './fixtures.mjs';
await mkdir('results/browser',{recursive:true});await fixtures();
const sourceNames=(await readdir('demo/images')).sort();const before=await Promise.all(sourceNames.map(async n=>hash(await readFile('demo/images/'+n))));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
 // Real folder import, not only the demo endpoint.
 await page.locator('#folder').setInputFiles(resolve('demo/images'));await page.waitForFunction(()=>document.querySelectorAll('.card').length===24&&document.querySelector('#status').textContent.startsWith('Saved'));
 console.log('Browser: imported real folder');
 const initial=await page.locator('.card').evaluateAll(cards=>cards.map(c=>c.dataset.id));assert.equal(initial.length,24);
 await page.locator('.card[data-id="S0002"] input[type=checkbox]').uncheck();
 await page.getByLabel('Move S0004 earlier',{exact:true}).click();
 await page.getByLabel('Position of S0024',{exact:true}).fill('1');await page.getByLabel('Position of S0024',{exact:true}).press('Tab');
 await page.locator('#columns').selectOption('3');await page.locator('#rows').selectOption('3');await page.locator('#labels').selectOption('path');
 console.log('Browser: selected and reordered');
 const expected=await page.locator('.card.selected').evaluateAll(cards=>cards.map(c=>c.dataset.id));assert.equal(expected.length,23);assert.equal(expected[0],'S0024');assert.equal(expected[2],'S0004');
 await page.waitForTimeout(300);await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Recovered'));
 assert.deepEqual(await page.locator('.card.selected').evaluateAll(cards=>cards.map(c=>c.dataset.id)),expected);assert.equal(await page.locator('#rows').inputValue(),'3');
 await page.locator('.thumb').first().click();assert.equal(await page.locator('#viewer').evaluate(e=>e.open),true);await page.locator('#close-viewer').click();
 console.log('Browser: reload recovered');
 const dl=page.waitForEvent('download');await page.locator('#save').click();await (await dl).saveAs('results/browser/project.json');
 const saved=JSON.parse(await readFile('results/browser/project.json'));assert.deepEqual(saved.order,expected);assert.equal(saved.files.length,24);
 await page.locator('#none').click();assert.equal(await page.locator('.card.selected').count(),0);
 await page.locator('#project').setInputFiles(resolve('results/browser/project.json'));await page.waitForFunction(()=>document.querySelectorAll('.card.selected').length===23&&document.querySelector('#status').textContent.startsWith('Saved'));
 assert.deepEqual(await page.locator('.card.selected').evaluateAll(cards=>cards.map(c=>c.dataset.id)),expected);
 for(const paper of ['A4','Letter']){
  console.log('Browser: export',paper);
  await page.locator('#paper').selectOption(paper);await page.locator('#export').click();await page.waitForFunction(()=>document.querySelectorAll('#downloads a').length===2);
  for(const type of ['contact-sheet','manifest']){const d=page.waitForEvent('download');await page.locator(`#downloads a[download^="${type}"]`).click();await (await d).saveAs(`results/demo-${paper}.${type==='manifest'?'json':'pdf'}`);}
  const m=JSON.parse(await readFile(`results/demo-${paper}.json`));assert.deepEqual(m.selected.map(s=>s.id),expected);assert.equal(m.pages,3);assert.equal(m.inputs.filter(x=>x.status==='excluded').length,1);
 }
 await page.screenshot({path:'results/workbench.png',fullPage:true});
 console.log('Browser: real PDFs downloaded');
 // Every discovered edge-case file is accounted for, including rejected inputs.
 await page.locator('#folder').setInputFiles(resolve('results/fixtures'));await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Saved')&&document.querySelector('#audit-count').textContent.includes('16'));
 assert.equal(await page.locator('.card').count(),13);assert.equal(await page.locator('#audit-list li').count(),16);
 const fd=page.waitForEvent('download');await page.locator('#save').click();await (await fd).saveAs('results/browser/fixtures-project.json');
 await page.locator('#columns').selectOption('4');await page.locator('#rows').selectOption('5');
 for(const paper of ['A4','Letter']){
  console.log('Browser: export',paper);
  await page.locator('#paper').selectOption(paper);await page.locator('#export').click();await page.waitForFunction(()=>document.querySelectorAll('#downloads a').length===2);
  for(const type of ['contact-sheet','manifest']){const d=page.waitForEvent('download');await page.locator(`#downloads a[download^="${type}"]`).click();await (await d).saveAs(`results/fixtures-${paper}.${type==='manifest'?'json':'pdf'}`);}
 }
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===24&&document.querySelector('#status').textContent.startsWith('Saved'));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'results/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);const after=await Promise.all(sourceNames.map(async n=>hash(await readFile('demo/images/'+n))));assert.deepEqual(after,before);
 console.log('PASS browser: real folder import, inspect, select, reorder, reload, portable project, A4/Letter exports, 16 controlled fixtures, demo, mobile, original hashes unchanged');
 await writeFile('results/browser/evidence.json',JSON.stringify({realImages:24,selected:expected,papers:['A4','Letter'],pages:3,fixtures:16,sourceHashesUnchanged:true,browserErrors:errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
