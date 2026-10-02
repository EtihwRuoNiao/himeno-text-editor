import { invoke } from '@tauri-apps/api/core';
import { exists, readDir } from '@tauri-apps/plugin-fs';
import { assetPath, isDesktopRuntime } from './assetService';

/** 自定义图标目录（相对 assets 根）：<exe>/assets/icon/ */
const ICON_DIR = 'icon';
/** icon.png 优先；Cargo 已启用 image-png / image-ico，两者都能解码 */
const PREFERRED = ['icon.png', 'icon.ico'];

export interface AppIconStatus {
  mode: 'custom' | 'default';
  /** 实际应用的文件名（mode === 'custom' 时有值） */
  fileName?: string;
  error?: string;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 在 <exe>/assets/icon/ 下查找可用图标，返回绝对路径 */
export async function resolveCustomIconPath(): Promise<string | null> {
  try {
    const dir = await assetPath(ICON_DIR);
    if (!dir || !(await exists(dir))) return null;
    const files = (await readDir(dir)).filter(e => e.isFile).map(e => e.name);
    const byLower = new Map(files.map(n => [n.toLowerCase(), n]));

    for (const wanted of PREFERRED) {
      const hit = byLower.get(wanted);
      if (hit) return await assetPath(ICON_DIR, hit);
    }
    for (const ext of ['.png', '.ico']) {
      const hit = files.find(n => n.toLowerCase().endsWith(ext));
      if (hit) return await assetPath(ICON_DIR, hit);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 应用程序图标（窗口 / 任务栏 / 系统托盘三处一次设置）。
 * disabled=true、或自定义图标缺失/无效时，回退到随包默认图标。
 * 只影响运行时图标；exe 文件图标必须在构建期替换（见 npm run icons）。
 *
 * 实现走 Rust 命令 apply_app_icon：由 Rust 读文件并解码，
 * 既避免把整个图标（可达数 MB）塞进 IPC，也让窗口图标与托盘图标始终同源。
 */
export async function applyAppIcon(disabled: boolean): Promise<AppIconStatus> {
  if (!isDesktopRuntime()) return { mode: 'default' };
  try {
    const customPath = disabled ? null : await resolveCustomIconPath();
    await invoke('apply_app_icon', { path: customPath });
    return customPath
      ? { mode: 'custom', fileName: customPath.split(/[\\/]/).pop() }
      : { mode: 'default' };
  } catch (e) {
    const message = errText(e);
    console.error('[app-icon] 应用图标失败:', message);
    return { mode: 'default', error: message };
  }
}
