import { getJSON, nav } from './http';
import type { Video } from './feed';

export interface Folder { id: number; title: string; count: number; cover: string; mid: number; kind?: 'collected' | 'season'; /** 默认收藏夹不能删除 */ isDefault: boolean; isPrivate: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function folders(): Promise<Folder[] | null> {
  const n = await nav();
  if (!n?.isLogin || !n.mid) return null;
  const data = await getJSON<{ list: any[] | null }>('/x/v3/fav/folder/created/list', { up_mid: n.mid, pn: 1, ps: 50 });
  return (data.list ?? []).map((f) => ({ id: f.id, title: f.title, count: f.media_count, cover: String(f.cover || '').replace(/^http:/, 'https:'), mid: n.mid!, isDefault: (f.attr & 2) === 0, isPrivate: (f.attr & 1) === 1 }));
}

export async function collectedFolders(page = 1): Promise<{ list: Folder[]; more: boolean } | null> {
  const n = await nav();
  if (!n?.isLogin || !n.mid) return null;
  const data = await getJSON<{ list: any[] | null; has_more: boolean }>('/x/v3/fav/folder/collected/list', { up_mid: n.mid, pn: page, ps: 50, platform: 'web' });
  return { list: (data.list ?? []).filter((f) => f.type === 11 || f.type === 21).map((f) => ({
    id: f.id, title: f.title, count: f.media_count, cover: https(f.cover), mid: n.mid!,
    kind: f.type === 21 ? 'season' : 'collected', isDefault: false, isPrivate: false,
  })), more: !!data.has_more };
}

export const folderUrl = (f: Folder) => `https://space.bilibili.com/${f.mid}/favlist?fid=${f.id}${f.kind ? `&ftype=collect&ctype=${f.kind === 'season' ? 21 : 11}` : ''}`;
const https = (url: unknown) => String(url || '').replace(/^http:/, 'https:').replace(/^\/\//, 'https://');
const mediaVideo = (m: any, upper = m.upper): Video => ({
  bvid: m.bvid, cid: m.ugc?.first_cid ?? 0, title: m.title,
  cover: https(m.cover), duration: m.duration ?? 0,
  author: upper?.name ?? '', mid: upper?.mid ?? 0, face: upper?.face ?? '',
  views: m.cnt_info?.play ?? 0, danmaku: m.cnt_info?.danmaku ?? 0, pubdate: m.fav_time ?? m.pubtime ?? 0,
});

/** 原站的订阅合集接口一次返回完整 medias，由收藏抽屉缓存并分批展示。 */
export async function seasonVideos(id: number): Promise<Video[]> {
  const data = await getJSON<{ medias: any[] | null; info?: { upper?: any } }>('/x/space/fav/season/list', { season_id: id });
  return (data.medias ?? []).filter((m) => m.bvid && (m.attr == null || m.attr === 0)).map((m) => mediaVideo(m, m.upper ?? data.info?.upper));
}

export async function folderVideos(id: number, page: number): Promise<{ list: Video[]; more: boolean }> {
  const data = await getJSON<{ medias: any[] | null; has_more: boolean }>('/x/v3/fav/resource/list', { media_id: id, pn: page, ps: 20, platform: 'web' });
  const list = (data.medias ?? [])
    .filter((m) => m.type === 2 && m.bvid && m.attr === 0)
    .map((m) => mediaVideo(m));
  return { list, more: !!data.has_more };
}

const csrf = () => document.cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/)?.[1] ?? '';
async function post<T>(path: string, form: Record<string, string | number>): Promise<T> {
  const body = new URLSearchParams(Object.entries({ ...form, csrf: csrf() }).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`https://api.bilibili.com${path}`, { method: 'POST', credentials: 'include', body });
  const j = await r.json();
  if (j.code !== 0) throw new Error(j.message || `code ${j.code}`);
  return j.data as T;
}

/** 新建收藏夹（B 站限制标题 20 字、简介 200 字） */
export async function createFolder(title: string, isPrivate: boolean, intro = ''): Promise<Folder> {
  const n = await nav();
  const d = await post<any>('/x/v3/fav/folder/add', { title, intro, privacy: isPrivate ? 1 : 0, cover: '' });
  return { id: d.id, title: d.title ?? title, count: 0, cover: '', mid: n.mid ?? 0, isDefault: false, isPrivate };
}

/** 删除收藏夹（连同里面的收藏记录，B 站不可恢复） */
export const deleteFolder = (id: number) => post<unknown>('/x/v3/fav/folder/del', { media_ids: id });
