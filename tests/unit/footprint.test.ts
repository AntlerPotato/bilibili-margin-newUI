import { describe, it, expect } from 'vitest';
import {
  itemSeconds, levelThresholds, levelOf,
  isLocal, secondsOf, sourceOf, activeOf, firstOf, ACTIVE_MIN,
} from '../../src/content/footprint/store';
import { dayKey, hhmm, sanitizeActivity, mergeActivity, type Activity } from '../../src/shared/activity';

describe('itemSeconds（观看历史单条时长估算）', () => {
  it('progress=-1 表示看完，按视频时长算', () => {
    expect(itemSeconds({ view_at: 0, duration: 1200, progress: -1 })).toBe(1200);
  });

  it('进度小于时长按进度算，进度超过时长按时长算', () => {
    expect(itemSeconds({ view_at: 0, duration: 1200, progress: 300 })).toBe(300);
    expect(itemSeconds({ view_at: 0, duration: 600, progress: 9000 })).toBe(600);
  });

  it('单条最多算 20 分钟', () => {
    expect(itemSeconds({ view_at: 0, duration: 999999, progress: -1 })).toBe(1200);
  });

  it('没有时长只看进度；进度 0 是 0；脏数据按 0', () => {
    expect(itemSeconds({ view_at: 0, progress: 500 })).toBe(500);
    expect(itemSeconds({ view_at: 0, progress: 0 })).toBe(0);
    expect(itemSeconds({ view_at: 0, duration: 'x' as unknown as number, progress: 'y' as unknown as number })).toBe(0);
  });
});

describe('本机记录 vs 历史估算的优先级', () => {
  it('isLocal：满 60 秒才算本机有效记录', () => {
    expect(isLocal({ s: ACTIVE_MIN })).toBe(true);
    expect(isLocal({ s: 59 })).toBe(false);
    expect(isLocal(undefined)).toBe(false);
  });

  it('secondsOf：有本机用本机，没有才用历史估算', () => {
    expect(secondsOf({ s: 600, h: 5000 })).toBe(600);
    expect(secondsOf({ s: 30, h: 5000 })).toBe(5000);
    expect(secondsOf({ s: 0, h: 0 })).toBe(0);
  });

  it('sourceOf：local > history > （不足 60 秒的 local）> 无', () => {
    expect(sourceOf({ s: 600, h: 5000 })).toBe('local');
    expect(sourceOf({ s: 30, h: 5000 })).toBe('history');
    expect(sourceOf({ s: 30 })).toBe('local');
    expect(sourceOf({ s: 0, h: 0 })).toBeNull();
    expect(sourceOf(undefined)).toBeNull();
  });

  it('activeOf：60 秒才算「打开过」，热度图 0 档的分界也是它', () => {
    expect(activeOf({ s: 60 })).toBe(true);
    expect(activeOf({ s: 59, h: 30 })).toBe(false);
    expect(activeOf({ s: 10, h: 3600 })).toBe(true);
  });

  it('firstOf：本机优先；否则取本机与历史里更早的', () => {
    expect(firstOf({ s: 600, f: '09:30', hf: '08:00' })).toBe('09:30');
    expect(firstOf({ s: 30, f: '09:30', hf: '08:00' })).toBe('08:00');
    expect(firstOf({ s: 30, hf: '08:00' })).toBe('08:00');
    expect(firstOf({ s: 600 })).toBeUndefined();
  });
});

describe('levelThresholds / levelOf（热力图分档）', () => {
  it('活跃日不足 14 天用固定阈值 15/45/90 分钟', () => {
    expect(levelThresholds([600, 1200, 300])).toEqual([900, 2700, 5400]);
    expect(levelThresholds([])).toEqual([900, 2700, 5400]);
  });

  it('满 14 天按自己的四分位数走', () => {
    const v = Array.from({ length: 40 }, (_, i) => (i + 1) * 100); // 100..4000
    const [q1, q2, q3] = levelThresholds(v);
    expect(q1).toBe(1075); // (40-1)*0.25=9.75 → v[9]+0.75*(v[10]-v[9])
    expect(q2).toBe(2050);
    expect(q3).toBe(3025);
  });

  it('分布太集中时阈值单调递增不重合', () => {
    const [a, b, c] = levelThresholds(Array(20).fill(500).map((x, i) => x + i));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('levelOf：<60 秒是 0 档，然后按阈值逐档升', () => {
    const t: [number, number, number] = [900, 2700, 5400];
    expect(levelOf(0, t)).toBe(0);
    expect(levelOf(59, t)).toBe(0);
    expect(levelOf(900, t)).toBe(1);
    expect(levelOf(1000, t)).toBe(2);
    expect(levelOf(5400, t)).toBe(3);
    expect(levelOf(9999, t)).toBe(4);
  });
});

describe('activity 数据层（dayKey / hhmm / sanitize / merge）', () => {
  it('dayKey / hhmm 走本地时区并补零', () => {
    const d = new Date(2026, 10, 4, 1, 5);
    expect(dayKey(d)).toBe('2026-11-04');
    expect(hhmm(d)).toBe('01:05');
  });

  it('sanitizeActivity：非对象 null；坏键丢弃；秒数夹到 86400；HH:MM 校验', () => {
    expect(sanitizeActivity(null)).toBeNull();
    expect(sanitizeActivity('x')).toBeNull();
    const s = sanitizeActivity({
      '2026-11-04': { s: 100000, f: '25:00', hf: '08:00' },
      'bad-key': { s: 10 },
      '2026-11-03': { s: 30, f: '09:30' },
      '2026-11-02': { h: 120, hf: '10:00' },
      '2026-11-01': { s: 0 },
    })!;
    expect(Object.keys(s).sort()).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(s['2026-11-04'].s).toBe(86400);       // 上限截断
    expect(s['2026-11-04'].f).toBeUndefined();   // 25:00 不合法，丢弃
    expect(s['2026-11-04'].hf).toBe('08:00');
    expect(s['2026-11-02'].h).toBe(120);          // 只有历史估算没有本机记录也保留
  });

  it('mergeActivity：同一天时长取大、首次打开取早，不覆盖对方', () => {
    const a: Activity = { '2026-11-04': { s: 600, f: '09:30' } };
    const b: Activity = { '2026-11-04': { s: 300, f: '08:00', h: 500 } };
    mergeActivity(a, b);
    expect(a['2026-11-04'].s).toBe(600);
    expect(a['2026-11-04'].f).toBe('08:00');
    expect(a['2026-11-04'].h).toBe(500);
  });

  it('mergeActivity：往空对象合入新日期', () => {
    const a: Activity = {};
    mergeActivity(a, { '2026-11-04': { s: 120 } });
    expect(a['2026-11-04']).toEqual({ s: 120 });
  });
});
