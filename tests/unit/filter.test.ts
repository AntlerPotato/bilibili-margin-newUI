import { describe, it, expect } from 'vitest';
import { compileFilter, compileDynFilter, type FilterTarget } from '../../src/content/filter';
import type { Filters } from '../../src/shared/settings';

const OFF: Filters = { keywords: [], ups: [], minViews: 0, minDuration: 0 };

/** compileFilter 返回 true = 保留 */
const keep = (f: Filters, t: FilterTarget) => compileFilter(f)(t);

const base: FilterTarget = { title: '某个视频标题', author: 'UP主', mid: 42, views: 10_000, duration: 300 };

describe('compileFilter（首页 / 搜索 / 推荐 / 稍后再看共用的过滤谓词）', () => {
  it('没有规则时全部放行', () => {
    expect(keep(OFF, base)).toBe(true);
  });

  describe('关键词', () => {
    it('纯文本匹配，大小写不敏感', () => {
      const f = { ...OFF, keywords: ['GAME'] };
      expect(keep(f, { ...base, title: '这是一个 game 视频' })).toBe(false);
      expect(keep(f, { ...base, title: '生活记录' })).toBe(true);
    });

    it('/正则/ 形式可用，未知字段放行', () => {
      const f = { ...OFF, keywords: ['/吃鸡|王者/'] };
      expect(keep(f, { ...base, title: '今晚王者上分' })).toBe(false);
      expect(keep(f, { ...base, title: '逛展 vlog' })).toBe(true);
    });

    it('非法正则只丢掉这一条，不影响其他关键词', () => {
      const f = { ...OFF, keywords: ['/[/', '正常词'] };
      expect(keep(f, { ...base, title: '含正常词的标题' })).toBe(false);
      expect(keep(f, { ...base, title: '普通标题' })).toBe(true);
    });

    it('带 g/y 的正则重复调用结果一致（lastIndex 回归）', () => {
      const f = { ...OFF, keywords: ['/哈哈/g'] };
      const p = compileFilter(f);
      const t: FilterTarget = { title: '哈哈哈哈' };
      expect(p(t)).toBe(false);
      expect(p(t)).toBe(false); // 不重置 lastIndex 的话第二次会漏放
    });

    it('空白关键词等于没有', () => {
      expect(keep({ ...OFF, keywords: ['  '] }, base)).toBe(true);
    });
  });

  describe('屏蔽 UP', () => {
    it('纯数字串按 mid 匹配', () => {
      const f = { ...OFF, ups: ['42'] };
      expect(keep(f, base)).toBe(false);
      expect(keep(f, { ...base, mid: 43 })).toBe(true);
    });

    it('昵称匹配大小写不敏感', () => {
      const f = { ...OFF, ups: ['up主'] };
      expect(keep(f, base)).toBe(false);
    });

    it('未知 mid / author 放行（历史、稍后再看可能没有作者）', () => {
      const f = { ...OFF, ups: ['42', '某某人'] };
      expect(keep(f, { title: '标题' })).toBe(true);
    });
  });

  describe('播放量 / 时长门槛', () => {
    it('低于最低播放量过滤，未知放行', () => {
      const f = { ...OFF, minViews: 1000 };
      expect(keep(f, { ...base, views: 500 })).toBe(false);
      expect(keep(f, { ...base, views: 1500 })).toBe(true);
      expect(keep(f, { ...base, views: null })).toBe(true);
      expect(keep(f, { ...base, views: undefined })).toBe(true);
    });

    it('时长门槛只拦「明确知道太短」的：0 / null / undefined 都放行', () => {
      const f = { ...OFF, minDuration: 60 };
      expect(keep(f, { ...base, duration: 30 })).toBe(false);
      expect(keep(f, { ...base, duration: 90 })).toBe(true);
      expect(keep(f, { ...base, duration: 0 })).toBe(true);
      expect(keep(f, { ...base, duration: null })).toBe(true);
    });
  });

  it('广告标记不在 compileFilter 里处理（由「隐藏广告」单独负责），关键词不命中就放行', () => {
    expect(keep(OFF, { ...base, ad: true })).toBe(true);
  });
});

describe('compileDynFilter（动态流：正文、标题、视频、专栏、转发原动态）', () => {
  it('没有规则时恒真', () => {
    expect(compileDynFilter(OFF)({ author: '谁', mid: 1 })).toBe(true);
  });

  it('关键词命中视频标题 / 专栏标题 / 正文', () => {
    const f = { ...OFF, keywords: ['抽奖'] };
    const p = compileDynFilter(f);
    expect(p({ author: 'a', mid: 1, video: { title: '转发个抽奖' } })).toBe(false);
    expect(p({ author: 'a', mid: 1, article: { title: '专栏抽奖活动' } })).toBe(false);
    expect(p({ author: 'a', mid: 1, text: '评论区抽奖啦' })).toBe(false);
    expect(p({ author: 'a', mid: 1, text: '日常' })).toBe(true);
  });

  it('关键词穿透转发的原动态', () => {
    const p = compileDynFilter({ ...OFF, keywords: ['恰饭'] });
    expect(p({ author: 'a', mid: 1, orig: { author: 'b', mid: 2, text: '这条是恰饭' } })).toBe(false);
  });

  it('屏蔽 UP：转发人没事、原 UP 被屏蔽也拦下', () => {
    const p = compileDynFilter({ ...OFF, ups: ['2'] });
    expect(p({ author: 'a', mid: 1, orig: { author: 'b', mid: 2 } })).toBe(false);
    expect(p({ author: 'a', mid: 1, orig: { author: 'b', mid: 3 } })).toBe(true);
  });

  it('屏蔽 UP 对动态作者本身生效（按 mid 或昵称）', () => {
    const p = compileDynFilter({ ...OFF, ups: ['UP主'] });
    expect(p({ author: 'UP主', mid: 1 })).toBe(false);
  });
});
