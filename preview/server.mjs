import { createServer } from 'vite';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';
import { apiBody } from '../tests/mocks.mjs';
import { readFileSync } from 'node:fs';

const samples = JSON.parse(readFileSync(new URL('../tests/fixtures/pop.json', import.meta.url), 'utf8'));
const replies = [
  ['晚风里的胶片', '前面那段镜头的光线很好看，停下来重新看了一遍。', 'IP属地：浙江'],
  ['一颗小行星', '节奏很舒服，收藏起来周末再看。', 'IP属地：广东'],
  ['北岸', '想知道这里用的是什么镜头。', ''],
];
const server = await createServer({
  configFile: false, server: { host: '127.0.0.1', port: 4335, strictPort: true },
  plugins: [wgslVitePlugin(), {
    name: 'feedback-preview',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/preview-api?')) return next();
        const parsed = new URL(req.url, 'http://localhost');
        const url = parsed.searchParams.get('url') || '';
        let body = apiBody(url) ?? { code: 0, data: {} };
        if (url.includes('/x/web-interface/wbi/index/top/feed/rcmd')) {
          const round = Number(new URL(url).searchParams.get('fresh_idx') || 1);
          const item = Array.from({ length: 12 }, (_, i) => {
            const index = (round - 1) * 12 + i;
            const video = samples[index % samples.length];
            return { goto: 'av', bvid: `${video.bvid}_${round}`, cid: index + 1, title: video.title,
              pic: video.pic, duration: video.dur, pubdate: video.pub,
              owner: { name: video.name, mid: video.mid, face: video.face }, stat: { view: video.play, danmaku: 126 },
              rcmd_reason: index % 4 === 0 ? { content: '已关注' } : undefined };
          });
          body = { code: 0, data: { item } };
          if (parsed.searchParams.get('fail') === '1') body = { code: -500, message: '预览中的网络失败，可重试' };
          if (parsed.searchParams.get('slow') === '1') await new Promise(resolve => setTimeout(resolve, 650));
        }
        if (/\/x\/v2\/reply(?:\/reply)?\?/.test(url)) {
          const nested = url.includes('/reply/reply?');
          body = { code: 0, data: { page: { count: 3, acount: 3, size: 10 }, replies: replies.map(([name, text, location], i) => ({
            rpid_str: String(9000001 + i), member: { mid: i + 1, uname: name, avatar: samples[i].face },
            content: { message: text }, reply_control: location ? { location } : {},
            rcount: nested ? 0 : i === 0 ? 3 : 0, ctime: Math.floor(Date.now() / 1000) - 900 * (i + 1), like: [32, 17, 8][i],
          })) } };
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
      });
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/watch' || req.url === '/feed') req.url = '/preview/index.html';
        next();
      });
    },
  }],
});
await server.listen(); server.printUrls();
