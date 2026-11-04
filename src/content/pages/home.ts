// 首页模块：由入口脚本按路由动态 import（dist/pages/home.js）
import type { Settings } from '../../shared/settings';
import { MarginApp as MarginHome } from '../ui/app';
import { YtHomeApp } from '../ui/yt/home';

/**
 * 首页入口：设置里打开「YouTube 风格首页」时挂载独立布局，否则保持映间首页。
 * 布局切换是结构性变化，刷新首页最稳；其他设置照常热更新。
 */
export class MarginApp {
  readonly host: HTMLElement;
  private app: MarginHome | YtHomeApp;
  private yt: boolean;

  constructor(settings: Settings) {
    this.yt = settings.ytHome;
    this.app = this.yt ? new YtHomeApp(settings) : new MarginHome(settings);
    this.host = this.app.host;
  }

  update(s: Settings): void {
    if (s.ytHome !== this.yt) { location.reload(); return; }
    this.app.update(s);
  }
}
