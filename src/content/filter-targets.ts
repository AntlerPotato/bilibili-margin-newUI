import type { Video } from './api/feed';
import type { LaterItem } from './api/search';
import type { HistItem } from './api/history';
import type { Dyn } from './api/dyn';
import type { PopRow } from './ui/dyn-pop';
import type { MsgCard } from './api/msg';
import { parseCountText, parseDurationText } from './parse';
import { cachedTags, bvidFromHref } from './tags';
import type { FilterTarget } from './filter';

export const targetOfVideo = (v: Video): FilterTarget => ({
  title: v.title,
  author: v.author,
  mid: v.mid,
  views: v.views,
  duration: v.duration,
  ad: v.ad,
  bvid: v.bvid,
  tags: cachedTags(v.bvid),
});

export const targetOfLater = (x: LaterItem): FilterTarget => ({
  title: x.title,
  author: x.author,
  mid: x.mid,
  duration: x.duration,
  bvid: x.bvid,
  tags: cachedTags(x.bvid),
});

export const targetOfHistory = (x: HistItem): FilterTarget => {
  const bvid = bvidFromHref(x.url);
  return {
    title: x.title,
    author: x.author,
    mid: x.mid,
    duration: x.duration,
    bvid,
    tags: cachedTags(bvid),
  };
};

const plain = (s: string): string => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const targetOfDyn = (d: Dyn): FilterTarget => {
  const v = d.video;
  return {
    title: v?.title ?? d.article?.title ?? d.title ?? d.live?.title ?? d.link?.title ?? plain(d.text || ''),
    author: d.author,
    mid: d.mid,
    views: parseCountText(v?.play),
    duration: parseDurationText(v?.dur),
    ad: v?.ad,
    bvid: v?.bvid,
    tags: cachedTags(v?.bvid),
  };
};

export const targetOfPopRow = (r: PopRow): FilterTarget => {
  const bvid = bvidFromHref(r.href);
  return {
    title: r.title,
    author: r.who,
    // 稍后再看的 sub 是时长；其他入口的 sub 解析不到就返回 null
    duration: parseDurationText(r.sub),
    bvid,
    tags: cachedTags(bvid),
  };
};

export const targetOfMsgCard = (c: MsgCard): FilterTarget => ({
  title: c.title,
});
