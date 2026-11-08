import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = 'preview/evidence'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
const pass = name => { results.push(name); console.log(`PASS ${name}`); };
try {
  await page.goto('http://127.0.0.1:4335/');
  const cards = page.locator('#margin-root .home-grid .card:not(.sk)');
  await cards.nth(11).waitFor();
  const first = () => cards.first().locator('.cover').getAttribute('href');
  const a = await first();
  await page.getByRole('button', { name: '下一批', exact: true }).click();
  await page.waitForFunction(a => document.querySelector('#margin-root').shadowRoot.querySelector('.home-grid .cover').href !== a, a);
  const b = await first();
  await page.getByRole('button', { name: '上一批', exact: true }).click();
  await page.waitForFunction(a => document.querySelector('#margin-root').shadowRoot.querySelector('.home-grid .cover').href === a, a);
  await page.getByRole('button', { name: '下一批', exact: true }).click();
  await page.waitForFunction(b => document.querySelector('#margin-root').shadowRoot.querySelector('.home-grid .cover').href === b, b);
  pass('上一批与下一批可恢复同一批视频');
  assert.ok(await page.locator('.card-followed').count());
  assert.equal(await cards.first().locator('.author').evaluate(el => getComputedStyle(el).fontSize), '14px');
  await page.evaluate(() => Promise.race([
    Promise.allSettled([...document.querySelector('#margin-root').shadowRoot.querySelectorAll('.home-grid img')].map(img => img.decode())),
    new Promise(resolve => setTimeout(resolve, 8000)),
  ]));
  await page.screenshot({ path: `${out}/home-dark.png` });
  pass('UP 名称和已关注标识');
  await page.getByLabel('慢加载', { exact: true }).check();
  await page.getByRole('button', { name: '换一批', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '下一批', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '下一批', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#margin-root').shadowRoot.querySelector('.batch-btn:last-child').disabled);
  pass('慢请求期间导航禁用并在完成后恢复');
  await page.getByLabel('慢加载', { exact: true }).uncheck();
  const beforeFailure = await first();
  await page.getByLabel('模拟失败', { exact: true }).check();
  await page.getByRole('button', { name: '换一批', exact: true }).click();
  await page.getByText(/换一批失败/).waitFor({ timeout: 12000 });
  assert.equal(await first(), beforeFailure);
  await page.getByLabel('模拟失败', { exact: true }).uncheck();
  await page.getByRole('button', { name: '换一批', exact: true }).click();
  await page.waitForFunction(href => document.querySelector('#margin-root').shadowRoot.querySelector('.home-grid .cover').href !== href, beforeFailure);
  pass('失败保留当前批次并可重新加载');
  await page.evaluate(() => window.previewSettings({ theme: 'light' }));
  await page.waitForTimeout(900); await page.screenshot({ path: `${out}/home-light.png` });
  await page.goto('http://127.0.0.1:4335/watch');
  await page.locator('#margin-watch-top .top').waitFor();
  const like = page.getByRole('button', { name: '点赞', exact: true });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.video-like')).backgroundColor === 'rgba(0, 0, 0, 0)');
  assert.equal(await like.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await like.click(); assert.equal(await like.getAttribute('aria-pressed'), 'true');
  const comments = page.locator('.preview-comment');
  assert.equal(await comments.nth(0).locator('.preview-location').textContent(), 'IP属地：浙江');
  assert.equal(await comments.nth(2).locator('.preview-location').count(), 0);
  await page.getByRole('button', { name: '展开回复', exact: true }).click();
  assert.equal(await comments.first().locator('.preview-replies').isVisible(), true);
  await page.getByRole('button', { name: '收起回复', exact: true }).click();
  await comments.first().getByRole('button', { name: '回复', exact: true }).click();
  assert.match(await page.getByLabel('评论内容').inputValue(), /晚风里的胶片/);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${out}/watch-light.png`, fullPage: true });
  pass('无底色操作按钮、评论属地、回复展开与输入');
  await page.evaluate(() => window.previewSettings({ theme: 'dark' }));
  await page.waitForTimeout(900); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${out}/watch-dark.png`, fullPage: true });
  await page.goto('http://127.0.0.1:4335/feed');
  const card = page.locator('.fd-list > .dy').first();
  await card.getByRole('button', { name: /^评论/ }).click();
  await card.locator('.dy-r-meta').first().waitFor();
  assert.match(await card.locator('.dy-r-meta').first().textContent(), /IP属地：浙江/);
  await card.getByRole('button', { name: '展开 3 条回复', exact: true }).click();
  await card.locator('.dy-sublist .dy-r').nth(2).waitFor();
  await page.screenshot({ path: `${out}/dynamic.png` });
  pass('动态评论读取返回的属地并展开楼中楼');
  for (const width of [1100, 900]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/watch']) {
      await page.goto(`http://127.0.0.1:4335${path}`); await page.waitForTimeout(600);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `${width} ${path} horizontal overflow`);
    }
  }
  pass('900 / 1100 像素宽度无横向溢出');
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
