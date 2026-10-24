import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('demo/manifest.json'));
const digest=b=>createHash('sha256').update(b).digest('hex');
const file=name=>'demo/images/'+name;
async function exported(page,button){const pending=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();const download=await pending;return readFile(await download.path(),'utf8');}
test('real import, inspection, decisions, reload, JSON roundtrip, source checks and standalone report',async({page,browser})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.locator('#photos').setInputFiles(manifest.files.map(f=>file(f.file)));
 await expect(page.getByRole('status')).toContainText(`Import finished: ${manifest.files.length}`,{timeout:60000});
 await expect(page.locator('.ledger-row')).toHaveCount(manifest.files.length);
 const bytePair=page.locator('.pair').filter({hasText:'astronaut.png ↔ control-byte-copy.png'});await bytePair.click();
 await expect(page.locator('.evidence')).toContainText('Identical bytes');
 await expect(page.locator('.photos img')).toHaveCount(2);
 await page.locator('#note').fill('Verified exact duplicate; retain original PNG.');
 await page.getByRole('button',{name:'Keep left · right redundant',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Saved in this browser');
 const saved=JSON.parse(await exported(page,'Export JSON project'));
 const choice=Object.values(saved.decisions)[0];expect(choice.choice).toBe('keep-left');
 await page.reload();await expect(page.getByRole('status')).toContainText('Recovered saved project');
 await page.locator('.pair').filter({hasText:'astronaut.png ↔ control-byte-copy.png'}).click();
 await expect(page.locator('#note')).toHaveValue(choice.note);
 await expect(page.locator('[data-choice="keep-left"]')).toHaveClass('chosen');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'New project',exact:true}).click();
 await expect(page.locator('.ledger-row')).toHaveCount(0);
 await page.locator('#project').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await expect(page.locator('.ledger-row')).toHaveCount(manifest.files.length);
 await page.locator('.pair').filter({hasText:'astronaut.png ↔ control-byte-copy.png'}).click();
 await expect(page.locator('#note')).toHaveValue(choice.note);
 await page.locator('#verify').setInputFiles([
  {name:'astronaut.png',mimeType:'image/png',buffer:await readFile(file('astronaut.png'))},
  {name:'coffee.png',mimeType:'image/png',buffer:await readFile(file('astronaut.png'))}
 ]);
 await expect(page.getByRole('status')).toContainText('Source check complete');
 await expect(page.locator('.ledger-row').filter({hasText:'coffee.png'})).toContainText('changed');
 await expect(page.locator('.ledger-row').filter({hasText:'launch-1.jpg'})).toContainText('missing');
 await expect(page.locator('.ledger-row').filter({hasText:'astronaut.png'})).toContainText('verified');
 const json=JSON.parse(await exported(page,'Export JSON project'));
 expect(json.decisions).toEqual(saved.decisions);expect(json.pairs).toHaveLength(manifest.files.length*(manifest.files.length-1)/2);
 const html=await exported(page,'Export HTML report');expect(html).toContain(choice.note);expect(html).toContain(saved.files[0].sha256);
 const offline=await browser.newContext({offline:true});const report=await offline.newPage();await report.setContent(html);
 await expect(report.getByRole('heading',{name:'Photo review report',exact:true})).toBeVisible();
 expect(await report.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 await offline.close();
 expect(errors).toEqual([]);
 for(const row of manifest.files)expect(digest(await readFile(file(row.file)))).toBe(row.sha256);
});
test('demo loads real provenance; rejected files and hostile imports are explicit',async({page,request})=>{
 await page.goto('/');await page.getByRole('button',{name:'Load real-image demo',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Import finished',{timeout:60000});
 await expect(page.locator('.ledger-row')).toHaveCount(manifest.files.length);
 await page.locator('#filter').selectOption('all');
 await page.locator('.pair').filter({hasText:'launch-2.jpg ↔ launch-4.jpg'}).click();
 await expect(page.locator('.evidence')).toContainText('Outside threshold');
 await mkdir('results',{recursive:true});await page.screenshot({path:'results/browser-demo.png',fullPage:true});
 await page.locator('#photos').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('bad')});
 await expect(page.locator('.ledger-row').last()).toContainText('rejected');
 const before=await page.locator('.ledger-row').count();
 await page.locator('#project').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"bad"}')});
 await expect(page.getByRole('status')).toContainText('Invalid or incompatible');expect(await page.locator('.ledger-row').count()).toBe(before);
 expect((await request.get('/.git/config')).status()).toBe(404);
 expect((await request.post('/api/analyze',{headers:{Origin:'https://external.example','Content-Type':'application/octet-stream'},data:await readFile(file('astronaut.png'))})).status()).toBe(403);
});
test('unavailable persistence stays visibly unsaved after import and allows backup',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:{open(){throw Error('storage denied by test');}}}));
 await page.goto('/');await page.locator('#photos').setInputFiles([file('astronaut.png'),file('control-byte-copy.png')]);
 await expect(page.getByRole('status')).toContainText('Import finished');
 await expect(page.getByRole('status')).toContainText('NOT SAVED');
 await page.getByRole('button',{name:'Keep both',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('NOT SAVED');
 const backup=JSON.parse(await exported(page,'Export JSON project'));
 expect(backup.files).toHaveLength(2);expect(Object.values(backup.decisions)[0].choice).toBe('keep-both');
});
test('structurally incomplete import preserves the working project',async({page})=>{
 await page.goto('/');await page.locator('#photos').setInputFiles([file('astronaut.png'),file('control-byte-copy.png')]);
 await expect(page.getByRole('status')).toContainText('Import finished');
 const backup=JSON.parse(await exported(page,'Export JSON project'));delete backup.files[0].bytes;
 await page.locator('#project').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.getByRole('status')).toContainText('Invalid or incompatible');
 await expect(page.locator('.photos img')).toHaveCount(2);
});
