import { h, icon, ICONS } from './dom';

/** 顶栏右上角的设置入口（替代可展开菜单 / 侧栏里的「设置」项） */
export function createSettingsButton(onOpen: () => void): HTMLElement {
  return h('button', {
    type: 'button',
    class: 'hd-settings',
    title: '设置',
    'aria-label': '设置',
    onclick: onOpen,
  }, icon(ICONS.gear));
}
