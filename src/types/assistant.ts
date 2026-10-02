import type { Language } from '../i18n/translations';

/** 资源根目录状态：ok=可用于桌面版；unsupported=浏览器环境；error=解析失败 */
export type AssetRootStatus = 'ok' | 'unsupported' | 'error';

export interface AssetRootResult {
  status: AssetRootStatus;
  /** 可执行程序同级 assets 目录的绝对路径 */
  root?: string;
  error?: string;
}

/** 允许作为助手头像的扩展名（png 与 apng 均可，apng 由 Chromium 原生播放） */
export type AvatarExt = 'gif' | 'png' | 'apng' | 'webp';

/** 气泡配色预设（对应 Toast.tsx 的调色板） */
export type BubbleVariant =
  | 'pink' | 'pinkDeep' | 'yellow' | 'yellowDeep' | 'green' | 'gray' | 'blue' | 'purple'
  | (string & {});

/** assistants/<id>/manifest.json 的结构，全部字段可选（零配置可用） */
export interface AssistantManifest {
  version?: number;
  /** 选择框显示名，缺省 = 文件夹名 */
  displayName?: string;
  /** 气泡前后缀表情 */
  symbol?: string;
  /** 头像填充方式，缺省 cover */
  fit?: 'cover' | 'contain';
  /** 头像文件名（相对助手目录），缺省 = 目录内第一张白名单图片 */
  avatar?: string;
  bubble?: {
    variant?: BubbleVariant;
    durationMs?: number;
  };
  /** 各语言台词文件名（相对助手目录） */
  quotes?: Partial<Record<Language, string>>;
}

/** 一个从磁盘扫描出的助手 */
export interface AssistantAsset {
  id: string;
  /** 助手目录绝对路径 */
  dir: string;
  /** 头像绝对路径（无可用头像时为 undefined） */
  avatarPath?: string;
  avatarExt?: AvatarExt;
  displayName: string;
  symbol: string;
  variant: BubbleVariant;
  durationMs: number;
  fit: 'cover' | 'contain';
  /** 目录内的全部文件名（便于 UI 提示资源缺失） */
  files: string[];
  quotes: Partial<Record<Language, string[]>>;
  /** 内置兜底助手（不来自磁盘，磁盘上存在同 id 助手时被覆盖） */
  builtin?: boolean;
  /** 内置助手随包分发的头像 URL */
  builtinAvatar?: string;
}

export interface AssetScanResult {
  status: AssetRootStatus;
  root?: string;
  assistants: AssistantAsset[];
  error?: string;
}

export interface ScaffoldResult {
  ok: boolean;
  /** 本次新建的文件（相对 assets 根目录） */
  created: string[];
  root?: string;
  error?: string;
}
