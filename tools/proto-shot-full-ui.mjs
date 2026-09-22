// PROTOTYPE — throwaway. Abre prototypes/full-ui.prototype.html (a UI real),
// carrega um par de logs pelos file inputs, classifica e printa a pagina inteira.
// Uso: node tools/proto-shot-full-ui.mjs "logs/sv.txt" "logs/lc.txt" saida.png [--charm]
import { chromium } from 'playwright';
import path from 'node:path';

const args = process.argv.slice(2);
const charm = args.includes('--charm');
const [sv, lc, out] = args.filter(a => a !== '--charm');
const url = 'file:///' + path.resolve('prototypes/full-ui.prototype.html').split(path.sep).join('/');

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1200 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(url);
await page.setInputFiles('#clsServerFileInput', path.resolve(sv));
await page.setInputFiles('#clsLocalFileInput', path.resolve(lc));
await page.waitForTimeout(800);
await page.click('#btnClassify');
await page.waitForSelector('#clsResults', { state: 'visible', timeout: 60000 });
await page.waitForTimeout(3000);
if (charm) { await page.click(".proto-switch-track"); await page.waitForTimeout(600); }
await page.screenshot({ path: out || 'proto-full-ui.png', fullPage: true });
console.log(errs.length ? 'ERROS:\n' + errs.join('\n') : 'sem erros de console');
await b.close();
