import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const results = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  for (const path of ['/', '/watch']) {
    for (const style of ['classic', 'new']) {
      await page.goto(`http://127.0.0.1:4334${path}#${style}`);
      const host = path === '/' ? '#margin-root' : '#margin-watch-top';
      const search = page.locator(host + (style === 'classic' ? ' .top .hs-input' : ' .top .search'));
      await search.waitFor();
      if (style === 'classic') {
        await search.fill('lpl');
        assert.equal(await page.locator(host + ' .top .hs-btn').textContent(), '搜索');
        const popup = page.waitForEvent('popup');
        await page.locator(host + ' .top .hs-btn').click();
        const target = await popup;
        assert.equal(new URL(target.url()).searchParams.get('keyword'), 'lpl');
        await target.close();
        await search.focus();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator(host + ' .hero-search').getAttribute('data-open'), 'false');
        assert.equal(await page.locator(host + ' #hs-list').count(), 1);
      } else {
        const word = page.locator(host + ' .search-ph-w:not(.out)');
        await word.waitFor();
        const first = await word.textContent();
        await page.waitForTimeout(3600);
        assert.notEqual(await word.textContent(), first, 'hot search did not rotate');
        await page.evaluate(() => window.previewSettings({ uiEffects: false }));
        await page.waitForTimeout(500);
        const stopped = await word.textContent();
        await page.waitForTimeout(3400);
        assert.equal(await word.textContent(), stopped, 'disabled motion still rotates');
        await page.evaluate(() => window.previewSettings({ uiEffects: true }));
        await search.click();
        await page.locator(host + ' .cp').waitFor();
        await page.keyboard.press('Escape');
        await page.locator(host + ' .cp').waitFor({ state: 'hidden' });
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: `preview/evidence/${path === '/' ? 'home' : 'watch'}-${style}.png` });
      results.push({ path, style, passed: true });
    }
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync('preview/evidence/two-versions.json', JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results));
