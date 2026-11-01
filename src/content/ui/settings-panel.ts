import type { BgMode, Settings, ShaderId, Theme } from '../../shared/settings';
import { BG_IMAGE_KEY, replaceSettings, sanitizeSettings, saveSettings } from '../../shared/settings';
import { ACTIVITY_KEY, sanitizeActivity, type FpMessage } from '../../shared/activity';
import { compressImage } from '../bg/background';
import { SHADER_IDS, SHADER_NAMES } from '../bg/shaders';
import { cachedThumb, shaderThumb } from '../bg/program';
import { block, chipInput, rangeSlider, row, segmented, stepSlider, toast, toggle } from './controls';
import { fmtCount, h, icon, ICONS } from './dom';
import { createSheet, type Sheet } from './sheet';
import { clearLoc, geocodeList, savedLoc, setLoc as setLocWithName } from '../api/weather';

export interface SettingsPanel { sheet: Sheet; sync(s: Settings): void }

export function createSettingsPanel(get: () => Settings, currentShader: () => ShaderId | null): SettingsPanel {
  const sheet = createSheet({ title: '设置', eyebrow: 'Preferences', width: 420 });
  const save = (patch: Partial<Settings>) => saveSettings(patch);
  const say = (t: string) => toast((sheet.el.closest('.app') as HTMLElement | null) ?? sheet.el, t);
  const s0 = get();

  const theme = segmented<Theme>([['auto', '跟随系统'], ['light', '亮色'], ['dark', '暗色']], s0.theme, (v) => save({ theme: v }));
  const watch = toggle(s0.watch, '其他页面重设计', (v) => save({ watch: v }));
  const preview = toggle(s0.hoverPreview, '悬停预览', (v) => save({ hoverPreview: v }));
  const intro = toggle(s0.intro, '开场动画', (v) => save({ intro: v }));
  const foot = toggle(s0.footprint, '足迹热力图', (v) => save({ footprint: v }));
  const wxT = toggle(s0.weather, '天气', (v) => save({ weather: v }));
  // 天气城市（#3）：输入后列出候选，点一个就固定；「自动」回到 IP 定位
  const cityIn = h('input', { class: 'city-in', type: 'search', placeholder: '自动定位', 'aria-label': '天气城市', autocomplete: 'off' }) as HTMLInputElement;
  const cityList = h('ul', { class: 'city-list', role: 'listbox', 'aria-label': '城市候选', hidden: '' });
  const cityAuto = h('button', { class: 'city-auto', type: 'button' }, '自动');
  const paintCity = () => { const l = savedLoc(); cityIn.value = l?.manual ? l.name : ''; cityAuto.hidden = !l?.manual; };
  let cityT = 0, citySeq = 0;
  cityIn.addEventListener('keydown', (e) => e.stopPropagation());
  cityIn.addEventListener('input', () => {
    clearTimeout(cityT);
    const q = cityIn.value.trim();
    if (!q) { cityList.hidden = true; return; }
    cityT = window.setTimeout(async () => {
      const seq = ++citySeq;
      const list = await geocodeList(q).catch(() => []);
      if (seq !== citySeq) return;
      cityList.replaceChildren(...(list.length ? list.map((p) => {
        const li = h('li', { role: 'option', tabindex: '0' }, h('b', {}, p.name), p.region ? h('small', {}, p.region) : null);
        const pick = () => { setLocWithName(p); cityList.hidden = true; paintCity(); say(`天气城市：${p.name}`); };
        li.addEventListener('click', pick);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
        return li;
      }) : [h('li', { class: 'empty' }, '没有找到这个城市')]));
      cityList.hidden = false;
    }, 300);
  });
  cityAuto.addEventListener('click', () => { clearLoc(); paintCity(); say('天气改回按 IP 自动定位'); });
  paintCity();
  const cityBox = h('div', { class: 'city-box' }, h('div', { class: 'city-row' }, cityIn, cityAuto), cityList);
  const cols = segmented<string>([['0', '自动'], ['4', '4 个'], ['5', '5 个']], String(s0.cols), (v) => save({ cols: Number(v) as 0 | 4 | 5 }));
  const favD = toggle(s0.favDirect, '收藏夹直接展开', (v) => save({ favDirect: v }));

  const kw = chipInput(s0.filters.keywords, '输入关键词，回车添加；/正则/ 也可以', (v) => save({ filters: { ...get().filters, keywords: v } }));
  const ups = chipInput(s0.filters.ups, 'UP 主昵称或 MID', (v) => save({ filters: { ...get().filters, ups: v } }));
  const views = stepSlider([0, 1000, 10000, 50000, 100000, 1000000], s0.filters.minViews, (n) => (n ? `≥ ${fmtCount(n)}` : '不限'), (v) => save({ filters: { ...get().filters, minViews: v } }), '最低播放量');
  const dur = segmented<string>([['0', '不限'], ['60', '1 分钟'], ['180', '3 分钟'], ['600', '10 分钟']], String(s0.filters.minDuration), (v) => save({ filters: { ...get().filters, minDuration: Number(v) } }));

  const mode = segmented<BgMode>([['random', '随机'], ['fixed', '固定'], ['image', '图片'], ['off', '关闭']], s0.bg.mode, (v) => {
    if (v === 'image') { file.click(); return; }
    save({ bg: { ...get().bg, mode: v } });
  });
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': '背景样式' });
  const paintSwatches = () => {
    const s = get();
    const on = s.bg.mode === 'fixed' ? s.bg.shader : s.bg.mode === 'random' ? currentShader() : null;
    swatches.querySelectorAll<HTMLElement>('.sw-item').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === on)));
    // 用真实渲染的缩略图替换 CSS 色块（主题变了就重画）
    paintThumbs();
  };
  // 缩略图：缓存里有的立刻贴上；没有的等面板可见时再一帧画一张，不在页面加载时编译着色器
  let thumbsVisible = false;
  let thumbJob = 0;
  const paintThumbs = () => {
    const t = (swatches.closest('.app') as HTMLElement | null)?.dataset.theme === 'light' ? 'light' : 'dark';
    if (swatches.dataset.thumbs === t) return;
    const chips = [...swatches.querySelectorAll<HTMLElement>('.sw-chip')];
    const todo: HTMLElement[] = [];
    for (const c of chips) { const url = cachedThumb(c.dataset.id as ShaderId, t); if (url) c.style.backgroundImage = `url(${url})`; else todo.push(c); }
    if (!todo.length) { swatches.dataset.thumbs = t; return; }
    if (!thumbsVisible) return;
    clearTimeout(thumbJob); cancelAnimationFrame(thumbJob);
    const step = () => {
      const c = todo.shift();
      if (!c) { swatches.dataset.thumbs = t; return; }
      const url = shaderThumb(c.dataset.id as ShaderId, t);
      if (url) c.style.backgroundImage = `url(${url})`;
      thumbJob = requestAnimationFrame(step);
    };
    thumbJob = window.setTimeout(step, 480);  // 等面板滑入动画结束再编译，免得动画卡
  };
  new IntersectionObserver((es) => { thumbsVisible = es.some((e) => e.isIntersecting); if (thumbsVisible) paintThumbs(); }).observe(swatches);
  for (const id of SHADER_IDS) {
    const b = h('button', { type: 'button', class: 'sw-item', role: 'radio', onclick: () => save({ bg: { ...get().bg, mode: 'fixed', shader: id } }) },
      h('span', { class: `sw-chip sw-${id}`, 'data-id': id }), h('span', {}, SHADER_NAMES[id]));
    b.dataset.v = id;
    swatches.append(b);
  }
  const intensity = rangeSlider(s0.bg.intensity, (n) => `${Math.round(n * 100)}%`, (v) => save({ bg: { ...get().bg, intensity: v } }), '背景强度');
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': '选择背景图片' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) { mode.set(get().bg.mode); return; }
    const url = await compressImage(f);
    await chrome.storage.local.set({ [BG_IMAGE_KEY]: url });
    save({ bg: { ...get().bg, mode: 'image' } });
  });
  const upload = h('button', { type: 'button', class: 'ghost small', onclick: () => file.click() }, icon(ICONS.image), h('span', {}, '上传图片'));

  // ── 数据：导出 / 导入设置与足迹（JSON 文件，只在本机处理） ──
  const exportData = async () => {
    const v = await chrome.storage.local.get(ACTIVITY_KEY);
    const data = { app: 'margin', format: 1, version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), settings: get(), activity: v[ACTIVITY_KEY] ?? {} };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `margin-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say(`已导出设置和 ${Object.keys(data.activity).length} 天足迹`);
  };
  const json = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': '选择要导入的备份文件' });
  json.addEventListener('change', async () => {
    const f = json.files?.[0];
    json.value = '';
    if (!f) return;
    let raw: Record<string, unknown>;
    try {
      if (f.size > 5e6) throw new Error('文件太大');
      raw = JSON.parse(await f.text());
      if (!raw || typeof raw !== 'object' || raw.app !== 'margin') throw new Error('不是映间导出的备份文件');
    } catch (e) { say(`导入失败：${(e as Error).message || '文件格式不对'}`); return; }
    const settings = raw.settings === undefined ? null : sanitizeSettings(raw.settings);
    const activity = raw.activity === undefined ? null : sanitizeActivity(raw.activity);
    if (!settings && !activity) { say('导入失败：备份里没有可用的设置或足迹'); return; }
    const days = activity ? Object.keys(activity).length : 0;
    const parts = [settings ? '用备份覆盖当前设置（主题、背景、过滤）' : '', days ? `合并 ${days} 天足迹（同一天取较长时长、较早首次打开）` : ''].filter(Boolean);
    const when = typeof raw.exportedAt === 'string' ? `（${raw.exportedAt.slice(0, 10)} 导出）` : '';
    if (!confirm(`导入映间备份${when}：\n· ${parts.join('\n· ')}\n\n继续吗？`)) return;
    if (activity && days) await chrome.runtime.sendMessage({ margin: 'fp', op: 'import', days: activity } satisfies FpMessage);
    if (settings) await replaceSettings(settings);
    say(`已导入${settings ? '设置' : ''}${settings && days ? '和' : ''}${days ? ` ${days} 天足迹` : ''}`);
  });
  const exportBtn = h('button', { type: 'button', class: 'ghost small', onclick: exportData }, h('span', {}, '导出'));
  const importBtn = h('button', { type: 'button', class: 'ghost small', onclick: () => json.click() }, h('span', {}, '导入'));

  sheet.body.append(
    h('section', { class: 'group' }, h('h3', {}, '外观'),
      block('明暗', null, theme),
      row('封面悬停预览', '鼠标停留半秒后静音播放', preview),
      row('开场动画', '每次打开浏览器后第一次进首页播放，点一下可跳过', intro),
      row('其他页面重设计', '播放页、搜索页、空间、动态等，只换外观不改功能', watch),
      block('首页每行视频', '自动按窗口宽度排 6–8 个；也可以固定 4 个或 5 个，卡片更大', cols),
      row('收藏夹直接展开', '点收藏夹直接列出全部视频，不再先弹出最近 4 个', favD)),
    h('section', { class: 'group' }, h('h3', {}, '首页顶部'),
      row('足迹热力图', '关掉只是不显示，足迹照样在本机记录', foot),
      row('天气', '关掉后不再请求天气和城市定位', wxT),
      block('天气城市', 'IP 定位不准时手动选一个；留空 = 自动定位', cityBox)),
    h('section', { class: 'group' }, h('h3', {}, '背景'),
      block('模式', '随机：每次打开换一款，不连续重复', mode),
      block('样式', null, swatches),
      block('强度', null, intensity),
      h('div', { class: 'row' }, h('div', { class: 'row-label' }, h('span', {}, '自定义图片'), h('small', {}, '压缩后只保存在本机')), upload, file)),
    h('section', { class: 'group' }, h('h3', {}, '推荐过滤'),
      block('屏蔽关键词', '标题包含即隐藏', kw),
      block('屏蔽 UP 主', '卡片右上角也能一键屏蔽', ups),
      block('最低播放量', null, views),
      block('最短时长', null, dur)),
    h('section', { class: 'group' }, h('h3', {}, '数据'),
      h('div', { class: 'row' }, h('div', { class: 'row-label' }, h('span', {}, '备份与迁移'), h('small', {}, '设置和足迹导出成 JSON 文件；不含自定义背景图片')),
        h('div', { class: 'data-acts' }, exportBtn, importBtn), json)),
  );

  return {
    sheet,
    sync(s) {
      theme.set(s.theme);
      preview.setAttribute('aria-checked', String(s.hoverPreview));
      intro.setAttribute('aria-checked', String(s.intro));
      watch.setAttribute('aria-checked', String(s.watch));
      foot.setAttribute('aria-checked', String(s.footprint));
      wxT.setAttribute('aria-checked', String(s.weather));
      favD.setAttribute('aria-checked', String(s.favDirect));
      cols.set(String(s.cols));
      kw.set(s.filters.keywords);
      ups.set(s.filters.ups);
      mode.set(s.bg.mode);
      paintSwatches();
    },
  };
}
