import { saveSettings } from '../../../shared/settings';
import { h, icon } from '../dom';

const PLAY = '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="m10 9 5 3-5 3z"/>';

/** 顶栏右上角的 YouTube / 映间快捷切换；保存设置后由各页面统一 reload */
export function createYtSwitch(active: boolean): HTMLElement {
  const label = active ? '映间' : 'YouTube';
  return h('button', {
    type: 'button',
    class: 'yt-switch',
    'data-active': active ? 'true' : 'false',
    title: active ? '切回映间风格' : '切换到 YouTube 风格',
    'aria-label': active ? '切回映间风格' : '切换到 YouTube 风格',
    onclick: () => { void saveSettings({ ytHome: !active }); },
  }, icon(PLAY), h('span', {}, label));
}
