import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

// 枚举失败时的静态兜底清单
const FALLBACK_FONTS = [
  '微软雅黑', '黑体', '宋体', '楷体', '仿宋', '等线',
  'Segoe UI', 'Arial', 'Calibri', 'Consolas',
  'Microsoft YaHei UI', 'SimSun', 'Times New Roman', 'Courier New',
];

let cachePromise: Promise<string[]> | null = null;

async function loadSystemFonts(): Promise<string[]> {
  try {
    const fonts = await invoke<string[]>('list_system_fonts');
    if (Array.isArray(fonts) && fonts.length > 0) {
      return [...new Set(fonts)].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    }
  } catch (err) {
    console.error('[fonts] system font enumeration failed:', err);
  }
  return FALLBACK_FONTS;
}

// 系统字体族列表：懒加载一次 + 模块级缓存（所有调用方共享）
export function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(() => []);

  useEffect(() => {
    if (!cachePromise) cachePromise = loadSystemFonts();
    let disposed = false;
    cachePromise.then(list => {
      if (!disposed) setFonts(list);
    });
    return () => { disposed = true; };
  }, []);

  return fonts;
}
