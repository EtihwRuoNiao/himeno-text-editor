import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isDesktopRuntime } from './assetService';

export interface TrayMenuLabels {
  /** 菜单项「显示主窗口」 */
  show: string;
  /** 菜单项「退出」 */
  quit: string;
  /** 悬停提示（一般带版本号） */
  tooltip: string;
}

/**
 * 同步托盘菜单文案与悬停提示。
 * Rust 侧菜单在 setup 里以中文占位建立，语言确定后由前端重建一次。
 */
export async function syncTrayMenu(labels: TrayMenuLabels): Promise<void> {
  if (!isDesktopRuntime()) return;
  try {
    await invoke('set_tray_menu', { show: labels.show, quit: labels.quit, tooltip: labels.tooltip });
  } catch (e) {
    console.error('[tray] 同步菜单失败:', e);
  }
}

/**
 * 监听托盘菜单「退出」。
 * Rust 侧只发事件、不直接退出：前端必须先把草稿与工作区记录落盘，否则会丢数据。
 */
export async function onTrayQuit(handler: () => void): Promise<UnlistenFn> {
  if (!isDesktopRuntime()) return () => {};
  return listen('app-tray-quit', () => handler());
}
