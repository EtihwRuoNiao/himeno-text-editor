import { invoke } from '@tauri-apps/api/core';
import { sep } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, readFile, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Language } from '../i18n/translations';
import type {
  AssistantAsset, AssistantManifest, AssetRootResult, AssetScanResult,
  AvatarExt, BubbleVariant, ScaffoldResult,
} from '../types/assistant';

// ---- 首次启动时写出到 <exe>/assets 的参考文件（构建期内联，无需安装包额外配置）----
import scaffoldReadme from '../assets/customization/files/README.md?raw';
import manifestSchema from '../assets/customization/files/manifest.schema.json?raw';
import templateManifest from '../assets/customization/files/_template/manifest.json?raw';
import templateQuotesZh from '../assets/customization/files/_template/quotes.zh-CN.txt?raw';
import templateQuotesEn from '../assets/customization/files/_template/quotes.en-US.txt?raw';
import templateAvatarUrl from '../assets/customization/files/_template/avatar.png?url';

export const AVATAR_EXTS: AvatarExt[] = ['gif', 'png', 'apng', 'webp'];

const AVATAR_MIME: Record<AvatarExt, string> = {
  gif: 'image/gif',
  png: 'image/png',
  apng: 'image/apng',
  webp: 'image/webp',
};

const QUOTE_LANGS: Language[] = ['zh-CN', 'en-US'];
const DEFAULT_DURATION_MS = 3000;
const MIN_DURATION_MS = 500;
const MAX_DURATION_MS = 60000;

/** 桌面版判定：与 useAppHost / SettingsModal 使用同一检测方式 */
export const isDesktopRuntime = (): boolean =>
  typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

let rootCache: AssetRootResult | null = null;

/**
 * 资源根目录 = 可执行程序同级目录下的 assets\。
 * 桌面版由后端 app_asset_dir 命令解析并在缺失时创建；浏览器版不可用。
 */
export async function getAssetRoot(force = false): Promise<AssetRootResult> {
  if (rootCache && !force) return rootCache;
  if (!isDesktopRuntime()) {
    rootCache = { status: 'unsupported', error: '助手资源目录仅桌面版可用' };
    return rootCache;
  }
  try {
    rootCache = { status: 'ok', root: await invoke<string>('app_asset_dir') };
    // 路径分隔符只解析一次，之后拼接走本地字符串运算，避免逐文件的异步 IPC
    try { sepCache = await sep(); } catch { /* 保持默认值 */ }
  } catch (e) {
    rootCache = { status: 'error', error: errText(e) };
  }
  return rootCache;
}

/** 清空根目录缓存（目录被移动后调用） */
export function invalidateAssetRoot(): void {
  rootCache = null;
}

/** 解析资源目录内的绝对路径；资源目录不可用时返回 null */
export async function assetPath(...parts: string[]): Promise<string | null> {
  const r = await getAssetRoot();
  if (r.status !== 'ok' || !r.root) return null;
  return at(r.root, ...parts);
}

let sepCache = '\\';

/** 资源目录内的路径拼接（分隔符只解析一次，避免逐文件 IPC） */
function at(root: string, ...parts: string[]): string {
  return parts.reduce((acc, p) => acc + sepCache + p, root);
}

/** 只接受纯文件名，拒绝路径分隔符与 .. —— 防止 manifest 越出助手目录 */
function isSafeName(name: unknown): name is string {
  return typeof name === 'string'
    && name.length > 0 && name.length <= 128
    && !name.includes('/') && !name.includes('\\')
    && !name.includes('..');
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function clampDuration(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_DURATION_MS;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(n)));
}

/** 台词文件解析：每行一条，忽略空行与 # 开头行 */
export function parseQuotes(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
}

// ---------------------------------------------------------------------------
// 脚手架
// ---------------------------------------------------------------------------

