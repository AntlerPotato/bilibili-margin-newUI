import samples from '../tests/fixtures/pop.json';
import watchCSS from '../src/content/watch.css?inline';
import globalCSS from '../src/content/global.css?inline';
import pagesCSS from '../src/content/pages.css?inline';
import previewCSS from './preview.css?inline';

const listeners = new Set<(changes: any, area: string) => void>();
const stored = JSON.parse(localStorage.getItem('margin-feedback-preview') || '{}');
stored['margin:settings'] ??= { theme: 'dark', intro: false, weather: false, footprint: false, appFeed: false, batchNav: true, batchSize: 12, batchPrefetch: false, bg: { mode: 'off' } };
const storage = {
  async get(keys: string | string[] | null) { return keys == null ? { ...stored } : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, stored[k]])); },
  async set(values: Record<string, unknown>) {
    const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: stored[key], newValue: value }]));
    Object.assign(stored, values); localStorage.setItem('margin-feedback-preview', JSON.stringify(stored));
    listeners.forEach(fn => fn(changes, 'local'));
  },
  async remove(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key];
    localStorage.setItem('margin-feedback-preview', JSON.stringify(stored));
  },
};
Object.assign(window, { chrome: {
  storage: { local: storage, onChanged: { addListener: (fn: any) => listeners.add(fn), removeListener: (fn: any) => listeners.delete(fn) } },
  runtime: { getURL: (path: string) => new URL('/' + path, location.origin).href, getManifest: () => ({ version: '0.60.13', version_name: '反馈预览' }), sendMessage: async () => ({ ok: true }) },
} });
let failRequests = false, slowRequests = false;
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/^https:\/\//.test(url)) return nativeFetch('/preview-api?url=' + encodeURIComponent(url) + `&fail=${Number(failRequests)}&slow=${Number(slowRequests)}`, { signal: init?.signal });
  return nativeFetch(input, init);
};
const { loadSettings, onSettingsChange, saveSettings } = await import('../src/shared/settings');
const { h, icon, ICONS } = await import('../src/content/ui/dom');
const { injectFonts } = await import('../src/content/fonts');
const { setUiEffects, setUserReducedMotion } = await import('../src/content/motion');
injectFonts();
const style = document.createElement('style'); style.textContent = previewCSS; document.head.append(style);
const settings = await loadSettings();
setUiEffects(settings.uiEffects); setUserReducedMotion(settings.reduceMotion);
let app: { update(s: any): void };
if (location.pathname === '/watch') {
  const skin = document.createElement('style'); skin.textContent = globalCSS + watchCSS + pagesCSS; document.head.append(skin);
  const sample = samples[2];
  const poster = h('div', { class: 'preview-player bpx-player-container', 'data-screen': 'normal' }, h('img', { src: sample.pic, alt: sample.title, referrerpolicy: 'no-referrer' }));
  const toolbar = h('div', { class: 'video-toolbar-left-main' });
  for (const [className, label, key, count] of [
    ['video-like', '点赞', 'like', 2857], ['video-coin', '投币', 'coin', 415], ['video-fav', '收藏', 'star', 1048], ['video-share', '分享', 'forward', 126],
  ] as const) {
    const number = h('span', { class: 'video-toolbar-item-text' }, String(count));
    const button = h('button', { class: `video-toolbar-left-item ${className}`, type: 'button', 'aria-label': label, 'aria-pressed': 'false' }, icon(ICONS[key]), number);
    button.addEventListener('click', () => {
      const active = button.classList.toggle('on'); button.setAttribute('aria-pressed', String(active)); number.textContent = String(count + Number(active));
    });
    toolbar.append(button);
  }
  const textarea = h('textarea', { placeholder: '发一条友善的评论', 'aria-label': '评论内容', rows: 2 });
  const comments = h('section', { id: 'commentapp', class: 'preview-comments' }, h('h2', {}, '评论'), textarea);
  const rows = [
    ['晚风里的胶片', '前面那段镜头的光线很好看，停下来重新看了一遍。', 'IP属地：浙江'],
    ['一颗小行星', '节奏很舒服，收藏起来周末再看。', 'IP属地：广东'],
    ['北岸', '想知道这里用的是什么镜头。', ''],
  ];
  for (const [i, [name, text, location]] of rows.entries()) {
    const children = h('div', { class: 'preview-replies', hidden: true }, h('p', {}, '我也很喜欢这一段的声音。'), h('small', {}, 'IP属地：江苏'));
    const expand = h('button', { class: 'preview-expand', type: 'button', 'aria-expanded': 'false' }, '展开回复');
    expand.addEventListener('click', () => { children.hidden = !children.hidden; expand.setAttribute('aria-expanded', String(!children.hidden)); expand.textContent = children.hidden ? '展开回复' : '收起回复'; });
    const reply = h('button', { type: 'button' }, '回复'); reply.addEventListener('click', () => { textarea.value = `回复 @${name}：`; textarea.focus(); });
    comments.append(h('article', { class: 'preview-comment' }, h('img', { src: samples[i].face, alt: '', referrerpolicy: 'no-referrer' }),
      h('div', {}, h('b', {}, name), h('p', {}, text), h('div', { class: 'preview-comment-meta' }, h('span', {}, '15分钟前'), location ? h('span', { class: 'preview-location' }, location) : null, reply), i === 0 ? expand : null, children)));
  }
  const author = h('aside', { class: 'preview-author' }, h('img', { src: sample.face, alt: '', referrerpolicy: 'no-referrer' }), h('b', {}, sample.name), h('p', {}, '视频创作与生活记录'), h('button', { type: 'button' }, '已关注'));
  const main = h('main', { class: 'preview-watch' }, h('h1', {}, sample.title), h('div', { class: 'preview-watch-grid' }, h('div', {}, poster, h('div', { class: 'video-toolbar-container' }, toolbar), comments), author));
  document.body.append(main);
  const { WatchSkin } = await import('../src/content/ui/watch'); app = new WatchSkin(settings, 'watch');
} else if (location.pathname === '/feed') {
  const { FeedApp } = await import('../src/content/ui/feedpage');
  const feed = new FeedApp(settings); document.body.append(feed.shell.host); app = feed;
} else {
  const { MarginApp } = await import('../src/content/ui/app');
  const home = new MarginApp(settings); document.body.append(home.host); app = home;
  home.host.addEventListener('click', event => {
    const link = event.composedPath().find(n => n instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
    if (link?.matches('.cover,.title')) { event.preventDefault(); location.assign('/watch'); }
  }, true);
}
onSettingsChange(s => { app.update(s); setUiEffects(s.uiEffects); setUserReducedMotion(s.reduceMotion); });
const controls = h('nav', { class: 'preview-controls', 'aria-label': '预览控制' },
  h('span', { class: 'preview-note' }, '界面预览 · 示例数据'), h('a', { href: '/' }, '首页'), h('a', { href: '/watch' }, '播放页'), h('a', { href: '/feed' }, '动态'),
  h('a', { href: 'http://127.0.0.1:4334/#classic', target: '_blank' }, '搜索双版'));
if (location.pathname === '/') {
  const slow = h('input', { type: 'checkbox' }); slow.addEventListener('change', () => { slowRequests = slow.checked; });
  const fail = h('input', { type: 'checkbox' }); fail.addEventListener('change', () => { failRequests = fail.checked; });
  controls.append(h('label', {}, slow, '慢加载'), h('label', {}, fail, '模拟失败'));
}
document.body.append(controls);
Object.assign(window, { previewSettings: saveSettings });
