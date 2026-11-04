import { appDislike, appRecommended } from '../../api/appfeed';
import { account, resetDynamicBaseline } from '../../api/account';
import { dislike, popular, recommended, type Video } from '../../api/feed';
import { followClassics, resetClassics } from '../../api/space';
import { BackgroundLayer } from '../../bg/background';
import { FilterRuntime } from '../../filter-runtime';
import { targetOfVideo } from '../../filter-targets';
import { reducedMotion } from '../../motion';
import { noteNegative, rerank, resetRank } from '../../rank';
import { saveSettings, type Settings } from '../../../shared/settings';
import { bindCardMenu } from '../card-menu';
import { createCommandPalette } from '../command-palette';
import { createContextMenu } from '../context-menu';
import { toast } from '../controls';
import { h, icon, ICONS } from '../dom';
import { createFavorites } from '../favorites';
import { createLaterDrawer } from '../drawer';
import { attachPreview } from '../preview';
import { createSettingsPanel, type SettingsPanel } from '../settings-panel';
import type { Sheet } from '../sheet';
import { ytCard, ytSkeleton } from './card';
import { createYtHeader, type YtHeader } from './header';
import { createYtSidebar, type YtSidebar, type YtTab } from './sidebar';
import css from '../../styles/index';
import ytCss from '../../yt.css?inline';

const PARTITIONS: [string, string][] = [
  ['动画', 'c/douga/'], ['游戏', 'c/game/'], ['知识', 'c/knowledge/'], ['科技', 'c/tech/'],
  ['音乐', 'c/music/'], ['影视', 'c/cinephile/'], ['番剧', 'anime/'], ['生活', 'c/life/'],
  ['美食', 'c/food/'], ['鬼畜', 'c/kichiku/'],
];

/**
 * YouTube 风格首页（设置 → 外观 → YouTube 风格首页）。
 * 独立模块：只复用数据层、过滤器、卡片菜单和各类面板，不碰映间首页。
 */
export class YtHomeApp {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private app!: HTMLElement;
  private grid!: HTMLElement;
  private status!: HTMLElement;
  private sentinel!: HTMLElement;
  private chips!: HTMLElement;
  private scrim!: HTMLElement;
  private header!: YtHeader;
  private side!: YtSidebar;
  private panel!: SettingsPanel;
  private fav!: Sheet;
  private later!: ReturnType<typeof createLaterDrawer>;
  private bg = new BackgroundLayer();
  private filter: FilterRuntime;
  private settings: Settings;
  private tab: YtTab = 'rcmd';
  private round = 1;
  private appIdx = 0;
  private appHinted = false;
  private page = 1;
  private loading = false;
  private done = false;
  private items: Video[] = [];
  private seen = new Set<string>();
  private gen = 0;
  private media = matchMedia('(prefers-color-scheme: dark)');
  private fadeTimer = 0;
  private scrollT = 0;
  private chipMap = new Map<YtTab, HTMLElement>();

  constructor(settings: Settings) {
    this.settings = settings;
    this.filter = new FilterRuntime(settings);
    this.host = h('div', { id: 'margin-root' });
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.append(h('style', {}, css), h('style', {}, ytCss));
    this.render();
    this.applyTheme();
    this.media.addEventListener('change', () => this.applyTheme());
  }

  update(s: Settings): void {
    const prev = this.settings;
    this.settings = s;
    if (this.filter.update(s)) this.repaint();
    if ((prev.appFeed !== s.appFeed || prev.rerank !== s.rerank) && this.tab === 'rcmd') this.reload();
    if (prev.homeHide.join() !== s.homeHide.join()) this.repaint();
    if (prev.headHide.join() !== s.headHide.join() || prev.headOrder.join() !== s.headOrder.join()) this.side.setPrefs(s.headHide, s.headOrder);
    if (prev.reduceMotion !== s.reduceMotion || prev.theme !== s.theme || prev.palette !== s.palette || JSON.stringify(prev.bg) !== JSON.stringify(s.bg)) this.applyTheme();
    if (prev.msgRemind !== s.msgRemind) this.syncRemind();
    this.panel.sync(s);
  }

  private resolvedTheme(): 'light' | 'dark' {
    const t = this.settings.theme;
    return t === 'auto' ? (this.media.matches ? 'dark' : 'light') : t;
  }

