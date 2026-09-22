// PROTOTYPE — throwaway. Print recortado de uma seção (composicao/rotacao) da UI real
// com o switch ligado, pra conferir a marcação "+N" e a faixa vermelha.
import { chromium } from 'playwright';
import path from 'node:path';
const [sv, lc] = process.argv.slice(2);
const url = 'file:///' + path.resolve('prototypes/full-ui.prototype.html').split(path.sep).join('/');
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(url);
await page.setInputFiles('#clsServerFileInput', path.resolve(sv));
await page.setInputFiles('#clsLocalFileInput', path.resolve(lc));
await page.waitForTimeout(800);
await page.click('#btnClassify');
await page.waitForSelector('#clsResults', { state: 'visible', timeout: 60000 });
await page.waitForTimeout(2500);
await page.click('.proto-switch-track');
await page.waitForTimeout(800);
const share = await page.$('#clsResults .cls-share');
if (share) await share.screenshot({ path: 'proto-crop-share.png' });
const table = await page.$('#clsResults .cls-table-scroll');
if (table) await table.screenshot({ path: 'proto-crop-rotation.png' });
console.log('ok');
await b.close();
