import { useState, useEffect, useCallback, useRef } from 'react';
import { FileData, ParserProfile, TextBlock, FolderItem, DirectoryListing } from '../types';
import { parseFile, findLastSourceLine, passthroughProfile } from '../utils/parser';
import { useTranslation } from '../contexts/AppContext';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize, LogicalPosition } from '@tauri-apps/api/dpi';
import * as dialog from '@tauri-apps/plugin-dialog';
import * as fs from '@tauri-apps/plugin-fs';
import * as pathApi from '@tauri-apps/api/path';
import { openPath } from '@tauri-apps/plugin-opener';
import { resolveEffectiveProfileId, isPathWithin, isSamePath, normalizePath, parentPathOf, requestUserConfirm } from '../utils/folderUtils';
import { WorkspaceSession, loadWorkspaceRegistry } from '../workspace/workspaceStore';

const LAST_DIR_PATH_KEY = 'last_directory_path';
const LAST_ACTIVE_FILE_KEY = 'last_active_file';
const FOLDER_LIST_KEY = 'saved_folder_list';

interface UseAppHostOptions {
  getActiveSession: () => WorkspaceSession;
  findFileHolder?: (fullPath: string, excludeId?: string) => WorkspaceSession | null;
}

export const useAppHost = ({ getActiveSession, findFileHolder }: UseAppHostOptions) => {
  const getAppWindow = () => {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        return getCurrentWindow();
      }
    } catch (e) {}
    return null;
  };

  const appWindow = getAppWindow();
  const { t, updateSettings, settings } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const handleDroppedPathRef = useRef<(pathStr: string) => Promise<void>>(async () => {});
  const handleMultiDropRef = useRef<(paths: string[]) => Promise<void>>(async () => {});
  const lastDragDropRef = useRef<{ path: string; ts: number } | null>(null);
  const [folderList, setFolderList] = useState<FolderItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(FOLDER_LIST_KEY) || '[]'); }
    catch { return []; }
  });
  const isWindowInitialized = useRef(false);

  // Persist folder list
  useEffect(() => {
    localStorage.setItem(FOLDER_LIST_KEY, JSON.stringify(folderList));
  }, [folderList]);

  // 启动净化：按规范化路径去重（保留首次出现）、丢弃无 path 的脏条目
  const folderListCleanedRef = useRef(false);
  useEffect(() => {
    if (folderListCleanedRef.current) return;
    folderListCleanedRef.current = true;
    const seen = new Set<string>();
    const cleaned: FolderItem[] = [];
    for (const f of folderList) {
      if (typeof f?.path !== 'string' || !f.path) continue;
      const key = normalizePath(f.path);
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(f);
    }
    if (cleaned.length !== folderList.length) {
      setFolderList(cleaned);
    }
  }, [folderList]);

  const clearAutoSelect = useCallback(() => {
    getActiveSession().update({ autoSelectIndex: null });
  }, [getActiveSession]);

  // --- Window Management ---
  const handleToggleFullscreen = useCallback(async () => {
    if (!appWindow) return;
    const isFullscreen = await appWindow.isFullscreen();
    if (isFullscreen) {
      await appWindow.setFullscreen(false);
      updateSettings({ startFullscreen: false });
    } else {
      updateSettings({ startMaximized: false });
      await appWindow.setFullscreen(true);
      updateSettings({ startFullscreen: true });
    }
  }, [updateSettings, appWindow]);

  const handleToggleMaximized = useCallback(async () => {
    if (!appWindow) return;
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
      updateSettings({ startMaximized: false });
    } else {
      const isFullscreen = await appWindow.isFullscreen();
      if (isFullscreen) {
        await appWindow.setFullscreen(false);
        updateSettings({ startFullscreen: false });
      }
      await appWindow.maximize();
      updateSettings({ startMaximized: true });
    }
  }, [updateSettings, appWindow]);

  useEffect(() => {
    if (!appWindow) return;
    let unlistenResize: () => void;
    let unlistenMove: () => void;
    let saveTimeout: NodeJS.Timeout;

    const initWindow = async () => {
      if (!settings || isWindowInitialized.current) return;
      isWindowInitialized.current = true;
      if (settings.startFullscreen) {
        await appWindow.setFullscreen(true);
      } else if (settings.startMaximized) {
        await appWindow.maximize();
      } else if (settings.windowWidth && settings.windowHeight) {
        await appWindow.setSize(new LogicalSize(settings.windowWidth, settings.windowHeight));
        if (settings.windowX !== undefined && settings.windowY !== undefined) {
          await appWindow.setPosition(new LogicalPosition(settings.windowX, settings.windowY));
        } else {
          await appWindow.center();
        }
      } else {
        await appWindow.center();
      }

      const handleWindowStateChange = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          const isFullscreen = await appWindow.isFullscreen();
          const isMaximized = await appWindow.isMaximized();
          if (isFullscreen) {
            updateSettings({ startFullscreen: true, startMaximized: false });
          } else if (isMaximized) {
            updateSettings({ startFullscreen: false, startMaximized: true });
          } else {
            const factor = await appWindow.scaleFactor();
            const size = await appWindow.innerSize();
            const logicalSize = size.toLogical(factor);
            const pos = await appWindow.outerPosition();
            const logicalPos = pos.toLogical(factor);
            updateSettings({
              startFullscreen: false,
              startMaximized: false,
              windowWidth: logicalSize.width,
              windowHeight: logicalSize.height,
              windowX: logicalPos.x,
              windowY: logicalPos.y
            });
          }
        }, 500);
      };
      unlistenResize = await appWindow.onResized(handleWindowStateChange);
      unlistenMove = await appWindow.onMoved(handleWindowStateChange);
    };
    initWindow();
    return () => {
      if (unlistenResize) unlistenResize();
      if (unlistenMove) unlistenMove();
      clearTimeout(saveTimeout);
    };
  }, [appWindow, settings]);

  // 拖拽双通道：
  // 1) Rust 侧 on_window_event 转发的自定义事件（app-drag-over/drop/leave）
  // 2) JS appWindow.onDragDropEvent 原生兜底（build 版已证可用）
  // 两个通道共用同一组 handler，drop 经 lastDragDropRef 去重，避免双触发。
  useEffect(() => {
    if (!appWindow) return;
    let unlistenOver: (() => void) | undefined;
    let unlistenDrop: (() => void) | undefined;
    let unlistenLeave: (() => void) | undefined;
    let unlistenNative: (() => void) | undefined;
    let disposed = false;

    const handleDragOver = () => {
      if (disposed) return;
      console.log('[drag] over (frontend)');
      setIsDragging(true);
    };
    const handleDragLeave = () => {
      if (disposed) return;
      console.log('[drag] leave (frontend)');
      setIsDragging(false);
    };
    const handleDragDrop = (paths: string[]) => {
      if (disposed) return;
      setIsDragging(false);
      if (!paths || paths.length === 0) return;
      const dedupKey = paths.join('\u0000');
      const now = Date.now();
      if (lastDragDropRef.current && lastDragDropRef.current.path === dedupKey && now - lastDragDropRef.current.ts < 500) {
        console.log('[drag] drop deduped:', paths);
        return;
      }
      lastDragDropRef.current = { path: dedupKey, ts: now };
      console.log('[drag] drop (frontend):', paths);
      if (paths.length === 1) {
        handleDroppedPathRef.current(paths[0]);
      } else {
        handleMultiDropRef.current(paths);
      }
    };

    (async () => {
      try {
        const over = await listen('app-drag-over', () => handleDragOver());
        const drop = await listen('app-drag-drop', (event) => {
          const payload = (event as any).payload;
          handleDragDrop(Array.isArray(payload) ? payload : (payload?.paths || []));
        });
        const leave = await listen('app-drag-leave', () => handleDragLeave());
        if (disposed) {
          over();
          drop();
          leave();
          return;
        }
        unlistenOver = over;
        unlistenDrop = drop;
        unlistenLeave = leave;
      } catch (err) {
        console.error('Failed to register drag-drop listeners:', err);
      }
    })();

    const registerNativeFallback = async () => {
      try {
        const unlisten = await appWindow.onDragDropEvent((event) => {
          if (event.payload.type === 'over') {
            handleDragOver();
          } else if (event.payload.type === 'drop') {
            handleDragDrop(event.payload.paths);
          } else {
            handleDragLeave();
          }
        });
        if (disposed) unlisten();
        else unlistenNative = unlisten;
      } catch (err) {
        console.error('Failed to register native drag-drop listener:', err);
      }
    };
    registerNativeFallback();

    return () => {
      disposed = true;
      if (unlistenOver) unlistenOver();
      if (unlistenDrop) unlistenDrop();
      if (unlistenLeave) unlistenLeave();
      if (unlistenNative) unlistenNative();
    };
  }, [appWindow]);

  // 入口捕获会话（可选链式传递）：含 await 的加载结果落回发起工作区，
  // 避免加载期间用户切换工作区导致的结果串写。
  // opts.silent：启动批量恢复时抑制 toast 与 last_directory_path 全局写。
  const loadFolderByPath = async (
    absPath: string,
    storable: string,
    targetSession?: WorkspaceSession,
    opts?: { silent?: boolean },
  ): Promise<FileData[]> => {
    const s = targetSession ?? getActiveSession();
    if (!opts?.silent) localStorage.setItem(LAST_DIR_PATH_KEY, storable);
    const folderName = absPath.split(/[\\/]/).pop() || absPath;
    const loadedFiles = await readDirectory(absPath);
    s.update({
      directoryName: folderName,
      directoryPath: absPath,
      files: loadedFiles,
      isRestorable: true,
    });
    if (!opts?.silent) {
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: t('dropped_folder', { name: folderName, count: loadedFiles.length })
      }));
    }
    return loadedFiles;
  };

  const loadSingleFile = async (filePath: string, targetSession?: WorkspaceSession): Promise<FileData | null> => {
    const s = targetSession ?? getActiveSession();
    // 跨工作区重复打开阻断：该文件已被其它工作区持有则拒绝
    if (findFileHolder) {
      const holder = findFileHolder(filePath, s.id);
      if (holder) {
        window.dispatchEvent(new CustomEvent('app-toast', {
          detail: { message: t('file_open_in_workspace', { seq: String(holder.seq) }), variant: 'alarm' }
        }));
        return null;
      }
    }
    const singleFile = await readSingleFile(filePath);
    if (singleFile) {
      const parentDir = filePath.replace(/[/\\][^/\\]*$/, '');
      const storable = await getStorablePath(parentDir);
      localStorage.setItem(LAST_DIR_PATH_KEY, storable);
      const folderName = parentDir.split(/[\\/]/).pop() || parentDir;
      s.update({
        files: [singleFile],
        directoryName: folderName,
        directoryPath: parentDir,
        isRestorable: true,
        autoSelectIndex: 0,
      });
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: t('dropped_file', { name: singleFile.name })
      }));
      return singleFile;
    }
    return null;
  };

  const handleDroppedFolder = async (pathStr: string, targetSession?: WorkspaceSession) => {
    const s = targetSession ?? getActiveSession();
    const loadedFiles = await openDirectoryWithGuards(pathStr, s);
    if (loadedFiles) {
      s.update({ autoSelectIndex: getLastActiveFileIndex(loadedFiles) });
    }
  };

  const handleDroppedPath = async (pathStr: string) => {
    try {
      const s = await fs.stat(pathStr);
      if (s.isDirectory) {
        await handleDroppedFolder(pathStr);
      } else if (s.isFile && pathStr.toLowerCase().endsWith('.txt')) {
        await loadSingleFile(pathStr);
      } else {
        window.dispatchEvent(new CustomEvent('app-toast', {
          detail: { message: `[${s.isDirectory ? '文件夹' : '文件'}] 不支持该文件类型，仅接受 .txt 文件`, variant: 'alarm' }
        }));
      }
    } catch (err) {
      console.error("Failed to handle dropped path:", err);
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: { message: err instanceof Error ? err.message : String(err), variant: 'alarm' }
      }));
    }
  };

  // 多文件 drop：不读取单文件，解析每个文件所在文件夹并执行"添加文件夹"行为
  const handleMultiDrop = async (paths: string[], targetSession?: WorkspaceSession) => {
    const s = targetSession ?? getActiveSession();
    const targets: string[] = [];
    const seen = new Set<string>();
    for (const p of paths) {
      try {
        const st = await fs.stat(p);
        const dir = st.isDirectory ? p : st.isFile ? parentPathOf(p) : null;
        if (dir && !seen.has(dir)) {
          seen.add(dir);
          targets.push(dir);
        }
      } catch (err) {
        console.error("Failed to stat dropped path:", err);
        window.dispatchEvent(new CustomEvent('app-toast', {
          detail: { message: err instanceof Error ? err.message : String(err), variant: 'alarm' }
        }));
      }
    }
    for (const dir of targets) {
      await handleDroppedFolder(dir, s);
    }
  };

  // 让拖拽监听（Rust 转发事件）始终使用最新的 handler / 最新 folderList 守卫
  handleDroppedPathRef.current = handleDroppedPath;
  handleMultiDropRef.current = handleMultiDrop;

  // --- Path & OneDrive Logic ---
  const getAbsoluteDirPath = useCallback(async (pathStr: string) => {
    try {
      if (await pathApi.isAbsolute(pathStr)) return pathStr;
      const base = await pathApi.executableDir();
      return await pathApi.resolve(base, pathStr);
    } catch (e) {
      return pathStr;
    }
  }, []);

  const getStorablePath = useCallback(async (absPath: string) => {
    try {
      const base = await pathApi.executableDir();
      // 由于 pathApi 不支持 relative，我们手动检查 absPath 是否位于 base 目录下
      if (absPath.startsWith(base)) {
        // 截取掉 base 部分并去掉开头的路径分隔符
        return absPath.slice(base.length).replace(/^[\\/]+/, '');
      }
      return absPath;
    } catch (e) {
      return absPath;
    }
  }, []);

  const getActiveProfile = (dirPath?: string): ParserProfile => {
    const { parserProfiles, activeParserProfileId, folderProfileMap } = settings;
    if (!parserProfiles?.length) return passthroughProfile;
    const effectiveId = resolveEffectiveProfileId(folderProfileMap, dirPath, activeParserProfileId);
    if (effectiveId) {
      const found = parserProfiles.find(p => p.id === effectiveId);
      if (found) return found;
    }
    return passthroughProfile;
  };

  // --- File System Operations ---
  const readDirectory = async (pathStr: string, overrideProfileId?: string): Promise<FileData[]> => {
    try {
      const entries = await fs.readDir(pathStr);
      const txtEntries = entries.filter(entry => entry.isFile && entry.name.endsWith('.txt'));

      // 并行处理所有文件，极大地提高启动速度
      const filePromises = txtEntries.map(async (entry) => {
        try {
          const filePath = await pathApi.join(pathStr, entry.name);
          const uint8 = await fs.readFile(filePath);
          let text: string;
          let hasBom = false;
          if (uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
            hasBom = true;
            text = new TextDecoder().decode(uint8.slice(3));
          } else {
            text = new TextDecoder().decode(uint8);
          }
          const activeProfile = overrideProfileId !== undefined
            ? (settings.parserProfiles?.find(p => p.id === overrideProfileId) ?? passthroughProfile)
            : getActiveProfile(pathStr);
          const parsed = parseFile(entry.name, text, activeProfile);
          parsed.hasBom = hasBom;
          const chapterTitle = findLastSourceLine(text, activeProfile);
          if (chapterTitle) parsed.chapterTitle = chapterTitle.trim();
          (parsed as any).fullPath = filePath;
          return parsed;
        } catch (err) { return null; }
      });

      const newFiles = (await Promise.all(filePromises)).filter((f): f is FileData => f !== null);
      newFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      return newFiles;
    } catch (err) {
      return [];
    }
  };

  const readSingleFile = async (filePath: string): Promise<FileData | null> => {
    try {
      const uint8 = await fs.readFile(filePath);
      let text: string;
      let hasBom = false;
      if (uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
        hasBom = true;
        text = new TextDecoder().decode(uint8.slice(3));
      } else {
        text = new TextDecoder().decode(uint8);
      }
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      const parentDir = filePath.replace(/[/\\][^/\\]*$/, '');
      const activeProfile = getActiveProfile(parentDir);
      const parsed = parseFile(fileName, text, activeProfile);
      parsed.hasBom = hasBom;
      const chapterTitle = findLastSourceLine(text, activeProfile);
      if (chapterTitle) parsed.chapterTitle = chapterTitle.trim();
      (parsed as any).fullPath = filePath;
      return parsed;
    } catch (err) {
      console.error("Failed to read single file:", err);
      return null;
    }
  };

  // 轻量目录浏览：只列出子文件夹与 .txt 文件名，不读取/解析任何文件内容
  const listDirectory = useCallback(async (pathStr: string): Promise<DirectoryListing> => {
    try {
      const entries = await fs.readDir(pathStr);
      const folders: FolderItem[] = [];
      const fileNames: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory) {
          folders.push({ path: await pathApi.join(pathStr, entry.name), name: entry.name });
        } else if (entry.isFile && entry.name.endsWith('.txt')) {
          fileNames.push(entry.name);
        }
      }
      const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      folders.sort((a, b) => compare(a.name, b.name));
      fileNames.sort(compare);
      return { folders, fileNames };
    } catch (err) {
      return { folders: [], fileNames: [] };
    }
  }, []);

  // 该路径是否已在已保存文件夹列表中（规范化比较，大小写/尾斜杠不敏感）
  const isFolderAlreadySaved = useCallback((absPath: string): boolean => {
    return folderList.some(f => isSamePath(f.path, absPath));
  }, [folderList]);

  // 检查该路径是否为已保存文件夹的任意层级后代（二级、三级…）
  const isDescendantOfSavedFolder = useCallback(async (absPath: string): Promise<boolean> => {
    return folderList.some(f => !isSamePath(f.path, absPath) && isPathWithin(absPath, f.path));
  }, [folderList]);

  // 找出 folderList 中属于 absPath 后代的已保存子目录
  const findSavedSubfoldersOf = useCallback((absPath: string): FolderItem[] => {
    return folderList.filter(f => !isSamePath(f.path, absPath) && isPathWithin(f.path, absPath));
  }, [folderList]);

  useEffect(() => {
    (async () => {
      // 工作区注册表存在时跳过遗留恢复（避免竞态覆盖已恢复会话的元数据）
      if (loadWorkspaceRegistry()) return;
      const savedPath = localStorage.getItem(LAST_DIR_PATH_KEY);
      if (savedPath) {
        // 立即解析为绝对路径，确保后续 fs 操作可用
        const absPath = await getAbsoluteDirPath(savedPath);
        getActiveSession().update({ isRestorable: true, directoryPath: absPath });
        // 注意：不将缓存路径回填 folderList。
        // 已删除的文件夹不应参与"已保存文件夹"检查（isDescendantOfSavedFolder / findSavedSubfoldersOf），
        // 缓存仅用于恢复按钮（restoreDirectory）等快速找回场景。
      }
    })();
  }, [getAbsoluteDirPath, getActiveSession]);

  const pickDirectory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const selected = await dialog.open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        return await openDirectoryWithGuards(selected);
      }
      return null;
    } catch (err) {
      setError(t('pick_directory_error'));
      return null;
    } finally { setIsLoading(false); }
  };

  // "恢复进度"按工作区绑定：重读当前工作区自己绑定的目录（而非全局最近目录）
  const restoreDirectory = async (toastOverride?: string, overrideProfileId?: string) => {
    setIsLoading(true);
    setError(null);
    const s = getActiveSession();
    try {
      if (!s.directoryPath) {
        s.update({ isRestorable: false });
        window.dispatchEvent(new CustomEvent('app-toast', {
          detail: t('no_restore_record')
        }));
        return null;
      }
      const folderName = s.directoryName || s.directoryPath.split(/[\\/]/).pop() || s.directoryPath;
      const loadedFiles = await readDirectory(s.directoryPath, overrideProfileId);
      s.update({
        files: loadedFiles,
        directoryName: folderName,
        isRestorable: true,
      });
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: toastOverride || t('restore_success', { name: folderName, count: loadedFiles.length })
      }));
      return loadedFiles;
    } catch (err) {
      setError(t('restore_folder_error'));
      return null;
    } finally { setIsLoading(false); }
  };

  const pickSingleFile = async (): Promise<FileData | null> => {
    try {
      const selected = await dialog.open({
        directory: false, multiple: false,
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
      });
      if (selected && typeof selected === 'string') {
        return await loadSingleFile(selected);
      }
      return null;
    } catch (err) {
      console.error("Failed to pick single file:", err);
      return null;
    }
  };

  const saveFile = async (fileData: FileData, content: string): Promise<boolean> => {
    const fullPath = fileData.fullPath;
    if (!fullPath) return false;
    try {
      const encoded = new TextEncoder().encode(content);
      const uint8 = fileData.hasBom
        ? new Uint8Array([0xEF, 0xBB, 0xBF, ...encoded])
        : encoded;
      await fs.writeFile(fullPath, uint8);
      return true;
    } catch (err) {
      console.error("Native save failed:", err);
      return false;
    }
  };

  const saveNewFileInDirectory = useCallback(async (fileName: string, content: string) => {
    const directoryPath = getActiveSession().directoryPath;
    if (!directoryPath) return false;
    try {
      const filePath = await pathApi.join(directoryPath, fileName);
      const uint8 = new TextEncoder().encode(content);
      await fs.writeFile(filePath, uint8);
      return true;
    } catch (err) { 
      console.error("Native save (new file) failed:", err);
      return false; 
    }
  }, [getActiveSession]);

  const openInExplorer = useCallback(async (path?: string) => {
    const targetPath = path || getActiveSession().directoryPath;
    if (!targetPath) return;
    try {
      await openPath(targetPath);
    } catch (err) {
      console.error("Failed to open in explorer:", err);
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: { message: err instanceof Error ? err.message : String(err), variant: 'alarm' }
      }));
    }
  }, [getActiveSession]);

  const saveLastActiveFile = (fileName: string) => {
    const dir = getActiveSession().directoryPath;
    if (dir) {
      localStorage.setItem(`${LAST_ACTIVE_FILE_KEY}_${dir}`, fileName);
    }
  };
  const getLastActiveFile = (): string | null => {
    const dir = getActiveSession().directoryPath;
    return dir ? localStorage.getItem(`${LAST_ACTIVE_FILE_KEY}_${dir}`) : null;
  };
  const getLastActiveFileIndex = useCallback((loadedFiles: FileData[]): number => {
    const lastActive = getLastActiveFile();
    if (lastActive) {
      const found = loadedFiles.findIndex(f => f.name === lastActive);
      return found !== -1 ? found : 0;
    }
    return 0;
  }, [getLastActiveFile]);

  // --- Folder Management ---
  const folderListRef = useRef<FolderItem[]>([]);
  useEffect(() => {
    folderListRef.current = folderList;
  }, [folderList]);

  const addToFolderList = useCallback((absPath: string): boolean => {
    if (folderListRef.current.some(f => isSamePath(f.path, absPath))) return false;
    const name = absPath.split(/[\\/]/).pop() || absPath;
    setFolderList(prev => (prev.some(f => isSamePath(f.path, absPath)) ? prev : [...prev, { path: absPath, name }]));
    return true;
  }, []);

  const pickDirectoryForList = useCallback(async (): Promise<string | null> => {
    try {
      const selected = await dialog.open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        console.log('[add] pickDirectoryForList selected=', selected);
        if (isFolderAlreadySaved(selected)) {
          window.dispatchEvent(new CustomEvent('app-toast', {
            detail: { message: t('folder_already_exists'), variant: 'alarm' }
          }));
          return null;
        }
        if (await isDescendantOfSavedFolder(selected)) {
          window.dispatchEvent(new CustomEvent('app-toast', {
            detail: { message: t('folder_descendant_blocked'), variant: 'alarm' }
          }));
          return null;
        }
        return selected;
      }
      console.log('[add] pickDirectoryForList cancelled or invalid, selected=', selected);
      return null;
    } catch (err) {
      console.error('Failed to pick directory for list:', err);
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: { message: err instanceof Error ? err.message : String(err), variant: 'alarm' }
      }));
      return null;
    }
  }, [isFolderAlreadySaved, isDescendantOfSavedFolder, t]);

  const removeFolderFromList = useCallback((path: string, targetSession?: WorkspaceSession): boolean => {
    const wasActive = (targetSession ?? getActiveSession()).directoryPath === path;
    setFolderList(prev => prev.filter(f => !isSamePath(f.path, path)));
    if (settings.folderProfileMap?.[path]) {
      const newMap = { ...settings.folderProfileMap };
      delete newMap[path];
      updateSettings({ folderProfileMap: newMap });
    }
    // 联动清理该目录的 FileList 状态（同名守卫：其他已保存目录同名时保留其状态）
    const folderName = path.split(/[\\/]/).pop() || path;
    const otherSameName = folderListRef.current.some(f => !isSamePath(f.path, path) && (f.path.split(/[\\/]/).pop() || f.path) === folderName);
    if (!otherSameName) {
      localStorage.removeItem(`filelist-filter-${folderName}`);
      localStorage.removeItem(`filelist-scroll-${folderName}`);
    }
    localStorage.removeItem(`${LAST_ACTIVE_FILE_KEY}_${path}`);
    return wasActive;
  }, [settings.folderProfileMap, updateSettings, getActiveSession]);

  const switchToDirectory = useCallback(async (path: string, targetSession?: WorkspaceSession): Promise<FileData[] | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const storable = await getStorablePath(path);
      return await loadFolderByPath(path, storable, targetSession ?? getActiveSession());
    } catch (err) {
      setError(t('switch_folder_error'));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [loadFolderByPath, getStorablePath, t]);

  // 打开目录的统一入口：已保存检查 + 后代合并确认 + 注册 + 加载。
  // 供 pickDirectory（"打开文件夹"）与 handleDroppedPath（拖拽）共用。
  // 已保存文件夹及其任意层级后代：仅打开、不注册（视为已保存），
  // 反馈统一为 loadFolderByPath 的"已加载文件夹"toast。
  const openDirectoryWithGuards = useCallback(async (absPath: string, targetSession?: WorkspaceSession): Promise<FileData[] | null> => {
    const s = targetSession ?? getActiveSession();
    if (isFolderAlreadySaved(absPath) || await isDescendantOfSavedFolder(absPath)) {
      return await loadFolderByPath(absPath, await getStorablePath(absPath), s);
    }
    const subs = findSavedSubfoldersOf(absPath);
    let merged = false;
    if (subs.length > 0) {
      const ok = await requestUserConfirm(
        t('merge_subfolders_title'),
        t('merge_subfolders_message'),
        'warning',
        t('continue'),
        t('cancel'),
      );
      if (!ok) return null;
      merged = true;
    }
    let activeRemoved = false;
    subs.forEach(s2 => {
      if (removeFolderFromList(s2.path, s)) activeRemoved = true;
    });
    addToFolderList(absPath);
    const loadedFiles = activeRemoved
      ? await switchToDirectory(absPath, s)
      : await loadFolderByPath(absPath, await getStorablePath(absPath), s);
    if (merged) {
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: t('merge_success')
      }));
    }
    return loadedFiles;
  }, [isFolderAlreadySaved, isDescendantOfSavedFolder, findSavedSubfoldersOf, requestUserConfirm, removeFolderFromList, addToFolderList, switchToDirectory, loadFolderByPath, getStorablePath, t]);

  const clearActiveDirectory = useCallback(() => {
    getActiveSession().update({
      files: [],
      directoryName: '',
      directoryPath: null,
      isRestorable: false,
    });
  }, [getActiveSession]);

  const updateFileBlocks = useCallback((
    index: number,
    blocks: TextBlock[],
    blankLinesBefore: number[],
    trailingBlankLines: number,
  ) => {
    const session = getActiveSession();
    if (index < 0 || index >= session.files.length) return;
    const updated = [...session.files];
    updated[index] = { ...updated[index], blocks, blankLinesBefore, trailingBlankLines };
    session.update({ files: updated });
  }, [getActiveSession]);

  return {
    isLoading, setLoading: setIsLoading, error, pickDirectory, pickSingleFile, restoreDirectory,
    saveFile, saveNewFileInDirectory, saveLastActiveFile, getLastActiveFile, getLastActiveFileIndex, isDragging,
    clearAutoSelect,
    appWindow, handleToggleFullscreen, handleToggleMaximized, openInExplorer,
    folderList, addToFolderList, pickDirectoryForList, removeFolderFromList, switchToDirectory, clearActiveDirectory, updateFileBlocks,
    listDirectory, isDescendantOfSavedFolder, findSavedSubfoldersOf,
    loadFolderByPath, getStorablePath, getAbsoluteDirPath,
  };
};
