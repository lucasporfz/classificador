// PROTOTYPE — throwaway. Sanity check: abre as 3 variantes e tira print.
import { chromium } from 'playwright';
import path from 'node:path';
const url = 'file:///' + path.resolve('prototypes/session-overview.prototype.html').replace(/\\/g, '/');
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1200 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
for (const v of ['A', 'B', 'C', 'D']) {
  await page.goto(url + '?variant=' + v + '&s=0');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'proto-overview-' + v + '.png', fullPage: true });
}
console.log(errs.length ? 'ERROS:\n' + errs.join('\n') : 'sem erros de console');
await b.close();
