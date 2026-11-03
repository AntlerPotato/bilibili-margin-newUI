import { account, dynamicUpdates, unreadTotal } from '../../api/account';
import { every } from '../../sched';
import { h, icon, ICONS, setMarkup } from '../dom';
import { BILI_TIGHT } from '../intro/logo';
import { attachTooltips } from '../tooltip';
import { liveTv } from '../tv-eyes';
import { createUserMenu } from '../user-menu';

export interface YtHeader {
  el: HTMLElement;
  input: HTMLInputElement;
  /** 消息铃铛的未读数；0 时隐藏角标 */
  setMsgBadge(n: number): void;
  /** 消息提醒关闭时清掉角标；之后的轮询由首页控制器负责 */
  setMsgRemind(on: boolean): void;
  /** 主题切换按钮显示当前主题对应的图标 */
  setTheme(theme: 'light' | 'dark'): void;
}

const BELL = '<path d="M12 21a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 21Z"/><path d="M18 16.2V11a6 6 0 1 0-12 0v5.2L4.5 18h15z"/>';
const MENU = '<path d="M4 7h16M4 12h16M4 17h16"/>';

function tv(): HTMLElement {
  const s = h('span', { class: 'yt-tv', 'aria-hidden': 'true' });
  setMarkup(s, BILI_TIGHT);
  liveTv(s);
  return s;
}

/** YouTube 式顶栏：左菜单/品牌，中间搜索，右边投稿、消息、主题、头像 */
export function createYtHeader(o: {
  onTheme: () => void;
  onMenu: () => void;
  onSearch: (q: string) => void;
  msgRemind: () => boolean;
  /** 动态未读数（首页侧栏用；播放页/接管页不需要） */
  onDyn?: (n: number) => void;
}): YtHeader {
  const menu = h('button', { class: 'yt-menu', type: 'button', title: '菜单', 'aria-label': '打开导航', onclick: o.onMenu }, icon(MENU));
  const brand = h('a', { class: 'yt-brand', href: 'https://www.bilibili.com/', title: '首页', 'aria-label': '首页' }, tv(), h('b', {}, 'bilibili'));

  const input = h('input', { type: 'search', placeholder: '搜索视频、UP 主', autocomplete: 'off', 'aria-label': '搜索' }) as HTMLInputElement;
  const form = h('form', { class: 'yt-search', role: 'search' });
  form.append(input, h('button', { class: 'yt-search-btn', type: 'submit', title: '搜索', 'aria-label': '搜索' }, icon(ICONS.search)));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) o.onSearch(q);
  });

  const upload = h('a', { class: 'yt-create', href: 'https://member.bilibili.com/platform/upload/video/frame', target: '_blank', rel: 'noopener', title: '投稿' }, icon(ICONS.upload), h('span', {}, '投稿'));
  const badge = h('i', { class: 'yt-badge', hidden: '' });
  const bell = h('a', { class: 'yt-bell', href: 'https://message.bilibili.com/', target: '_blank', rel: 'noopener', title: '消息', 'aria-label': '消息' }, icon(BELL), badge);
  const themeBtn = h('button', { class: 'yt-theme', type: 'button', title: '切换亮色 / 暗色', 'aria-label': '切换亮色 / 暗色', onclick: o.onTheme }, icon(ICONS.moon));
  const user = h('a', { class: 'user', href: 'https://passport.bilibili.com/login', target: '_blank', rel: 'noopener' }, '登录');
  const userSlot = h('div', { class: 'um-wrap' }, user);

  const el = h('header', { class: 'yt-top' }, h('div', { class: 'yt-left' }, menu, brand), form, h('div', { class: 'yt-acts' }, upload, bell, themeBtn, userSlot));

  account().then((a) => { if (a) userSlot.replaceWith(createUserMenu(a)); }).catch(() => {});
  attachTooltips(el);

  const setMsgBadge = (n: number) => {
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n <= 0;
    bell.setAttribute('aria-label', n > 0 ? `消息，${n} 条未读` : '消息');
  };
  // 未读轮询放在顶栏里：首页、播放页、接管页共用同一套消息提醒逻辑
  let polled = 0;
  const poll = () => {
    if (!o.msgRemind() || document.hidden) return;
    polled = Date.now();
    unreadTotal().then((n) => setMsgBadge(n)).catch(() => {});
    dynamicUpdates().then((n) => o.onDyn?.(n)).catch(() => {});
  };
  every(120_000, poll);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - polled > 30_000) poll(); });
  poll();

  const setMsgRemind = (on: boolean) => {
    if (!on) { setMsgBadge(0); o.onDyn?.(0); }
    else poll();
  };
  const setTheme = (theme: 'light' | 'dark') => {
    themeBtn.replaceChildren(icon(theme === 'dark' ? ICONS.sun : ICONS.moon));
    themeBtn.setAttribute('aria-label', theme === 'dark' ? '切换到亮色' : '切换到暗色');
  };
  setTheme('light');
  return { el, input, setMsgBadge, setMsgRemind, setTheme };
}
