import { createServer } from 'vite';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';
import { apiBody } from '../tests/mocks.mjs';
const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port: 4334, strictPort: true },
  plugins: [wgslVitePlugin(), {
    name: 'preview-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/preview-api?')) return next();
        const url = new URL(req.url, 'http://localhost').searchParams.get('url');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(apiBody(url) ?? { code: 0, data: {} }));
      });
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/watch') req.url = '/preview/index.html';
        next();
      });
    },
  }],
});
await server.listen();
server.printUrls();