  private applyTheme(): void {
    const t = this.resolvedTheme();
    this.app.dataset.theme = t;
    this.app.dataset.palette = this.settings.palette;
    this.app.dataset.bg = this.settings.bg.mode;
    this.app.classList.toggle('margin-reduce', this.settings.reduceMotion);
    this.header.setTheme(t);
    this.bg.apply(this.settings.bg, t, this.settings.palette).then(() => this.panel?.sync(this.settings));
  }

  private render(): void {
    this.panel = createSettingsPanel(() => this.settings, () => this.bg.shader);
    this.fav = createFavorites((g) => attachPreview(g, () => this.settings.hoverPreview), () => this.settings.favDirect, this.filter);
    const later = createLaterDrawer(() => this.app, this.filter);
    this.later = later;
    const palette = createCommandPalette([
      { id: 'refresh', title: '换一批推荐', cat: '操作', icon: ICONS.refresh, keys: ['刷新', 'refresh'], run: () => this.reload() },
      { id: 'rcmd', title: '看推荐', cat: '跳转', icon: ICONS.moments, keys: ['首页'], run: () => this.setTab('rcmd') },
      { id: 'popular', title: '看热门', cat: '跳转', icon: ICONS.heat, keys: ['popular', '排行'], run: () => this.setTab('popular') },
      { id: 'classic', title: '看关注的 UP 的老视频', cat: '跳转', icon: ICONS.history, keys: ['老片', 'classic'], run: () => this.setTab('classic') },
      { id: 'fav', title: '打开收藏夹', cat: '操作', icon: ICONS.fav, keys: ['收藏'], run: () => this.fav.open() },
      { id: 'later', title: '稍后再看', cat: '操作', icon: ICONS.later, keys: ['watchlater'], run: () => later.open() },
      { id: 'settings', title: '打开设置', cat: '操作', icon: ICONS.gear, keys: ['背景', '过滤', '屏蔽'], run: () => this.panel.sheet.open() },
      { id: 'theme', title: '切换亮色 / 暗色', cat: '操作', icon: ICONS.moon, keys: ['主题', '夜间', 'dark', 'light'], run: () => this.toggleTheme() },
      { id: 'top', title: '回到顶部', cat: '操作', icon: ICONS.top, run: () => this.app.scrollTo({ top: 0, behavior: 'smooth' }) },
      { id: 'moments', title: '动态', cat: '跳转', icon: ICONS.moments, run: () => window.open('https://t.bilibili.com/', '_blank', 'noopener') },
      { id: 'history', title: '观看历史', cat: '跳转', icon: ICONS.history, run: () => window.open('https://www.bilibili.com/history', '_blank', 'noopener') },
      { id: 'message', title: '消息', cat: '跳转', icon: ICONS.message, run: () => window.open('https://message.bilibili.com/', '_blank', 'noopener') },
      { id: 'off', title: '本次回到 B 站原版', cat: '操作', icon: ICONS.exit, keys: ['原版', '关闭'], run: () => { sessionStorage.setItem('margin:off', '1'); location.reload(); } },
    ]);
    const cm = createContextMenu();

    this.header = createYtHeader({
      onTheme: () => this.toggleTheme(),
      onMenu: () => this.toggleSide(),
      onSearch: (q) => window.open(`https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`, '_blank', 'noopener'),
      onSettings: () => this.panel.sheet.open(),
      msgRemind: () => this.settings.msgRemind,
      onDyn: (n) => this.side?.setDynBadge(n),
    });
    this.side = createYtSidebar({
      onTab: (t) => this.setTab(t),
      onFav: () => this.fav.open(),
      onLater: () => later.open(),
      onDyn: () => { resetDynamicBaseline(); this.side.setDynBadge(0); this.closeSide(); },
      headHide: this.settings.headHide,
      headOrder: this.settings.headOrder,
    });
    this.chips = this.buildChips();
    this.grid = h('section', { class: 'yt-grid', 'aria-live': 'polite' });
    this.status = h('div', { class: 'status' });
    this.sentinel = h('div', { class: 'sentinel' });
    this.scrim = h('div', { class: 'yt-scrim', hidden: '', onclick: () => this.closeSide() });
    attachPreview(this.grid, () => this.settings.hoverPreview);

    this.app = h('div', { class: 'app yt' },
      this.bg.el,
      this.header.el,
      this.side.el,
      this.scrim,
      h('main', { class: 'yt-main' }, this.chips, this.grid, this.status, this.sentinel),
      this.panel.sheet.el,
      this.fav.el,
      later.el,
      palette.el,
    );
    this.root.append(this.app);

    bindCardMenu(this.grid, cm, () => this.app, {
      onBlock: (v) => this.blockUp(v),
      onLater: () => later.open(),
      onDislike: (v, el) => this.nope(v, el),
    });
    const favGrid = this.fav.el.querySelector('.fav-grid') as HTMLElement | null;
    if (favGrid) bindCardMenu(favGrid, cm, () => this.app, { onLater: () => later.open() });
    this.app.append(cm.el);

    new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) this.load(); }, { root: this.app, rootMargin: '900px 0px' }).observe(this.sentinel);
    this.app.addEventListener('scroll', () => {
      this.bg.redraw();
      clearTimeout(this.scrollT);
      this.scrollT = window.setTimeout(() => {
        this.bg.cap(this.app.scrollTop > innerHeight * 0.8 ? 30 : 0);
        this.fillIfShort();
      }, 160);
    }, { passive: true });

    addEventListener('keydown', (e) => {
      if (!this.settings.cmdK) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.open(); }
    });

    this.side.setTab(this.tab);
    this.updateChips();
    this.syncRemind();
    this.load();
  }

  private buildChips(): HTMLElement {
    const row = h('div', { class: 'yt-chips', role: 'tablist', 'aria-label': '首页分类' });
    for (const [tab, label] of [['rcmd', '推荐'], ['popular', '热门'], ['classic', '关注老片']] as [YtTab, string][]) {
      const b = h('button', { class: 'yt-chip', type: 'button', role: 'tab', onclick: () => this.setTab(tab) }, label);
      b.dataset.tab = tab;
      this.chipMap.set(tab, b);
      row.append(b);
    }
    for (const [label, path] of PARTITIONS) {
      row.append(h('a', { class: 'yt-chip', href: `https://www.bilibili.com/${path}`, target: '_blank', rel: 'noopener' }, label));
    }
    row.append(h('button', { class: 'yt-chip yt-chip-refresh', type: 'button', title: '换一批', onclick: () => this.reload() }, icon(ICONS.refresh), h('span', {}, '换一批')));
    return row;
  }

  private updateChips(): void {
    for (const [tab, b] of this.chipMap) b.toggleAttribute('data-active', tab === this.tab);
  }

  private setTab(tab: YtTab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.side.setTab(tab);
    this.updateChips();
    this.closeSide();
    this.reload();
  }

  private toggleSide(): void {
    const open = this.side.el.getAttribute('data-open') === 'true';
    this.side.el.toggleAttribute('data-open', !open);
    this.scrim.hidden = open;
  }

  private closeSide(): void {
    this.side.el.removeAttribute('data-open');
    this.scrim.hidden = true;
  }

  private async toggleTheme(): Promise<void> {
    const next = this.resolvedTheme() === 'dark' ? 'light' : 'dark';
    if (!reducedMotion()) {
      this.app.classList.add('theme-fading');
      this.app.style.setProperty('--fade', '300ms');
      clearTimeout(this.fadeTimer);
      this.fadeTimer = window.setTimeout(() => this.app.classList.remove('theme-fading'), 400);
    }
    this.settings = { ...this.settings, theme: next };
    this.applyTheme();
    await saveSettings({ theme: next });
  }

  private cardOpts() {
    return { hide: new Set<string>(this.settings.homeHide) };
  }

  private async nope(v: Video, el: HTMLElement): Promise<void> {
    const at = this.items.indexOf(v);
    if (at >= 0) this.items.splice(at, 1);
    el.classList.add('gone');
    window.setTimeout(() => { el.remove(); this.fillIfShort(); }, 220);
    try {
      noteNegative(v.mid);
      const fb = (cancel = false) => (v.goto === 'app' ? appDislike(v, 1, cancel) : dislike(v, 1, cancel));
      await fb();
      toast(this.app, '好的，以后少推这类视频', { label: '撤销', run: async () => {
        await fb(true).catch(() => {});
        if (!this.items.includes(v)) { this.items.splice(Math.max(0, at), 0, v); this.repaint(); }
      } });
    } catch (e) {
      toast(this.app, `没能告诉 B 站：${(e as Error).message || '请先登录'}，这张卡片只在本次隐藏`);
    }
  }

  private async blockUp(v: Video): Promise<void> {
    const before = this.settings.filters.ups;
    if (before.includes(v.author) || before.includes(String(v.mid))) return;
    await saveSettings({ filters: { ...this.settings.filters, ups: [...before, v.author] } });
    noteNegative(v.mid, 2);
    if (v.goto === 'app') appDislike(v, 4).catch(() => {});
    else if (v.trackId) dislike(v, 4).catch(() => {});
    toast(this.app, `已屏蔽「${v.author}」`, { label: '撤销', run: () => saveSettings({ filters: { ...this.settings.filters, ups: this.settings.filters.ups.filter((u) => u !== v.author) } }) });
  }

  private reload(): void {
    this.gen++;
    this.grid.replaceChildren();
    this.items = [];
    this.seen.clear();
    this.done = false;
    this.loading = false;
    this.page = 1;
    this.round++;
    this.appIdx = 0;
    resetRank();
    resetClassics();
    this.app.scrollTo({ top: 0 });
    this.load();
  }

  private repaint(): void {
    const gen = this.gen;
    void this.filter.prepare(this.items.map((v) => v.bvid)).then(() => {
      if (gen !== this.gen) return;
      const shown = this.items.filter((v) => this.filter.allows(targetOfVideo(v)));
      this.grid.replaceChildren(...shown.map((v, i) => ytCard(v, i, this.cardOpts())));
      this.fillIfShort();
    });
  }

  private fillIfShort(): void {
    if (this.done || this.loading || !this.sentinel.isConnected) return;
    const a = this.app;
    const left = a.scrollHeight - a.scrollTop - a.clientHeight;
    const r = this.sentinel.getBoundingClientRect();
    if (left < 1200 || r.top < innerHeight + 900) this.load();
  }

  private async load(attempt = 0): Promise<void> {
    if (this.loading || this.done) return;
    this.loading = true;
    const gen = this.gen;
    const sk = ytSkeleton(this.grid.children.length ? 4 : 12);
    const skNodes = [...sk.childNodes];
    this.grid.append(sk);
    this.status.replaceChildren();
    let added = 0;
    try {
      let list: Video[];
      if (this.tab === 'rcmd' && this.settings.appFeed) {
        const a = await appRecommended(this.appIdx);
        const b = await appRecommended(a.next);
        this.appIdx = b.next;
        list = [...a.list, ...b.list];
        if (!a.personal && !this.appHinted) { this.appHinted = true; toast(this.app, '正在用 App 推荐（未授权，不是个性化的）。在设置 → 实验功能里扫码授权'); }
      } else if (this.tab === 'rcmd') {
        const batches = await Promise.all([recommended(this.round), recommended(this.round + 1)]);
        this.round += 2;
        list = batches.flat();
      } else if (this.tab === 'classic') {
        const me = (await account())?.mid;
        if (!me) throw new Error('登录后才能看关注的 UP 主');
        const r = await followClassics(me);
        list = r.list;
        this.done = r.done;
      } else {
        const r = await popular(this.page++);
        list = r.list;
        this.done = r.done;
      }
      if (this.tab === 'rcmd' && this.settings.rerank) list = await rerank(list, this.items.slice(-3).map((x) => x.mid), this.seen).catch(() => list);
      if (gen !== this.gen) return;
      await this.filter.prepare(list.map((v) => v.bvid));
      if (gen !== this.gen) return;
      skNodes.forEach((n) => (n as Element).remove());
      const start = this.grid.children.length;
      for (const v of list) {
        if (this.seen.has(v.bvid)) continue;
        this.seen.add(v.bvid);
        this.items.push(v);
        if (!this.filter.allows(targetOfVideo(v))) continue;
        this.grid.append(ytCard(v, start + added++, this.cardOpts()));
      }
      if (this.done) this.status.replaceChildren(h('span', {}, '没有更多了'));
    } catch (err) {
      if (gen !== this.gen) return;
      skNodes.forEach((n) => (n as Element).remove());
      if (attempt < 2) { this.loading = false; window.setTimeout(() => { if (gen === this.gen) this.load(attempt + 1); }, 800 * (attempt + 1)); return; }
      this.status.replaceChildren(h('span', {}, `加载失败：${(err as Error).message}`), h('button', { class: 'ghost small', type: 'button', onclick: () => this.load() }, '重试'));
      return;
    } finally {
      if (gen === this.gen) this.loading = false;
    }
    if (gen === this.gen && added < 6 && attempt < 4) this.load(attempt + 1);
    else if (gen === this.gen) requestAnimationFrame(() => this.fillIfShort());
  }

  private syncRemind(): void {
    this.header?.setMsgRemind(this.settings.msgRemind);
    if (!this.settings.msgRemind) this.side?.setDynBadge(0);
  }
}
