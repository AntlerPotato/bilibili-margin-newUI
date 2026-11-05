import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { apiBody, installMocks } from './mocks.mjs';

const ext = resolve(process.env.SMOKE_EXT || 'dist');
const out = resolve(process.env.SMOKE_OUT || 'tests/artifacts/reported-issues');
const baseline = process.env.ISSUES_BASELINE === '1';
mkdirSync(out, { recursive: true });
const results = [], errors = [];
let override;
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'margin-issues-')), {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  headless: true, args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1920, height: 1000 }, locale: 'zh-CN',
});
try {
  await installMocks(ctx, u => override?.(u));
  await ctx.addInitScript(() => sessionStorage.setItem('margin:intro-played', '1'));
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const page = ctx.pages()[0];
  page.on('pageerror', e => errors.push(e.message));
  const seed = patch => sw.evaluate(async p => {
    const s = (await chrome.storage.local.get('margin:settings'))['margin:settings'] || {};
    await chrome.storage.local.set({ 'margin:settings': { ...s, ...p } });
  }, patch);
  await seed({ intro: false, weather: false, footprint: true, wide: false, autoWeb: false, theme: 'dark' });
  const check = async (name, run) => {
    try { const evidence = await run(); results.push({ name, ok: true, evidence }); console.log(`PASS ${name}`); }
    catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`FAIL ${name}: ${e.message}`); }
    override = undefined;
  };
  await check('69-footprint-full-width', async () => {
    await page.goto('https://www.bilibili.com/');
    await page.locator('#margin-root .fp-card').waitFor();
    for (const width of [2520, 1440, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      const gap = await page.locator('#margin-root .dash').evaluate(e => e.clientWidth - e.querySelector('.fp-card').getBoundingClientRect().width);
      assert(Math.abs(gap) < 2, `width ${width}: unused space ${gap}px`);
    }
    await seed({ weather: true });
    await page.locator('#margin-root .wx').waitFor();
    await seed({ weather: false, footprint: false });
    await page.locator('#margin-root .dash').waitFor({ state: 'hidden' });
    await seed({ footprint: true });
    await page.locator('#margin-root .fp-card').waitFor();
    await page.locator('#margin-root .wx').waitFor({ state: 'detached' });
    assert(await page.locator('#margin-root .dash').evaluate(e => Math.abs(e.clientWidth - e.firstElementChild.getBoundingClientRect().width) < 2));
    await page.screenshot({ path: join(out, 'footprint.png') });
  });
  await check('70-settings-position', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const url of ['https://www.bilibili.com/', 'https://www.bilibili.com/video/BV1mdxN68E7F/', 'https://space.bilibili.com/2/video', 'https://t.bilibili.com/', 'https://message.bilibili.com/', 'https://search.bilibili.com/all?keyword=test']) {
      await page.goto(url); await page.locator('.top').waitFor();
      const button = page.locator('.top .acts > .hd-settings');
      assert.equal(await button.count(), 1, url);
      assert.equal(await page.locator('.top .et [title="设置"]').count(), 0);
      await button.click();
      await page.locator('.sheet-layer[data-open="true"]').waitFor();
    }
  });
  await check('66-wide-title-width', async () => {
    await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/');
    await page.locator('#margin-watch-top .top').waitFor();
    // Native two-column layout: wide player overflows the left column.
    await page.addStyleTag({ content: '.video-container-v1{width:90vw;margin:auto;display:flex;gap:30px}.left-container{width:calc(100% - 350px);flex:none}.right-container{width:320px}.bpx-player-container[data-screen="wide"]{width:90vw!important}' });
    await page.locator('.bpx-player-ctrl-wide').click();
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(250);
      const sizes = await page.evaluate(() => ({ title: document.querySelector('.video-info-container').getBoundingClientRect().width, player: document.querySelector('.bpx-player-container').getBoundingClientRect().width }));
      assert(Math.abs(sizes.title - sizes.player) < 2, JSON.stringify(sizes));
    }
    await page.screenshot({ path: join(out, 'wide.png') });
    await page.locator('.bpx-player-container').evaluate(e => e.dataset.screen = 'normal');
    await page.waitForTimeout(250);
    assert(await page.evaluate(() => Math.abs(document.querySelector('.video-info-container').getBoundingClientRect().width - document.querySelector('.left-container').getBoundingClientRect().width) < 2));
  });
  await check('58-auto-wide-native-spacer', async () => {
    await seed({ wide: true });
    const watch = await ctx.newPage();
    try {
      await watch.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.video-container-v1{position:relative;min-height:2600px}.left-container{width:900px}.right-container{position:absolute;top:96px;right:0;width:350px}.up-panel-container{height:130px!important}.margin-wide #danmukuBox{margin-top:714px}.bpx-player-container{height:686px!important}';
        document.head.append(style);
        const side = document.querySelector('.right-container');
        const inner = document.createElement('div'); inner.className = 'right-container-inner scroll-sticky';
        inner.append(...side.childNodes); side.append(inner);
        const up = document.createElement('div'); up.className = 'up-panel-container'; up.textContent = 'UP 主卡片'; inner.prepend(up);
      }));
      await watch.goto('https://www.bilibili.com/video/BV1mdxN68E7F/');
      await watch.locator('html.margin-wide').waitFor();
      await watch.waitForTimeout(500);
      const geometry = await watch.evaluate(() => {
        const player = document.querySelector('.bpx-player-container').getBoundingClientRect();
        const up = document.querySelector('.up-panel-container').getBoundingClientRect();
        const recommendation = document.querySelector('.recommend-list-v1').getBoundingClientRect();
        return { upGap: up.top - player.bottom, recommendationGap: recommendation.top - up.bottom };
      });
      await watch.screenshot({ path: join(out, 'auto-wide-native-spacer.png') });
      assert(Math.abs(geometry.upGap - 24) < 3, JSON.stringify(geometry));
      assert(geometry.recommendationGap >= 0 && geometry.recommendationGap < 80, JSON.stringify(geometry));
      await watch.locator('.bpx-player-container').evaluate(e => e.dataset.screen = 'normal');
      await watch.locator('html.margin-wide').waitFor({ state: 'detached' });
      await watch.waitForTimeout(1200);
      assert.equal(await watch.locator('.bpx-player-container').getAttribute('data-screen'), 'normal');
      assert.equal(await watch.evaluate(() => document.documentElement.style.getPropertyValue('--m-wide-pad')), '');
      return geometry;
    } finally { await watch.close(); await seed({ wide: false }); }
  });
  await check('58-wide-inner-offset', async () => {
    await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/');
    await page.locator('#margin-watch-top .top').waitFor();
    await page.addStyleTag({ content: '.video-container-v1{position:relative;min-height:2400px}.left-container{width:900px}.right-container{position:absolute;top:96px;right:0;width:350px}.right-container-inner{padding-top:500px}.bpx-player-container{height:686px!important}' });
    await page.evaluate(() => {
      const side = document.querySelector('.right-container');
      const inner = document.createElement('div'); inner.className = 'right-container-inner';
      const panel = document.createElement('div'); panel.className = 'up-panel-container'; panel.textContent = '晚挂载卡片';
      inner.append(panel, ...side.childNodes); side.append(inner);
    });
    await page.locator('.bpx-player-ctrl-wide').click();
    await page.waitForTimeout(500);
    const gap = () => page.evaluate(() => document.querySelector('.up-panel-container').getBoundingClientRect().top - document.querySelector('.bpx-player-container').getBoundingClientRect().bottom);
    assert(Math.abs(await gap() - 24) < 3, `native inner offset counted twice: gap=${await gap()}`);
    await page.locator('.right-container-inner').evaluate(e => e.style.paddingTop = '300px');
    await page.waitForTimeout(500);
    assert(Math.abs(await gap() - 24) < 3, `late inner spacing: gap=${await gap()}`);
    await page.evaluate(() => scrollTo(0, 300)); await page.waitForTimeout(250);
    assert(Math.abs(await gap() - 24) < 3, `scroll gap=${await gap()}`);
    await page.locator('.up-panel-container').evaluate(e => e.style.display = 'none');
    await page.waitForTimeout(500);
    const hiddenAuthorGap = await page.evaluate(() => document.querySelector('#danmukuBox').getBoundingClientRect().top - document.querySelector('.bpx-player-container').getBoundingClientRect().bottom);
    assert(Math.abs(hiddenAuthorGap - 24) < 3, `hidden author gap=${hiddenAuthorGap}`);
  });
  await check('58-wide-author-scroll', async () => {
    await page.setViewportSize({ width: 1440, height: 808 });
    await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/');
    await page.locator('#margin-watch-top .top').waitFor();
    // Native sticky columns share a row, while the wide player spans both columns.
    await page.addStyleTag({ content: 'body{margin:0}.video-container-v1{display:flex;align-items:flex-start;width:90vw;margin:auto;gap:30px;min-height:2600px}.left-container{width:calc(100% - 380px);flex:none}.video-container-v1 .left-container.scroll-sticky{position:sticky;z-index:1}.right-container{position:relative;width:350px;flex:none}.bpx-player-container{height:686px!important}.bpx-player-container[data-screen="wide"]{width:90vw!important}.up-panel-container{height:130px!important}' });
    await page.evaluate(() => {
      const left = document.querySelector('.left-container');
      left.classList.add('scroll-sticky'); left.style.top = '0px';
      const panel = document.createElement('div'); panel.className = 'up-panel-container';
      const name = document.createElement('a'); name.href = 'https://space.bilibili.com/1'; name.textContent = 'UP 主';
      panel.append(name); document.querySelector('.right-container').prepend(panel);
      document.querySelector('.bpx-player-container').dataset.screen = 'wide';
    });
    await page.locator('html.margin-wide').waitFor(); await page.waitForTimeout(500);
    const geometry = () => page.evaluate(() => {
      const panel = document.querySelector('.up-panel-container'), up = panel.getBoundingClientRect();
      const player = document.querySelector('.bpx-player-container').getBoundingClientRect();
      const hit = document.elementFromPoint(up.x + up.width / 2, up.y + up.height / 2);
      return { gap: up.top - player.bottom, upTop: up.top, playerBottom: player.bottom, hit: panel.contains(hit) };
    });
    assert(Math.abs((await geometry()).gap - 24) < 3);
    // Bilibili rewrites this inset during scrolling. The player must not cover the author card.
    await page.evaluate(() => {
      document.querySelector('.left-container').style.top = '-358px';
      scrollTo(0, 650);
    });
    await page.waitForTimeout(250);
    const scrolled = await geometry();
    await page.screenshot({ path: join(out, 'wide-author-scroll.png') });
    assert(Math.abs(scrolled.gap - 24) < 3 && scrolled.hit, JSON.stringify(scrolled));
    for (const screen of ['normal', 'web', 'full']) {
      await page.locator('.bpx-player-container').evaluate((el, value) => el.dataset.screen = value, screen);
      await page.locator('html.margin-wide').waitFor({ state: 'detached' });
      const style = await page.locator('.left-container').evaluate(el => ({ position: getComputedStyle(el).position, top: getComputedStyle(el).top }));
      assert.equal(style.position, 'sticky', `${screen}: wide positioning override leaked`);
      assert.equal(style.top, '-358px', `${screen}: native inset was overwritten`);
    }
    await page.evaluate(() => {
      scrollTo(0, 0);
      document.querySelector('.bpx-player-container').dataset.screen = 'wide';
    });
    await page.locator('html.margin-wide').waitFor(); await page.waitForTimeout(250);
    assert(Math.abs((await geometry()).gap - 24) < 3);
    await page.evaluate(() => scrollTo(0, 650)); await page.waitForTimeout(250);
    const reopened = await geometry();
    assert(Math.abs(reopened.gap - 24) < 3 && reopened.hit, JSON.stringify(reopened));
    return { scrolled, reopened };
  });
  await check('11-classic-loading-sticky-stability', async () => {
    override = async u => {
      if (!u.includes('/arc/search')) return;
      await new Promise(r => setTimeout(r, 4500));
      const b = apiBody(u); b.data.list.vlist.forEach(v => v.created = 1600000000); return b;
    };
    const runs = [];
    for (const prefs of [{ zoom: 100, homeHide: [] }, { zoom: 120, homeHide: ['date'] }]) {
      await seed({ weather: false, ...prefs });
      await page.setViewportSize({ width: 2520, height: 1000 });
      await page.goto('https://www.bilibili.com/');
      await page.locator('#margin-root .tab[data-tab="classic"]').click();
      await page.locator('#margin-root .home-grid .sk').first().waitFor();
      const samples = await page.locator('#margin-root .app').evaluate(async app => {
        const bar = app.querySelector('.bar'), mark = app.querySelector('.bar-mark');
        const data = [];
        // Place the viewport bottom close to the sticky threshold, as on a tall screen with a short skeleton grid.
        const target = mark.getBoundingClientRect().top + app.scrollTop - 72 + 15;
        app.style.height = `${app.scrollHeight - target}px`;
        app.scrollTop = app.scrollHeight;
        for (let i = 0; i < 90; i++) {
          await new Promise(r => requestAnimationFrame(r));
          data.push({ stuck: bar.classList.contains('stuck'), top: app.scrollTop, height: bar.getBoundingClientRect().height });
        }
        return data;
      });
      const flips = samples.reduce((n, s, i) => n + (i && s.stuck !== samples[i - 1].stuck ? 1 : 0), 0);
      writeFileSync(join(out, `sticky-samples-${prefs.zoom}.json`), JSON.stringify(samples));
      assert(flips <= 1, `${flips} sticky transitions without further scrolling`);
      runs.push({ ...prefs, flips });
    }
    await seed({ zoom: 100, homeHide: [] });
    return runs;
  });
  await check('67-collections-series-navigation', async () => {
    const requests = [];
    let failPageTwo = true, delay = false, empty = false;
    const video = (i, kind) => ({ aid: i, bvid: `BVcollection${kind}${i}`, title: `${kind} 视频 ${i}`, pic: 'https://i0.hdslb.com/test.jpg', duration: 123, pubdate: 1600000000, stat: { view: 456 } });
    override = async raw => {
      const u = new URL(raw), p = u.pathname, q = u.searchParams;
      if (p.endsWith('/seasons_series_list')) {
        requests.push({ kind: 'index', page: Number(q.get('page_num')) });
        const index = Number(q.get('page_num'));
        const data = { page: { total: empty ? 0 : 3 }, seasons_list: [], series_list: [] };
        if (!empty) {
          data.seasons_list = [{ meta: { season_id: index, name: `测试合集 ${index}`, total: 3, cover: '' }, archives: [] }];
          if (index === 1) data.series_list = [{ meta: { series_id: 20, name: '测试系列', total: 2 }, archives: [video(1, 'series')] }];
        }
        return { code: 0, data: { items_lists: data } };
      }
      if (p.endsWith('/seasons_archives_list') || p.endsWith('/series/archives')) {
        const kind = p.endsWith('/series/archives') ? 'series' : 'season';
        const num = Number(q.get(kind === 'series' ? 'pn' : 'page_num'));
        requests.push({ kind, page: num });
        if (delay) await new Promise(r => setTimeout(r, 1200));
        if (kind === 'season' && num === 2 && failPageTwo) { failPageTwo = false; return { code: -500, message: '测试分页失败' }; }
        return { code: 0, data: { page: { total: kind === 'series' ? 2 : 3 }, archives: [video(num, kind)] } };
      }
    };
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('https://space.bilibili.com/2/video');
    await page.locator('#margin-root .tab[data-tab="collections"]').click();
    await page.waitForFunction(() => document.getElementById('margin-root').shadowRoot.querySelectorAll('.sp-collection').length === 3);
    assert.equal(await page.locator('#margin-root .sp-q:visible').count(), 0);
    assert.equal(await page.locator('#margin-root .sp-collection[data-kind="series"] img').count(), 1);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, 'collections.png') });
    await page.locator('#margin-root .sp-collection[data-kind="season"] .cover').first().click();
    await page.locator('#margin-root .status button').waitFor();
    await page.waitForTimeout(250);
    assert.deepEqual(requests.filter(r => r.kind === 'season').map(r => r.page), [1, 2]);
    await page.locator('#margin-root .status button').click();
    await page.waitForFunction(() => document.getElementById('margin-root').shadowRoot.querySelectorAll('.grid .card:not(.sk)').length === 3);
    assert.deepEqual(requests.filter(r => r.kind === 'season').map(r => r.page), [1, 2, 2, 3]);
    assert.equal(await page.locator('#margin-root .grid .card .cover').first().getAttribute('href'), 'https://www.bilibili.com/video/BVcollectionseason1');
    await page.locator('#margin-root .sp-collection-head button').click();
    await page.locator('#margin-root .sp-collection[data-kind="series"] .cover').click();
    await page.waitForFunction(() => document.getElementById('margin-root').shadowRoot.querySelectorAll('.grid .card:not(.sk)').length === 2);
    assert.deepEqual(requests.filter(r => r.kind === 'series').map(r => r.page), [1, 2]);
    await page.locator('#margin-root .sp-layout button').filter({ hasText: '列表' }).click();
    await page.locator('#margin-root .vrow:not(.sk)').first().waitFor();
    await page.screenshot({ path: join(out, 'series.png') });
    await page.locator('#margin-root .sp-collection-head button').click();
    delay = true;
    await page.locator('#margin-root .sp-collection[data-kind="season"] .cover').first().click();
    await page.locator('#margin-root .tab[data-tab="dynamic"]').click();
    await page.locator('#margin-root .dy:not(.sk)').first().waitFor();
    await page.waitForTimeout(1400);
    assert.equal(await page.locator('#margin-root .sp-collection-head:visible').count(), 0);
    assert.equal(await page.locator('#margin-root .dy-list .card').count(), 0);
    empty = true;
    await page.goto('https://space.bilibili.com/2?margin_tab=collections');
    await page.locator('#margin-root .status').filter({ hasText: '还没有合集或系列' }).waitFor();
    assert.equal(await page.locator('#margin-root .tab[data-tab="collections"][aria-selected="true"]').count(), 1);
    return { requests };
  });
  await check('71-space-live-badge', async () => {
    let releaseLive;
    const liveResponse = new Promise(resolve => { releaseLive = resolve; });
    override = u => u.includes('/Room/getRoomInfoOld') ? liveResponse : undefined;
    await page.goto('https://space.bilibili.com/50329118');
    await page.locator('#margin-root .sp-face').waitFor();
    assert.equal(await page.locator('#margin-root .sp-live').count(), 0);
    releaseLive({ code: 0, data: { liveStatus: 1, roomStatus: 1, roomid: 7734200, title: '测试直播' } });
    const badge = page.locator('#margin-root .sp-live');
    await badge.waitFor({ timeout: 4000 });
    assert.equal(await badge.textContent(), '直播中');
    assert.equal(await badge.getAttribute('href'), 'https://live.bilibili.com/7734200');
    const [room] = await Promise.all([page.waitForEvent('popup'), badge.click()]);
    await room.waitForLoadState('domcontentloaded');
    assert.equal(room.url(), 'https://live.bilibili.com/7734200');
    await room.close();
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 1000 });
      await seed({ theme: width === 900 ? 'light' : 'dark' });
      await page.screenshot({ path: join(out, `space-live-${width}.png`) });
      const face = await page.locator('#margin-root .sp-face').boundingBox();
      const live = await badge.boundingBox();
      assert(Math.abs(face.x + face.width / 2 - live.x - live.width / 2) < 2);
    }
    for (const reply of [{ code: 0, data: { liveStatus: 0, roomStatus: 1, roomid: 7734200 } }, { code: -500, message: '暂时不可用' }]) {
      override = u => u.includes('/Room/getRoomInfoOld') ? reply : undefined;
      await page.reload(); await page.locator('#margin-root .sp-face').waitFor();
      await page.waitForTimeout(400);
      assert.equal(await page.locator('#margin-root .sp-live').count(), 0);
      assert(await page.locator('#margin-root .sp-follow').isVisible());
    }
    await seed({ theme: 'dark' });
  });
  await check('72-following-strip-buttons', async () => {
    const portal = apiBody('https://api.bilibili.com/x/polymer/web-dynamic/v1/portal');
    const sample = portal.data.up_list.items[0];
    portal.data.up_list.items = Array.from({ length: 32 }, (_, i) => ({ ...sample, mid: i + 1000, uname: `UP ${i + 1}`, has_update: false }));
    override = u => {
      if (u.includes('/v1/portal')) return portal;
      if (u.includes('/followings/search')) return { code: 0, data: { list: [sample] } };
    };
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('https://t.bilibili.com/');
    const row = page.locator('#margin-root .fd-ups-row');
    await row.locator('.fd-up').first().waitFor();
    const prev = page.getByRole('button', { name: '向左滚动关注列表', exact: true });
    const next = page.getByRole('button', { name: '向右滚动关注列表', exact: true });
    await next.waitFor({ timeout: 4000 });
    assert(await prev.isDisabled()); assert(await next.isEnabled());
    await next.click(); await page.waitForTimeout(600);
    assert(await row.evaluate(e => e.scrollLeft > 100));
    await prev.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    assert(await row.evaluate(e => e.scrollLeft < 1));
    assert(await prev.isDisabled());
    await row.evaluate(e => e.scrollLeft = e.scrollWidth); await page.waitForTimeout(100);
    assert(await next.isDisabled()); assert(await prev.isEnabled());
    await page.screenshot({ path: join(out, 'following-strip.png') });
    await seed({ reduceMotion: true });
    await prev.click();
    assert(await row.evaluate(e => e.scrollLeft < e.scrollWidth - e.clientWidth - 100));
    await page.getByRole('searchbox', { name: '在关注里搜 UP 主' }).fill('UP');
    await page.waitForFunction(() => document.getElementById('margin-root').shadowRoot.querySelectorAll('.fd-ups-row .fd-up').length === 1);
    assert(await prev.isDisabled()); assert(await next.isDisabled());
    await page.getByRole('searchbox', { name: '在关注里搜 UP 主' }).fill('');
    await page.waitForFunction(() => document.getElementById('margin-root').shadowRoot.querySelectorAll('.fd-ups-row .fd-up').length === 32);
    await page.setViewportSize({ width: 900, height: 1000 }); await page.waitForTimeout(100);
    assert(await prev.isDisabled()); assert(await next.isEnabled());
    await row.locator('.fd-up').first().click();
    assert.equal(await row.locator('.fd-up').first().getAttribute('aria-pressed'), 'true');
    await seed({ reduceMotion: false });
  });
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await ctx.close();
}
if (!baseline && results.some(r => !r.ok)) process.exitCode = 1;
