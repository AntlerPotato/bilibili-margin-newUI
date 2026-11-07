import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/content/api/http', () => ({ getJSON: vi.fn(), postForm: vi.fn(), postJSON: vi.fn() }));
import { getJSON } from '../../src/content/api/http';
import { dynCommentTarget, dynReplies, dynSubReplies, toDyn } from '../../src/content/api/dyn';

const get = vi.mocked(getJSON);
const item = (dynamic: object = {}, basic?: object) => ({ id_str: '900001234567890123', type: 'DYNAMIC_TYPE_WORD', basic,
  modules: { module_author: { mid: 1 }, module_dynamic: dynamic } });
const emoji = { type: 'RICH_TEXT_NODE_TYPE_EMOJI', text: '[开心]', emoji: { icon_url: '//i0.hdslb.com/happy.gif' } };
beforeEach(() => vi.resetAllMocks());

describe('动态正文与表情', () => {
  it('文字动态保留附加视频卡片和原动态评论目标', () => {
    const d = toDyn(item({ desc: { text: '律师也要黑屏处理啦' }, additional: { type: 'ADDITIONAL_TYPE_UGC',
      ugc: { title: '视频标题', cover: '//i0.hdslb.com/cover.jpg', jump_url: '//www.bilibili.com/video/BV1mdxN68E7F/', stat: { play: '2193.6万', danmaku: '39.6万' } },
    } }, { comment_type: 17, comment_id_str: '900001234567890123' }))!;
    expect(d.attachment).toEqual({ title: '视频标题', cover: 'https://i0.hdslb.com/cover.jpg', url: 'https://www.bilibili.com/video/BV1mdxN68E7F/', kind: '视频', desc: '2193.6万播放 · 39.6万弹幕' });
    expect(d.url).toBe('https://www.bilibili.com/opus/900001234567890123');
    expect(d.cmtType).toBe(17);
    expect(d.cmtOid).toBe('900001234567890123');
  });
  it('转发动态中的附加视频保留描述，缺少统计也能渲染', () => {
    const d = toDyn({ ...item(), orig: item({ additional: { ugc: { title: '原视频', cover: '//i0.hdslb.com/cover.jpg',
      jump_url: '//www.bilibili.com/video/BV1mdxN68E7F/', desc_second: '原视频简介' } } }) })!;
    expect(d.orig?.attachment?.desc).toBe('原视频简介');
    expect(d.orig?.attachment?.kind).toBe('视频');
  });
  it('附加视频与主卡片共存，并拒绝可执行协议', () => {
    const dynamic = { major: { pgc: { title: '番剧', jump_url: '//www.bilibili.com/bangumi/play/ep1' } },
      additional: { ugc: { title: '视频', jump_url: '//www.bilibili.com/video/BV1mdxN68E7F/' } } };
    const d = toDyn(item(dynamic))!;
    expect(d.link?.title).toBe('番剧');
    expect(d.attachment?.title).toBe('视频');
    dynamic.additional.ugc.jump_url = 'javascript:alert(1)';
    expect(toDyn(item(dynamic))?.attachment).toBeUndefined();
  });
  it('保留正文、换行和原始 GIF 表情地址', () => {
    const d = toDyn(item({ desc: { text: '你好[开心]\n世界', rich_text_nodes: [{ text: '你好' }, emoji, { text: '\n世界' }] } }))!;
    expect(d.text).toBe('你好[开心]\n世界');
    expect(d.richText).toEqual([{ text: '你好' }, { text: '[开心]', emoji: 'https://i0.hdslb.com/happy.gif' }, { text: '\n世界' }]);
  });
  it('opus summary 的正文和表情来自同一份数据', () => {
    const d = toDyn(item({ major: { opus: { summary: { text: '[开心]', rich_text_nodes: [emoji] } } }, desc: { text: '旧文字' } }))!;
    expect(d.text).toBe('[开心]'); expect(d.richText?.[0].emoji).toContain('happy.gif');
  });
  it('summary 没有 text 时保留 desc', () => {
    expect(toDyn(item({ major: { opus: { summary: {} } }, desc: { text: '文字' } }))?.text).toBe('文字');
  });
  it('未知节点作为文字，非法图片协议不进入图片节点', () => {
    const d = toDyn(item({ desc: { text: '[开心]@作者', rich_text_nodes: [
      { ...emoji, emoji: { icon_url: 'javascript:alert(1)' } }, { type: 'UNKNOWN', text: '@作者' },
    ] } }))!;
    expect(d.richText).toEqual([{ text: '[开心]' }, { text: '@作者' }]);
  });
  it('节点不完整时回退整段正文，不丢字', () => {
    expect(toDyn(item({ desc: { text: '完整正文', rich_text_nodes: [{ text: '不完整' }] } }))?.richText).toBeUndefined();
  });
  it('转发中的原动态保留自己的表情', () => {
    const original = item({ desc: { text: '[开心]', rich_text_nodes: [emoji] } });
    expect(toDyn({ ...item(), orig: original })?.orig?.richText?.[0].emoji).toContain('happy.gif');
  });
});

