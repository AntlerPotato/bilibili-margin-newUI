import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], results = [];
page.on('pageerror', e => errors.push(e.message));
try {
  for (const route of ['/', '/watch']) {
    await page.goto('http://127.0.0.1:4334' + route);
    const host = route === '/' ? '#margin-root' : '#margin-watch-top';
    const search = page.locator(host + ' .top .search');
    const cp = page.locator(host + ' .cp');
    await search.waitFor();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => window.previewSettings({ theme, paletteSpeed: 50 }), theme);
      await search.click();
      await page.waitForTimeout(80);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(60);
      const continuity = await page.evaluate(host => {
        const shell = document.querySelector(host).shadowRoot.querySelector('.cp-shell');
        const before = shell.getBoundingClientRect();
        dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        const after = shell.getBoundingClientRect();
        return Math.max(...['x', 'y', 'width', 'height'].map(k => Math.abs(before[k] - after[k])));
      }, host);
      assert.ok(continuity < 2, `reopening jumped ${continuity}px`);
      await page.waitForTimeout(900);
      assert.equal(await cp.getAttribute('data-open'), 'true');
      await page.locator(host + ' .cp-input input').fill('液态玻璃');
      assert.match(await page.locator(host + ' .cp-list').textContent(), /液态玻璃/);
      const popup = page.waitForEvent('popup');
      await page.locator(host + ' .cp-list .cp-item').first().click();
      const target = await popup;
      assert.equal(new URL(target.url()).searchParams.get('keyword'), '液态玻璃');
      await target.close();
      await cp.waitFor({ state: 'hidden' });
      await page.evaluate(() => window.previewSettings({ paletteSpeed: 200 }));
      await search.click();
      await page.waitForTimeout(300);
      assert.equal(await cp.evaluate(e => e.classList.contains('cp-clipping')), false);
      await page.keyboard.press('Escape');
      await cp.waitFor({ state: 'hidden' });
      await page.evaluate(() => window.previewSettings({ reduceMotion: true }));
      await search.click();
      assert.equal(await cp.evaluate(e => e.classList.contains('cp-clipping')), false);
      await page.keyboard.press('Escape');
      await cp.waitFor({ state: 'hidden' });
      await page.evaluate(() => window.previewSettings({ reduceMotion: false, paletteSpeed: 100 }));
      results.push({ route, theme, continuity, searchDestination: 'passed', speed: [50, 200], reducedMotion: 'passed' });
    }
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync('preview/evidence/interactions.json', JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results));
