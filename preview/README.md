# 搜索双版预览

PR #110 与 PR #111 的独立交互预览，提供首页及播放页的两种搜索方案，等待界面确认。

```sh
npm ci
node preview/server.mjs
```

- 旧版首页搜索栏位于 `http://127.0.0.1:4334/#classic`。
- 新版原位展开与热搜轮播位于 `http://127.0.0.1:4334/#new`。
- 播放页使用 `/watch#classic` 和 `/watch#new`。
- 底部控制栏用于切换预览版本和调整新版展开速度。

双版选择由预览入口实现。预览采用本地模拟接口，图片使用样例中的公开链接。提交搜索会打开对应的 B 站搜索页面。

```sh
npm run build
npm run test:unit
node preview/two-versions.mjs
```

浏览器检查需要 Playwright Chromium，亦可通过 `CHROMIUM_PATH` 指定浏览器路径。运行双版检查前启动预览服务。

## English

Run the commands above, then compare the classic search field at `/#classic` with the expanding search panel and rotating trends at `/#new` on port 4334. Both variants also have `/watch` previews. The preview entry implements the variant selector and uses fixture APIs. Search submission opens Bilibili search. Interface approval is pending.
