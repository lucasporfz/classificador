import { chromium } from 'playwright';

const LOGS = 'C:/Users/Lucas/Desktop/classificador/logs';
const SS_OUT = 'C:/Users/Lucas/Desktop/classificador/_verify_screenshot.png';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://127.0.0.1:5599/');
await page.waitForLoadState('networkidle');

// --- Test 1: single-session file — picker should stay hidden ---
await page.locator('#clsServerFileInput').setInputFiles(LOGS + '/server log rp.txt');
const singleVisible = await page.locator('#clsServerSessionSelect').isVisible();
console.log('Test 1 — single session, picker hidden:', !singleVisible ? 'PASS' : 'FAIL');
const singleTextLen = await page.locator('#clsServerInput').evaluate(el => el.value.length);
console.log('Test 1 — textarea populated:', singleTextLen > 100 ? 'PASS (' + singleTextLen + ' chars)' : 'FAIL');

// --- Test 2: multi-session file — picker should appear with 2 options ---
await page.locator('#clsServerFileInput').setInputFiles(LOGS + '/_test_multi_server.txt');
await page.locator('#clsServerSessionSelect').waitFor({ state: 'visible', timeout: 3000 });
const multiVisible = await page.locator('#clsServerSessionSelect').isVisible();
console.log('Test 2 — multi session, picker visible:', multiVisible ? 'PASS' : 'FAIL');

const optCount = await page.locator('#clsServerSessionSelect option').count();
console.log('Test 2 — option count = 2:', optCount === 2 ? 'PASS' : 'FAIL (' + optCount + ')');

const opt0 = await page.locator('#clsServerSessionSelect option').nth(0).textContent();
const opt1 = await page.locator('#clsServerSessionSelect option').nth(1).textContent();
console.log('  option 0:', opt0);
console.log('  option 1:', opt1);

// --- Test 3: switching session updates textarea ---
const before = await page.locator('#clsServerInput').evaluate(el => el.value.split('\n')[0]);
await page.locator('#clsServerSessionSelect').selectOption('1');
const after = await page.locator('#clsServerInput').evaluate(el => el.value.split('\n')[0]);
console.log('Test 3 — session switch updates textarea:', before !== after ? 'PASS' : 'FAIL');
console.log('  session 0 header:', before.slice(0, 60));
console.log('  session 1 header:', after.slice(0, 60));

// --- Test 4: back to single session clears picker ---
await page.locator('#clsServerFileInput').setInputFiles(LOGS + '/server log rp.txt');
await page.locator('#clsServerSessionSelect').waitFor({ state: 'hidden', timeout: 3000 });
const afterSingle = await page.locator('#clsServerSessionSelect').isVisible();
console.log('Test 4 — reload single, picker hidden again:', !afterSingle ? 'PASS' : 'FAIL');

// --- Test 5: single-session classify still works end-to-end ---
await page.locator('#clsServerFileInput').setInputFiles(LOGS + '/server log rp.txt');
await page.locator('#clsLocalFileInput').setInputFiles(LOGS + '/localchat rp.txt');
await page.locator('#btnClassify').click();
await page.waitForTimeout(800);
const status = await page.locator('#clsStatus').textContent();
const resultsVisible = await page.locator('#clsResults').isVisible();
console.log('Test 5 — single-session classify end-to-end:', !status.includes('erro') && resultsVisible ? 'PASS' : 'FAIL');
console.log('  status:', status);

// Screenshot with picker visible
await page.locator('#clsServerFileInput').setInputFiles(LOGS + '/_test_multi_server.txt');
await page.screenshot({ path: SS_OUT, fullPage: false, clip: { x: 0, y: 0, width: 960, height: 130 } });
console.log('Screenshot saved:', SS_OUT);

if (errors.length) console.log('Console errors:', errors);
await browser.close();
