import { h, icon, ICONS } from '../dom';

export type YtTab = 'rcmd' | 'popular' | 'classic';

interface Item {
  label: string;
  icon: string;
  tab?: YtTab;
  href?: string;
  run?: () => void;
  /** 带未读角标的项 */
  badge?: boolean;
}

interface Group { title?: string; items: Item[] }

export interface YtSidebar {
  el: HTMLElement;
  setTab(tab: YtTab): void;
  setDynBadge(n: number): void;
  setPrefs(headHide: string[], headOrder: string[]): void;
  close(): void;
}

const HOME = '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>';

/** YouTube 式左侧导航：入口全部映射到 B 站现有页面 / 面板 */
export function createYtSidebar(o: {
  onTab: (t: YtTab) => void;
  onFav: () => void;
  onLater: () => void;
  onDyn: () => void;
  headHide: string[];
  headOrder: string[];
}): YtSidebar {
  const groups: Group[] = [
    { items: [
      { label: '首页', icon: HOME, tab: 'rcmd' },
      { label: '热门', icon: ICONS.heat, tab: 'popular' },
      { label: '关注老片', icon: ICONS.history, tab: 'classic' },
      { label: '直播', icon: ICONS.live, href: 'https://live.bilibili.com/' },
    ] },
    { title: '订阅', items: [
      { label: '动态', icon: ICONS.moments, href: 'https://t.bilibili.com/', run: o.onDyn, badge: true },
      { label: '收藏', icon: ICONS.fav, run: o.onFav },
      { label: '历史', icon: ICONS.history, href: 'https://www.bilibili.com/history' },
      { label: '稍后', icon: ICONS.later, run: o.onLater },
    ] },
    { title: '更多', items: [
      { label: '分区', icon: ICONS.zone, href: 'https://www.bilibili.com/anime/' },
      { label: '大会员', icon: ICONS.vip, href: 'https://account.bilibili.com/big' },
      { label: '消息', icon: ICONS.message, href: 'https://message.bilibili.com/' },
      { label: '创作中心', icon: ICONS.creator, href: 'https://member.bilibili.com/platform/home' },
    ] },
  ];

  const el = h('aside', { class: 'yt-sidebar', 'aria-label': '导航' });
  const tabs: HTMLElement[] = [];
  const all: HTMLElement[] = [];
  let dynBadge: HTMLElement | null = null;

  for (const g of groups) {
    const block = h('div', { class: 'yt-side-group' });
    if (g.title) block.append(h('div', { class: 'yt-side-title' }, g.title));
    for (const it of g.items) {
      const badge = it.badge ? h('i', { class: 'yt-side-badge', hidden: '' }) : null;
      if (badge) dynBadge = badge;
      const body: (Node | string | null)[] = [icon(it.icon), h('span', { class: 'yt-side-label' }, it.label), badge];
      const node = it.href
        ? h('a', { class: 'yt-side-item', href: it.href, target: '_blank', rel: 'noopener' }, ...body)
        : h('button', { class: 'yt-side-item', type: 'button' }, ...body);
      node.dataset.pref = it.label;
      all.push(node);
      if (it.tab) {
        node.dataset.tab = it.tab;
        tabs.push(node);
        node.addEventListener('click', () => o.onTab(it.tab!));
      } else if (it.run) {
        // 外链不拦截默认行为：先记一遍动作（例如清动态基线），再照常打开
        node.addEventListener('click', () => it.run!());
      }
      block.append(node);
    }
    el.append(block);
  }

  /** 设置里的「顶栏入口」在 YouTube 模式下映射到左侧导航：隐藏同名项，并按 B 站入口顺序排序 */
  const setPrefs = (headHide: string[], headOrder: string[]) => {
    const order = new Map(headOrder.map((t, i) => [t, i]));
    for (const node of all) {
      const label = node.dataset.pref ?? '';
      node.hidden = label !== '设置' && headHide.includes(label);
      const oi = order.get(label);
      node.style.order = oi == null ? '' : String(oi);
    }
    el.querySelectorAll<HTMLElement>('.yt-side-group').forEach((g) => {
      const kids = [...g.querySelectorAll<HTMLElement>('.yt-side-item')];
      g.hidden = kids.length > 0 && kids.every((n) => n.hidden);
    });
  };
  setPrefs(o.headHide, o.headOrder);

  const setTab = (tab: YtTab) => {
    for (const n of tabs) n.toggleAttribute('data-active', n.dataset.tab === tab);
  };
  const setDynBadge = (n: number) => {
    if (!dynBadge) return;
    dynBadge.textContent = n > 99 ? '99+' : String(n);
    dynBadge.hidden = n <= 0;
  };
  const close = () => el.removeAttribute('data-open');
  return { el, setTab, setDynBadge, setPrefs, close };
}