async function fetchTemplateAvatar(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(templateAvatarUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * 确保 <exe>/assets 下的说明文件与参考模板存在。
 * 已存在的文件一律不覆盖（用户可自由编辑）。
 */
export async function ensureAssetScaffold(): Promise<ScaffoldResult> {
  const r = await getAssetRoot();
  if (r.status !== 'ok' || !r.root) {
    return { ok: false, created: [], error: r.error ?? '资源目录不可用' };
  }
  const created: string[] = [];
  try {
    const assistantsDir = at(r.root, 'assistants');
    const templateDir = at(assistantsDir, '_template');
    if (!(await exists(assistantsDir))) await mkdir(assistantsDir, { recursive: true });
    if (!(await exists(templateDir))) await mkdir(templateDir, { recursive: true });

    const put = async (target: string, label: string, text: string) => {
      if (await exists(target)) return;
      await writeTextFile(target, text);
      created.push(label);
    };

    await put(at(r.root, 'README.md'), 'README.md', scaffoldReadme);
    await put(at(assistantsDir, 'manifest.schema.json'), 'assistants/manifest.schema.json', manifestSchema);
    await put(at(templateDir, 'manifest.json'), 'assistants/_template/manifest.json', templateManifest);
    await put(at(templateDir, 'quotes.zh-CN.txt'), 'assistants/_template/quotes.zh-CN.txt', templateQuotesZh);
    await put(at(templateDir, 'quotes.en-US.txt'), 'assistants/_template/quotes.en-US.txt', templateQuotesEn);

    const avatarPath = at(templateDir, 'avatar.png');
    if (!(await exists(avatarPath))) {
      const bytes = await fetchTemplateAvatar();
      if (bytes) {
        await writeFile(avatarPath, bytes);
        created.push('assistants/_template/avatar.png');
      }
    }
    return { ok: true, created, root: r.root };
  } catch (e) {
    return { ok: false, created, root: r.root, error: errText(e) };
  }
}

/** 解析并缓存平台路径分隔符 */
async function pathSep(): Promise<string> {
  try { sepCache = await sep(); } catch { /* 保持默认 */ }
  return sepCache;
}

// ---------------------------------------------------------------------------
// 扫描
// ---------------------------------------------------------------------------

async function loadAssistant(root: string, id: string): Promise<AssistantAsset | null> {
  const dir = at(root, 'assistants', id);
  let manifest: AssistantManifest = {};
  const manifestPath = at(dir, 'manifest.json');
  if (await exists(manifestPath)) {
    try {
      manifest = JSON.parse(await readTextFile(manifestPath)) as AssistantManifest;
    } catch {
      manifest = {}; // manifest 非法时按零配置处理，不阻塞整个扫描
    }
  }

  const files = (await readDir(dir)).filter(f => f.isFile).map(f => f.name);

  let avatarFile: string | undefined;
  const declared = manifest.avatar;
  if (isSafeName(declared) && AVATAR_EXTS.includes(extOf(declared) as AvatarExt) && files.includes(declared)) {
    avatarFile = declared;
  }
  if (!avatarFile) avatarFile = files.find(f => AVATAR_EXTS.includes(extOf(f) as AvatarExt));

  const quotes: Partial<Record<Language, string[]>> = {};
  for (const lang of QUOTE_LANGS) {
    const declaredQuote = manifest.quotes?.[lang];
    const file = isSafeName(declaredQuote) ? declaredQuote : `quotes.${lang}.txt`;
    if (!files.includes(file)) continue;
    try {
      quotes[lang] = parseQuotes(await readTextFile(at(dir, file)));
    } catch {
      // 单个文件读取失败不影响其他助手
    }
  }

  const ext = avatarFile ? (extOf(avatarFile) as AvatarExt) : undefined;
  return {
    id,
    dir,
    avatarPath: avatarFile ? at(dir, avatarFile) : undefined,
    avatarExt: ext,
    displayName: manifest.displayName?.trim() || id,
    symbol: manifest.symbol ?? '',
    variant: (manifest.bubble?.variant as BubbleVariant) || 'gray',
    durationMs: clampDuration(manifest.bubble?.durationMs),
    fit: manifest.fit === 'contain' ? 'contain' : 'cover',
    files,
    quotes,
  };
}

/** 扫描 <exe>/assets/assistants 下的全部助手（跳过 _ 与 . 开头的目录） */
export async function scanAssistants(): Promise<AssetScanResult> {
  await pathSep();
  const r = await getAssetRoot();
  if (r.status !== 'ok' || !r.root) {
    return { status: r.status, root: r.root, assistants: [], error: r.error };
  }
  const dir = at(r.root, 'assistants');
  try {
    if (!(await exists(dir))) return { status: 'ok', root: r.root, assistants: [] };
    const entries = await readDir(dir);
    const assistants: AssistantAsset[] = [];
    for (const e of entries) {
      if (!e.isDirectory) continue;
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      try {
        const a = await loadAssistant(r.root, e.name);
        if (a) assistants.push(a);
      } catch {
        // 单个助手目录异常不影响其余助手
      }
    }
    assistants.sort((x, y) => x.id.localeCompare(y.id));
    return { status: 'ok', root: r.root, assistants };
  } catch (e) {
    return { status: 'error', root: r.root, assistants: [], error: errText(e) };
  }
}

/** 读取助手头像为 Blob（交由调用方创建/释放 objectURL） */
export async function readAvatarBlob(a: AssistantAsset): Promise<Blob | null> {
  if (!a.avatarPath || !a.avatarExt) return null;
  try {
    return new Blob([await readFile(a.avatarPath)], { type: AVATAR_MIME[a.avatarExt] });
  } catch {
    return null;
  }
}

/** 随机取一条台词；当前语言为空时回退另一语言 */
export function pickQuote(a: AssistantAsset, lang: Language): string | null {
  const list = a.quotes[lang]?.length
    ? a.quotes[lang]!
    : (a.quotes['zh-CN']?.length ? a.quotes['zh-CN']! : a.quotes['en-US'] ?? []);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}
