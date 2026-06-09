import { chromium } from 'playwright';

const LOGS = 'C:/Users/Lucas/Desktop/classificador/logs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://127.0.0.1:5599/');
await page.waitForLoadState('networkidle');

// --- T1: 1+1 sessão → sem picker, classify funciona ---
await page.locator('#clsServerFileInput').setInputFiles(LOGS + '/server log rp.txt');
await page.locator('#clsLocalFileInput').setInputFiles(LOGS + '/localchat rp.txt');
await page.waitForTimeout(400);
const t1Visible = await page.locator('#clsPairSelect').isVisible();
console.log('T1 — 1+1 sessão, sem picker:', !t1Visible ? 'PASS' : 'FAIL');
await page.locator('#btnClassify').click();
await page.waitForTimeout(600);
const t1Status = await page.locator('#clsStatus').textContent();
console.log('T1 — classify funciona:', t1Status === 'pronto' ? 'PASS' : 'FAIL (' + t1Status + ')');

// --- T2: 2+2 sessões → picker com 2 pares ---
await page.reload();
await page.waitForLoadState('networkidle');
await page.locator('#clsServerFileInput').setInputFiles(LOGS + '/_test_sv_multi.txt');
await page.locator('#clsLocalFileInput').setInputFiles(LOGS + '/_test_lc_multi.txt');
await page.locator('#clsPairSelect').waitFor({ state: 'visible', timeout: 3000 });
const t2Count = await page.locator('#clsPairSelect option').count();
console.log('T2 — picker com 2 pares:', t2Count === 2 ? 'PASS' : 'FAIL (' + t2Count + ')');

const opt0 = await page.locator('#clsPairSelect option').nth(0).textContent();
const opt1 = await page.locator('#clsPairSelect option').nth(1).textContent();
console.log('  par 0:', opt0);
console.log('  par 1:', opt1);

// --- T3: trocar par atualiza AMBAS as textareas ---
const svBefore = (await page.locator('#clsServerInput').evaluate(el => el.value)).split('\n')[0];
const lcBefore = (await page.locator('#clsLocalInput').evaluate(el => el.value)).split('\n')[0];
await page.locator('#clsPairSelect').selectOption('1');
await page.waitForTimeout(100);
const svAfter = (await page.locator('#clsServerInput').evaluate(el => el.value)).split('\n')[0];
const lcAfter = (await page.locator('#clsLocalInput').evaluate(el => el.value)).split('\n')[0];
console.log('T3 — trocar par atualiza server log:', svBefore !== svAfter ? 'PASS' : 'FAIL');
console.log('T3 — trocar par atualiza local chat:', lcBefore !== lcAfter ? 'PASS' : 'FAIL');
console.log('  sv par 0 header:', svBefore.slice(0, 55));
console.log('  sv par 1 header:', svAfter.slice(0, 55));

// --- T4: classify com par selecionado funciona ---
await page.locator('#clsPairSelect').selectOption('0');
await page.waitForTimeout(100);
await page.locator('#btnClassify').click();
await page.waitForTimeout(600);
const t4Status = await page.locator('#clsStatus').textContent();
console.log('T4 — classify com par selecionado:', t4Status === 'pronto' ? 'PASS' : 'FAIL (' + t4Status + ')');

if (errors.length) console.log('Erros JS:', errors);
await browser.close();
