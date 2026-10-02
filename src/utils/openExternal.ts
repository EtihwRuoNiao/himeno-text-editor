import { openUrl } from '@tauri-apps/plugin-opener';

const isDesktopRuntime = (): boolean =>
  typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

/**
 * 打开外部链接。
 * 桌面版交给系统默认浏览器（capabilities 中的 opener:default 已覆盖 https/http）；
 * 浏览器版退回新标签页打开。返回是否成功，供调用方提示。
 */
export async function openExternal(url: string): Promise<boolean> {
  try {
    if (isDesktopRuntime()) {
      await openUrl(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return true;
  } catch (e) {
    console.error('[open-external] 打开链接失败:', url, e);
    return false;
  }
}
