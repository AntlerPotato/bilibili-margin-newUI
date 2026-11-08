# 反馈改进预览

基于 0.6.13 的独立预览，包含 #101 的界面方案与 PR #109 批次导航。界面确认后接入正式版本。

```sh
npm ci
node preview/server.mjs
```

- 首页位于 `http://127.0.0.1:4335/`，支持前后翻批、慢加载与失败重试演示。
- 播放页位于 `http://127.0.0.1:4335/watch`，展示操作按钮与评论属地排版。
- 动态页位于 `http://127.0.0.1:4335/feed`，支持评论展开与属地展示。
- 底部搜索双版入口使用单独运行的搜索预览服务，端口为 4334。

预览使用本地模拟接口，封面与头像使用样例中的公开图片链接。播放页使用封面与模拟操作，原生评论属地数据读取待界面确认后接入。动态评论读取 `reply_control.location`，关注标识依据推荐接口明确返回的“已关注”提示。

```sh
npm run build
npm run test:unit
node tests/feed-batches.mjs
node preview/check.mjs
```

浏览器检查需要 Playwright Chromium，亦可通过 `CHROMIUM_PATH` 指定浏览器路径。运行 `preview/check.mjs` 前启动预览服务。

## English

This independent preview covers the issue #101 interface proposals and PR #109 batch navigation. Run the commands above, then open port 4335. The home, watch and activity routes use fixture data and simulated actions. Native watch-page comment-location integration awaits interface approval. The separate search preview uses port 4334.
