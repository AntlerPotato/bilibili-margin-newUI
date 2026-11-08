const listeners = new Set<(changes: any, area: string) => void>();
const stored = JSON.parse(localStorage.getItem('margin-preview-store') || '{}');
stored['margin:settings'] ??= { theme: 'dark', intro: false, weather: false, appFeed: false, homeHide: ['search'], bg: { mode: 'off' } };
const storage = {
  async get(keys: string | string[] | null) {
    return keys == null ? { ...stored } : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, stored[k]]));
  },
  async set(values: Record<string, unknown>) {
    const changes = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { oldValue: stored[k], newValue: v }]));
    Object.assign(stored, values);
    localStorage.setItem('margin-preview-store', JSON.stringify(stored));
    listeners.forEach(fn => fn(changes, 'local'));
  },
  async remove(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete stored[k];
    localStorage.setItem('margin-preview-store', JSON.stringify(stored));
  },
};
Object.assign(window, { chrome: {
  storage: { local: storage, onChanged: { addListener: (fn: any) => listeners.add(fn), removeListener: (fn: any) => listeners.delete(fn) } },
  runtime: {
    getURL: (path: string) => new URL('/' + path, location.origin).href,
    getManifest: () => ({ version: '0.60.8', version_name: '0.6.8 Preview' }),
    sendMessage: async () => ({ ok: true }),
  },
} });
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/^https:\/\//.test(url)) return nativeFetch('/preview-api?url=' + encodeURIComponent(url), { signal: init?.signal });
  return nativeFetch(input, init);
};
const { loadSettings, onSettingsChange, saveSettings } = await import('../src/shared/settings');
const { injectFonts } = await import('../src/content/fonts');
const { setUiEffects, setUserReducedMotion } = await import('../src/content/motion');
injectFonts();
const settings = await loadSettings();
const classic = location.hash === '#classic';
setUiEffects(settings.uiEffects);
setUserReducedMotion(settings.reduceMotion);
let app: { update(s: any): void };
if (location.pathname === '/watch') {
  document.body.innerHTML = `<main class="preview-watch"><h1>映间 · 搜索交互预览</h1><div class="preview-columns"><div class="preview-player"><span>播放页</span></div><aside><b>映间 MARGIN</b><p>视频信息</p></aside></div></main>`;
  const style = document.createElement('style');
  style.textContent = `.preview-watch{position:relative;z-index:2147483001;padding:100px 32px 40px;font-family:"Geist","Margin Sans SC",sans-serif;color:var(--text1,#eee)}.preview-watch h1{font-size:22px;margin:24px 0}.preview-columns{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px}.preview-player{aspect-ratio:16/9;display:grid;place-items:center;background:#151618;border-radius:18px;color:#888}.preview-columns aside{padding:28px;height:130px;border-radius:18px;background:#27282b}#margin-watch-top{position:relative;z-index:2147483002}@media(max-width:900px){.preview-columns{grid-template-columns:1fr}}`;
  document.head.append(style);
  const { WatchSkin } = await import('../src/content/ui/watch');
  app = new WatchSkin(settings, 'page');
} else {
  const { MarginApp } = await import('../src/content/ui/app');
  const home = new MarginApp(settings);
  document.body.append(home.host);
  app = home;
}
onSettingsChange(s => { app.update(s); setUiEffects(s.uiEffects); setUserReducedMotion(s.reduceMotion); });
if (classic) {
  const host = document.getElementById(location.pathname === '/watch' ? 'margin-watch-top' : 'margin-root')!;
  const root = host.shadowRoot!;
  const surface = root.querySelector<HTMLElement>('.app')!;
  root.querySelectorAll('.hs-slot,.hs-scrim').forEach(el => el.remove());
  const { createHeroSearch } = await import('../src/content/ui/hero-search');
  const search = createHeroSearch(() => surface);
  search.el.classList.add('preview-classic-search');
  root.querySelector('.top .search')!.replaceWith(search.el);
  surface.append(search.scrim);
  const style = document.createElement('style');
  style.textContent = `.app:is(.home,.wt) .top .preview-classic-search{display:block;width:100%;margin:0;height:56px;min-width:0}.app:is(.home,.wt) .top .preview-classic-search .hero-search{display:flex}.app.home[data-hide~="search"]>.hs-scrim{display:block}.app.hs-open .top{z-index:10}.top .preview-classic-search .hs-input,.top .preview-classic-search .hs-ph{font-size:16px}`;
  root.append(style);
}
const controls = document.createElement('nav');
controls.setAttribute('aria-label', '预览控制');
const suffix = classic ? '#classic' : '#new';
controls.innerHTML = `<a href="/${suffix}">首页</a><a href="/watch${suffix}">播放页</a><label>搜索版本 <select aria-label="搜索版本"><option value="new">新版</option><option value="classic">旧版 · 首页搜索栏</option></select></label>${classic ? '' : '<label>展开速度 <select aria-label="展开速度"><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option></select></label>'}`;
const uiStyle = document.createElement('style');
uiStyle.textContent = `body>nav{position:fixed;z-index:2147483646;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:16px;align-items:center;padding:10px 18px;border-radius:24px;border:1px solid #ffffff26;background:#202124ed;color:#eee;font:12px "Geist","Margin Sans SC",sans-serif;box-shadow:0 4px 20px #0002}body>nav a{color:inherit;text-decoration:none}body>nav label{display:flex;gap:8px;align-items:center}body>nav select{background:#333;color:#eee;border:0;border-radius:6px;padding:4px}`;
document.head.append(uiStyle);
document.body.append(controls);
const version = controls.querySelector<HTMLSelectElement>('[aria-label="搜索版本"]')!;
version.value = classic ? 'classic' : 'new';
version.addEventListener('change', () => { location.hash = version.value; });
addEventListener('hashchange', () => location.reload());
const speed = controls.querySelector<HTMLSelectElement>('[aria-label="展开速度"]');
if (speed) {
  speed.value = String(settings.paletteSpeed);
  speed.addEventListener('change', () => saveSettings({ paletteSpeed: Number(speed.value) }));
}
Object.assign(window, { previewSettings: saveSettings });
