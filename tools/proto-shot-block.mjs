// PROTOTYPE — throwaway. Print recortado só do bloco novo (#protoSummary) + o que
// vem logo abaixo, pra conferir espaçamento sem rolar a pagina inteira.
import { chromium } from 'playwright';
import path from 'node:path';
const [sv, lc, out] = process.argv.slice(2);
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
const rect = await page.evaluate(() => {
  const el = document.getElementById('protoSummary');
  const r = el.getBoundingClientRect();
  return { x: 0, y: r.top + window.scrollY - 10, width: document.body.clientWidth, height: r.height + 220 };
});
await page.screenshot({ path: out || 'proto-block.png', clip: rect });
console.log('ok');
await b.close();