describe('评论标识与置顶评论', () => {
  it('已有评论标识不请求详情，保留大整数字符串', async () => {
    const d = toDyn(item({}, { comment_type: 17, comment_id_str: '900001234567890123' }))!;
    expect(await dynCommentTarget(d)).toEqual({ type: 17, oid: '900001234567890123' });
    expect(get).not.toHaveBeenCalled();
  });
  it('视频动态缺少 basic 时使用明确的 aid', async () => {
    const d = toDyn(item({ major: { archive: { aid: 123, bvid: 'BVtest' } } }))!;
    expect(await dynCommentTarget(d)).toEqual({ type: 1, oid: '123' }); expect(get).not.toHaveBeenCalled();
  });
  it('缺少标识时点开才查详情，成功后复用结果', async () => {
    const d = toDyn(item())!;
    get.mockResolvedValue({ item: item({}, { comment_type: 17, comment_id_str: '1001' }) });
    expect(await dynCommentTarget(d)).toEqual({ type: 17, oid: '1001' });
    await dynCommentTarget(d);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/x/polymer/web-dynamic/v1/detail', { id: d.id });
  });
  it('不支持的动态不猜测评论类型，失败交给界面回退', async () => {
    get.mockResolvedValue({ item: item() });
    expect(await dynCommentTarget(toDyn(item())!)).toBeNull();
    get.mockRejectedValue(new Error('HTTP 412'));
    await expect(dynCommentTarget(toDyn(item())!)).rejects.toThrow('HTTP 412');
  });
  it('置顶优先并去重，评论表情保留原始地址', async () => {
    const reply = (rpid: number) => ({ rpid, content: { message: '赞[开心]', emote: { '[开心]': { url: '//i0.hdslb.com/happy.png' } } } });
    get.mockResolvedValue({ top_replies: [reply(2)], upper: { top: reply(2) }, replies: [reply(1), reply(2)], page: { acount: 8 } });
    const r = await dynReplies(17, '1001');
    expect(r.list.map((x) => x.rpid)).toEqual(['2', '1']); expect(r.count).toBe(8);
    expect(r.list[0].richText).toEqual([{ text: '赞' }, { text: '[开心]', emoji: 'https://i0.hdslb.com/happy.png' }]);
  });
  it('楼中楼保留长根评论 ID，按服务器总数分页', async () => {
    const id = '900001234567890123';
    get.mockResolvedValue({ replies: [{ rpid: Number(id), rpid_str: id, member: { mid: '42' }, content: { message: '回复' } }], page: { count: 12, size: 10 } });
    const first = await dynSubReplies(17, '800001234567890123', id, 1);
    expect(get).toHaveBeenCalledWith('/x/v2/reply/reply', { type: 17, oid: '800001234567890123', root: id, pn: 1, ps: 10 });
    expect(first.list[0].rpid).toBe(id); expect(first.list[0].mid).toBe(42); expect(first.more).toBe(true);
    expect((await dynSubReplies(17, '800001234567890123', id, 2)).more).toBe(false);
    get.mockResolvedValue({ replies: [], page: { count: 12, size: 10 } });
    expect((await dynSubReplies(17, '800001234567890123', id, 1)).more).toBe(false);
  });
});
