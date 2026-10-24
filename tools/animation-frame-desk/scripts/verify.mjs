import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { verify } from '../tests/independent.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= 'node_modules/.cache/ms-playwright';
const [projectPath = 'samples/project.json', webpPath = 'samples/animation.webp', manifestPath = 'samples/manifest.json', specimenPath = 'samples/playback.html'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
try {
  console.log(JSON.stringify(await verify(browser, await readFile(webpPath), JSON.parse(await readFile(manifestPath)), JSON.parse(await readFile(projectPath)), await readFile(specimenPath)), null, 2));
} finally { await browser.close(); }
