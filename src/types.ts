
export interface ParserProfile {
  id: string;
  name: string;
  lineRegex: string;        // must have named groups <prefix> and <text>
  idRegex?: string;         // must have named group <id>
  idRegexDisabled?: boolean;
}

export interface TextBlock {
  id: string;
  
  sourcePrefix: string;
  sourceText: string;
  
  targetPrefix: string;
  targetText: string;
  
  originalSourceText: string;
  originalTargetText: string;

  orphan?: boolean;
  blankLinesAfterId?: number;
}

export interface FolderItem {
  path: string;
  name: string;
}

export interface DirectoryListing {
  folders: FolderItem[];
  fileNames: string[];
}

export interface FileData {
  name: string;
  blocks: TextBlock[];
  rawContent: string; // Keep raw for safety or diffing if needed
  blankLinesBefore: number[]; // number of blank lines preceding each block
  trailingBlankLines: number; // number of trailing blank lines
  handle?: FileSystemFileHandle; // For saving back to disk
  fullPath?: string; // For Tauri environment
  chapterTitle?: string; // For saving chapter title if present
  hasBom?: boolean;
}

export type DictionaryCategory = 'person' | 'location' | 'term' | 'uncategorized';

export interface DictionaryEntry {
  id: string;
  source: string;
  target: string;
  category: DictionaryCategory;
  note?: string;
}

export interface DictionaryConfig {
  id: string;
  name: string;
  enabled: boolean;
  isDefault?: boolean;
  enableFuzzyMatch?: boolean;
}

export interface AppSettings {
  enableSourceEdit: boolean;
  enableHalfWidthHighlight: boolean;
  enableSpaceHighlight: boolean;
  enableFuzzyMatch: boolean;
  language: 'en-US' | 'zh-CN';
  activeDictionaryId?: string;
  partners?: (string | null)[];
  enablePartnerSettings?: boolean;
  windowWidth?: number;
  windowHeight?: number;
  windowX?: number;
  windowY?: number;
  startMaximized?: boolean;
  startFullscreen?: boolean;
  activeParserProfileId?: string;
  parserProfiles?: ParserProfile[];
  folderProfileMap?: Record<string, string>; // dirPath → profileId
  closeToTray?: boolean;          // 点 X 时隐藏到系统托盘而非退出（默认 true）
  uiFontFamily?: string;          // 界面字体族（空 = 默认）
  workspaceFontFamily?: string;   // 工作区编辑区字体族（空 = 默认等宽栈）
  customIconDisabled?: boolean;   // 忽略 <exe>/assets/icon/，使用随包默认程序图标
}

declare global {
  const __APP_VERSION__: string;
}