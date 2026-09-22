// PROTOTYPE — throwaway. Confere que o switch propaga o charm para as MESMAS seções
// da UI real: composicao (headline + donut), tabela de rotacao e grafico de dano.
import { chromium } from 'playwright';
import path from 'node:path';
const [sv, lc] = process.argv.slice(2);
const url = 'file:///' + path.resolve('prototypes/full-ui.prototype.html').split(path.sep).join('/');
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(url);
await page.setInputFiles('#clsServerFileInput', path.resolve(sv));
await page.setInputFiles('#clsLocalFileInput', path.resolve(lc));
await page.waitForTimeout(800);
await page.click('#btnClassify');
await page.waitForSelector('#clsResults', { state: 'visible', timeout: 60000 });
await page.waitForTimeout(2500);

const grab = () => page.evaluate(() => {
  const head = document.querySelector('.cls-share-headline');
  const table = document.querySelector('#clsResults .cls-rotation-table');
  const rows = [].slice.call(table.querySelectorAll('tbody tr')).map(tr =>
    [].map.call(tr.children, td => td.textContent.trim()));
  return { headline: head ? head.textContent.replace(/\s+/g, ' ').trim() : null, rows };
});

const off = await grab();
await page.click('.proto-switch-track');
await page.waitForTimeout(900);
const on = await grab();

console.log('OFF headline:', off.headline);
console.log('ON  headline:', on.headline);
console.log('\nlinha a linha (componente | OFF dano total | ON dano total):');
off.rows.forEach((r, i) => {
  if (!on.rows[i] || r.length < 3) return;
  const a = r[r.length - 1], c = on.rows[i][on.rows[i].length - 1];
  if (a !== c) console.log('  ' + r[0] + '  |  ' + a + '  ->  ' + c);
});
console.log(errs.length ? '\nERROS:\n' + errs.join('\n') : '\nsem erros de console');
await b.close();
