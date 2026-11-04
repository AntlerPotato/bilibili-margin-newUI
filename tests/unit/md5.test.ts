import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { md5 } from '../../src/content/api/md5';

/** md5 只用于 WBI 请求签名，错了就是全站接口 403，先拿 RFC 1321 的锚点向量兜底 */
const ANCHORS: [string, string][] = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
];

/** 再用 node 自带 crypto 做交叉验证：中文、emoji、长串都要走 UTF-8 分包路径 */
const CORPUS = [
  'a', 'abc', 'message digest',
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
  'B站', '充电专属', '弹幕danmaku🚀',
  '中文'.repeat(500),
  'x'.repeat(1024),
  'a'.repeat(55), // 恰好触发补位 + 长度跨 word 的边界
  'a'.repeat(56),
  'a'.repeat(63),
  'a'.repeat(64),
];

describe('md5（WBI 签名）', () => {
  it('RFC 1321 锚点向量', () => {
    for (const [input, want] of ANCHORS) expect(md5(input)).toBe(want);
  });

  it('与 node:crypto 交叉验证（UTF-8 / emoji / 长串 / 分包边界）', () => {
    for (const s of CORPUS) {
      expect(md5(s)).toBe(createHash('md5').update(s, 'utf8').digest('hex'));
    }
  });
});
