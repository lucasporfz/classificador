// PROTOTYPE — throwaway. Sanity check da variante D (pagina inteira): PT, PT+charm, EN.
import { chromium } from 'playwright';
import path from 'node:path';
const url = 'file:///' + path.resolve('prototypes/session-overview.prototype.html').split(path.sep).join('/');
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1200 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(url + '?variant=D&s=0&lang=pt');
await page.waitForTimeout(700);
await page.screenshot({ path: 'proto-full-pt.png', fullPage: true });

await page.click('#charmToggle');
await page.waitForTimeout(500);
await page.screenshot({ path: 'proto-full-pt-charm.png', fullPage: true });

await page.goto(url + '?variant=D&s=1&lang=en');
await page.waitForTimeout(700);
await page.screenshot({ path: 'proto-full-en.png', fullPage: true });

console.log(errs.length ? 'ERROS:\n' + errs.join('\n') : 'sem erros de console');
await b.close();
