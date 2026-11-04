import type { Video } from '../../api/feed';
import { cardData } from '../card';
import { fmtAgo, fmtCount, fmtDuration, h, icon } from '../dom';
import { laterButton } from '../later-btn';

export interface YtCardOpts {
  /** 首页「卡片信息」里关掉的项（author / views / ago / dur / reason） */
  hide?: ReadonlySet<string>;
}

const MORE = '<circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>';
const thumb = (url: string) => (url ? `${url}@672w_378h_1c.webp` : '');

/** YouTube 式卡片：大缩略图 + 头像 + 两行标题 + 作者/播放/时间 + ⋮ */
export function ytCard(v: Video, index: number, opts: YtCardOpts = {}): HTMLElement {
  const href = `https://www.bilibili.com/video/${v.bvid}`;
  const space = `https://space.bilibili.com/${v.mid}`;
  const cover = h('a', { class: 'cover yt-thumb', href, target: '_blank', rel: 'noopener', title: v.title },
    h('img', { src: thumb(v.cover), alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }),
    v.duration && !opts.hide?.has('dur') ? h('span', { class: 'dur' }, fmtDuration(v.duration)) : null,
    laterButton(v.bvid),
  );
  const face = v.face ? `${v.face}@72w_72h_1c.webp` : '';
  const meta = h('div', { class: 'yt-meta' });
  const parts: (Node | null)[] = [];
  if (!opts.hide?.has('author')) parts.push(h('a', { class: 'yt-author', href: space, target: '_blank', rel: 'noopener' }, v.author));
  if (!opts.hide?.has('views')) parts.push(h('span', {}, `${fmtCount(v.views)} 播放`));
  if (v.pubdate && !opts.hide?.has('ago')) parts.push(h('span', {}, fmtAgo(v.pubdate)));
  parts.forEach((n, i) => { if (i) meta.append(h('span', { class: 'yt-dot' }, '·')); if (n) meta.append(n); });
  if (!parts.length) meta.hidden = true;

  const more = h('button', { class: 'yt-more', type: 'button', title: '更多', 'aria-label': `更多：${v.title}` }, icon(MORE));
  // 合成一次右键菜单事件，直接复用 card-menu 的菜单项（不改 card-menu）
  more.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = more.getBoundingClientRect();
    more.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: r.left, clientY: r.bottom }));
  });

  const el = h('article', { class: 'card yt-card', style: `--i:${index % 12}` },
    cover,
    h('div', { class: 'yt-info' },
      h('a', { class: 'yt-face', href: space, target: '_blank', rel: 'noopener', 'aria-label': v.author },
        face ? h('img', { src: face, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'yt-face-ph' }, (v.author || '?').slice(0, 1))),
      h('div', { class: 'yt-text' },
        h('a', { class: 'yt-title', href, target: '_blank', rel: 'noopener' }, v.title),
        meta,
        v.reason && !opts.hide?.has('reason') ? h('span', { class: 'yt-reason' }, v.reason) : null),
      more,
    ),
  );
  cardData.set(el, v);
  return el;
}

export function ytSkeleton(n: number): DocumentFragment {
  const f = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    f.append(h('div', { class: 'card yt-card sk' },
      h('div', { class: 'cover yt-thumb' }),
      h('div', { class: 'yt-info' },
        h('div', { class: 'yt-face sk-face' }),
        h('div', { class: 'yt-text' }, h('div', { class: 'line' }), h('div', { class: 'line short' })))));
  }
  return f;
}
