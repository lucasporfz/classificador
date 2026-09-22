// PROTOTYPE — throwaway. Gera um print da composição + rotação para cada cor
// candidata de charm (?charm=<hex>), para escolher no olho.
import { chromium } from 'playwright';
import path from 'node:path';

const COLORS = process.argv.slice(4).length ? process.argv.slice(4) : ['FFFFFF', 'FF3DCB', 'A3E635', '22D3EE'];
const [sv, lc] = process.argv.slice(2);
const base = 'file:///' + path.resolve('prototypes/full-ui.prototype.html').split(path.sep).join('/');
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });

for (const hex of COLORS) {
  await page.goto(base + '?charm=' + hex);
  await page.setInputFiles('#clsServerFileInput', path.resolve(sv));
  await page.setInputFiles('#clsLocalFileInput', path.resolve(lc));
  await page.waitForTimeout(700);
  await page.click('#btnClassify');
  await page.waitForSelector('#clsResults', { state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.click('.proto-switch-track');
  await page.waitForTimeout(700);
  const rect = await page.evaluate(() => {
    const share = document.querySelector('#clsResults .cls-share');
    const tbl = document.querySelector('#clsResults .cls-table-scroll');
    const a = share.getBoundingClientRect(), z = tbl.getBoundingClientRect();
    return { x: 0, y: a.top + window.scrollY - 34, width: document.body.clientWidth, height: (z.bottom + window.scrollY) - (a.top + window.scrollY) + 44 };
  });
  // fullPage + clip exige a pagina inteira renderizada; sem isso o clip cai fora da imagem
  await page.screenshot({ path: 'proto-charmcolor-' + hex + '.png', clip: rect, fullPage: true });
  console.log('proto-charmcolor-' + hex + '.png');
}
await b.close();
