import { chromium } from 'playwright';

const SERVER = 'logs/bakradrone server log.txt';
const LOCAL = 'logs/bakradrone local chat.txt';

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://127.0.0.1:5599/index.html', { waitUntil: 'networkidle' });

await page.setInputFiles('#clsServerFileInput', SERVER);
await page.setInputFiles('#clsLocalFileInput', LOCAL);
await page.waitForTimeout(500);
await page.click('#btnClassify');
await page.waitForSelector('#clsResults', { state: 'visible', timeout: 15000 });
await page.waitForTimeout(2500); // deixa os charts renderizarem

const status = await page.textContent('#clsStatus');
console.log('status:', status.trim());

await page.screenshot({ path: 'tools/bakradrone-full.png', fullPage: true });

// recorte só da tabela de rotação
const results = await page.$('#clsResults');
await results.screenshot({ path: 'tools/bakradrone-results.png' });

if (errs.length) console.log('console errors:', errs.slice(0, 5));
await b.close();
console.log('done');
