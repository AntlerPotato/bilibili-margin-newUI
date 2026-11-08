import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('preview/evidence', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
try {
  for (const route of ['/', '/watch']) {
    await page.goto('http://127.0.0.1:4334' + route);
    const root = route === '/' ? '#margin-root' : '#margin-watch-top';
    await page.locator(`${root} .top .search`).waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `preview/evidence/${route === '/' ? 'home' : 'watch'}-closed.png` });
    await page.locator(`${root} .top .search`).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `preview/evidence/${route === '/' ? 'home' : 'watch'}-open.png` });
    const panel = page.locator(`${root} .cp-panel`);
    const box = await panel.boundingBox();
    results.push({ route, box, visible: await panel.isVisible() });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    if (await page.locator(`${root} .cp`).isVisible()) throw new Error('Escape did not close ' + route);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  writeFileSync('preview/evidence/check.json', JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results));
