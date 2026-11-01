import { followFeed, type Dyn } from '../api/dyn';
import { h } from './dom';

/** 悬停多久才弹出：只是路过顶栏时不打扰 */
const OPEN_DELAY = 1500;
const CLOSE_DELAY = 220;

function ago(ts: number, fallback: string): string {
  if (!ts) return fallback;
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return fallback;
}

function summary(d: Dyn): { line: string; cover: string; kind: string } {
  if (d.video) return { line: d.video.title, cover: d.video.cover, kind: '视频' };
  if (d.article) return { line: d.article.title, cover: d.article.cover, kind: '专栏' };
  const o = d.orig;
  if (o && !d.text) {
    const s = summary(o);
    return { line: `转发 @${o.author}：${s.line}`, cover: s.cover, kind: '转发' };
  }
  return { line: d.title || d.text || '分享了动态', cover: d.pics[0] ?? '', kind: d.pics.length ? '图文' : '动态' };
}

const thumb = (src: string, w: number, hh: number) => (src ? `${src}@${w}w_${hh}h_1c.webp` : '');
const img = (src: string, cls: string, w: number, hh = w) =>
  h('img', { class: cls, src: thumb(src, w, hh), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });

function row(d: Dyn): HTMLElement {
  const s = summary(d);
  return h('a', { class: 'dp-row', href: d.url, target: '_blank', rel: 'noopener' },
    img(d.face, 'dp-face', 64),
    h('div', { class: 'dp-body' },
      h('div', { class: 'dp-meta' }, h('b', {}, d.author), h('span', {}, `${ago(d.ts, d.time)} · ${s.kind}`)),
      h('p', { class: 'dp-line' }, s.line)),
    s.cover ? img(s.cover, 'dp-cover', 128, 72) : '');
}

/**
 * 顶栏「动态」悬停列表：指针在按钮上停满 1.5 秒才弹出最新关注动态，
 * 移进面板可继续浏览，离开后稍等再收起。
 */
export function attachDynPopover(btn: HTMLElement, onOpen?: () => void): void {
  const pop = h('div', { class: 'dp', role: 'dialog', 'aria-label': '最新动态', hidden: '' });
  const list = h('div', { class: 'dp-list' });
  pop.append(
    h('div', { class: 'dp-head' }, h('span', {}, '最新动态'), h('a', { href: 'https://t.bilibili.com/', target: '_blank', rel: 'noopener' }, '全部动态 →')),
    list,
  );
  let openT = 0, closeT = 0, loadedAt = 0, open = false;

  const load = () => {
    if (Date.now() - loadedAt < 60_000 && list.childElementCount) return;
    loadedAt = Date.now();
    list.replaceChildren(...Array.from({ length: 4 }, () => h('div', { class: 'dp-skel' })));
    followFeed('all', '').then((r) => {
      const items = r.list.slice(0, 8);
      list.replaceChildren(...(items.length ? items.map(row) : [h('p', { class: 'dp-empty' }, '还没有新动态')]));
    }).catch(() => {
      loadedAt = 0;
      list.replaceChildren(h('p', { class: 'dp-empty' }, '登录后可在这里看到关注的最新动态'));
    });
  };

  const place = () => {
    // 挂在顶栏里（顶栏 z-index 高于正文），按顶栏坐标定位
    const host = pop.parentElement ?? btn;
    const r = btn.getBoundingClientRect(), o = host.getBoundingClientRect();
    const w = 360;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
    pop.style.left = `${left - o.left}px`;
    pop.style.top = `${r.bottom - o.top + 10}px`;
  };

  const show = () => {
    if (open) return;
    open = true;
    const host = btn.closest('header') ?? btn.parentElement!;
    if (pop.parentNode !== host) host.append(pop);
    place(); load();
    pop.hidden = false;
    requestAnimationFrame(() => pop.setAttribute('data-open', ''));
    btn.setAttribute('aria-expanded', 'true');
    onOpen?.();
  };
  const hide = () => {
    if (!open) return;
    open = false;
    pop.removeAttribute('data-open');
    btn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!open) pop.hidden = true; }, 200);
  };

  const enter = (e: Event) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    clearTimeout(closeT);
    if (!open) { clearTimeout(openT); openT = window.setTimeout(show, OPEN_DELAY); }
  };
  const leave = () => { clearTimeout(openT); clearTimeout(closeT); closeT = window.setTimeout(hide, CLOSE_DELAY); };
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('pointerenter', enter);
  btn.addEventListener('pointerleave', leave);
  btn.addEventListener('click', () => { clearTimeout(openT); hide(); });
  pop.addEventListener('pointerenter', () => clearTimeout(closeT));
  pop.addEventListener('pointerleave', leave);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  addEventListener('resize', () => { if (open) place(); });
}
