import { APP_LATEST_RELEASE_API } from '../config/appInfo';

/** 持久化键：曾检测到的最新版本号（只保留一条，每次检测覆盖） */
const STORAGE_KEY = 'himeno_latest_release';
const TIMEOUT_MS = 8000;

/** Release 标题/说明中的“注明版本号”，例如 "Himeno Text Editor 0.7.1"（容忍 v 前缀与大小写） */
const TITLE_RE = /Himeno Text Editor\s+v?(\d+(?:\.\d+){0,3})/i;

/**
 * 逐段数值比较（0.10.0 > 0.9.0；1.0 等价 1.0.0；预发布后缀忽略）。
 * 返回 1 / 0 / -1
 */
export function compareVersions(a: string, b: string): number {
  const seg = (v: string) => v.split('.').slice(0, 4).map(s => {
    const n = parseInt(s.replace(/[^0-9].*$/, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
  const x = seg(a), y = seg(b);
  const len = Math.max(x.length, y.length, 3);
  for (let i = 0; i < len; i++) {
    const xi = x[i] ?? 0, yi = y[i] ?? 0;
    if (xi > yi) return 1;
    if (xi < yi) return -1;
  }
  return 0;
}

export function getRecordedVersion(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function clearRecordedVersion(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
}

function recordVersion(version: string): void {
  try { localStorage.setItem(STORAGE_KEY, version); } catch { /* 忽略 */ }
}

/**
 * 读取"曾检测到的最新版本"，并判断它是否仍高于当前内置版本。
 * 若记录已不高于内置版本（说明程序已更新），顺手清除该记录。
 */
export function getPendingUpdate(current: string): string | null {
  const recorded = getRecordedVersion();
  if (!recorded) return null;
  if (compareVersions(recorded, current) > 0) return recorded;
  clearRecordedVersion();
  return null;
}

export type CheckOutcome =
  | { kind: 'newer'; version: string }
  | { kind: 'same'; version: string }
  | { kind: 'no-version' }
  | { kind: 'error'; code?: number; message: string };

/**
 * 用户主动触发的一次检测。
 * - 成功解析出版本号 → 覆盖写入记录（清除旧值）
 * - 记录 ≤ 内置版本 → 删除记录（更新已完成）
 * - 网络/解析失败 → **不动**已有记录
 */
export async function checkLatestVersion(current: string): Promise<CheckOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(APP_LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      return { kind: 'error', code: res.status, message: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { name?: string | null; body?: string | null };
    const text = `${data.name ?? ''}\n${data.body ?? ''}`;
    const m = text.match(TITLE_RE);
    if (!m) return { kind: 'no-version' };

    const version = m[1];
    if (compareVersions(version, current) > 0) {
      recordVersion(version);          // 覆盖写入 = 清除之前的记录
      return { kind: 'newer', version };
    }
    clearRecordedVersion();            // 不高于内置版本：删除记录
    return { kind: 'same', version };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { kind: 'error', message: aborted ? 'timeout' : (e instanceof Error ? e.message : String(e)) };
  } finally {
    clearTimeout(timer);
  }
}
