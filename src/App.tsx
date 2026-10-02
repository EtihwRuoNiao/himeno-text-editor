import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Header } from './components/Header';
import { FileList } from './components/FileList';
import { EditorRow } from './components/EditorRow';
import { ContextMenu } from './components/ContextMenu';
import { Toast } from './components/Toast';
import { SearchPanel, SearchPanelRef } from './components/SearchPanel';
import { NavigationControl } from './components/NavigationControl';
import { SettingsModal } from './components/SettingsModal';
import { DictionaryModal } from './components/DictionaryModal';
import { FolderManageModal } from './components/FolderManageModal';
import { ConfirmModal } from './components/ConfirmModal';
import { AppProvider, useApp } from './contexts/AppContext';
import { serializeFile, validateProfile, passthroughProfile, setOrphanErrorMessage } from './utils/parser';
import { useAppHost } from './hooks/useAppHost';
import { useSessionMirror, createWorkspaceSession, flushSessionDraft, loadWorkspaceRegistry, saveWorkspaceRegistry, sessionDraftKey, sessionPosKey, findWorkspaceHoldingFile } from './workspace/workspaceStore';
import { createWorkspaceManager, WorkspaceManager, WorkspaceSession } from './workspace/workspaceStore';
import { WorkspaceManagerBar } from './components/WorkspaceManagerBar';
import { DictionaryEntry } from './types';
import { dictionaryService } from './services/dictionaryService';
import { applyAppIcon } from './services/appIconService';
import { onTrayQuit, syncTrayMenu } from './services/trayService';
import { APP_NAME_EN } from './config/appInfo';
import { motion, AnimatePresence } from 'motion/react';
import { Upload } from 'lucide-react';
import { resolveEffectiveProfileId, resolveUserConfirm } from './utils/folderUtils';

// 草稿保留期：30 天（时间窗清理，防 storage_data 无界增长）
const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// 启动时清理过期草稿：解析失败/无 timestamp 的旧格式草稿一律保守保留
const cleanupExpiredDrafts = () => {
  try {
    const cutoff = Date.now() - DRAFT_RETENTION_MS;
    let scanned = 0;
    let removed = 0;
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (!key.startsWith('draft_')) continue;
      scanned++;
      let ts: number | null = null;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        ts = parsed && typeof parsed.timestamp === 'number' ? parsed.timestamp : null;
      } catch {
        ts = null;
      }
      if (ts !== null && ts < cutoff) {
        localStorage.removeItem(key);
        removed++;
      }
    }
    console.log(`[cache-cleanup] scanned ${scanned} drafts, removed ${removed} expired (>30d)`);
  } catch (err) {
    console.error('[cache-cleanup] failed:', err);
  }
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

function AppContent() {
  const { settings, updateSettings, t } = useApp();

  // 工作区管理器 + 活动会话镜像（B 阶段：会话化，单工作区行为不变）
  const wsManagerRef = useRef<WorkspaceManager | null>(null);
  if (!wsManagerRef.current) wsManagerRef.current = createWorkspaceManager();
  // 注册表变更（新建/关闭/切换/排序）驱动 AppContent 重渲染 → getActiveSession 取新会话
  const [, bumpWorkspaceRegistry] = useState(0);
  useEffect(() => {
    const mgr = wsManagerRef.current!;
    return mgr.subscribe(() => bumpWorkspaceRegistry(v => v + 1));
  }, []);
  // 注册表即时保存：新建/关闭/切换/排序任一注册表操作后落盘
  useEffect(() => {
    const mgr = wsManagerRef.current!;
    return mgr.subscribe(() => { saveWorkspaceRegistry(mgr); });
  }, []);
  const getActiveSession = useCallback(() => wsManagerRef.current!.active(), []);
  const activeSession = getActiveSession();
  const {
    blocks: currentBlocks, isDirty, canUndo, canRedo,
    files, isRestorable, directoryName, directoryPath, autoSelectIndex,
    currentFileIndex, blankLinesBefore, trailingBlankLines, lastFocusedIndex,
  } = useSessionMirror(activeSession);
  const pushState = useMemo(() => activeSession.history.pushState.bind(activeSession.history), [activeSession]);
  const updateDraftState = useMemo(() => activeSession.history.updateDraftState.bind(activeSession.history), [activeSession]);
  const undo = useMemo(() => activeSession.history.undo.bind(activeSession.history), [activeSession]);
  const redo = useMemo(() => activeSession.history.redo.bind(activeSession.history), [activeSession]);
  const markClean = useMemo(() => activeSession.history.markClean.bind(activeSession.history), [activeSession]);
  const resetHistory = useMemo(() => activeSession.history.resetHistory.bind(activeSession.history), [activeSession]);
  // activeField 同步字段代理：写入不触发渲染（与既有 ref 语义一致）
  const activeFieldRef = useMemo(() => ({
    get current() { return activeSession.activeField; },
    set current(v) { activeSession.activeField = v; },
  }), [activeSession]);

  // 稳定回调：EditorRow 为 React.memo，内联箭头会使 memo 永久失效（全行重渲染）
  const handleTargetFocus = useCallback((i: number) => {
    activeSession.update({ lastFocusedIndex: i });
  }, [activeSession]);
  const handleIndexChange = useCallback((i: number) => {
    activeSession.update({ lastFocusedIndex: i });
  }, [activeSession]);

  // 定位跳转的最新绑定引用：工作区切换/启动恢复的延迟回调经此调用，确保落到当前活动会话
  const jumpRef = useRef<(targetIndex: number, behavior?: ScrollBehavior) => void>(() => {});

  const currentBlocksRef = useRef(currentBlocks);
  useEffect(() => {
    currentBlocksRef.current = currentBlocks;
  }, [currentBlocks]);

  const { enableSourceEdit, enableHalfWidthHighlight, enableSpaceHighlight, enableFuzzyMatch } = settings;

  const [isFileListOpen, setIsFileListOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);

  // UI State
  const [toastState, setToastState] = useState<{ message: string; variant: string; durationMs?: number } | null>(null);
  // 内容与可见性分离：隐藏时保留最后一条内容，淡出过程中不会退化成空白的默认样式
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'primary' | 'warning';
    confirmLabel?: string;
    cancelLabel?: string;
    tertiaryLabel?: string;
    onTertiary?: () => void;
  }>({
    isOpen: false, title: '', message: '', onConfirm: () => {},
  });

  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{index: number, field: 'sourceText'|'targetText', start: number, end: number}[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const searchPanelRef = useRef<SearchPanelRef>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [draftToRestore, setDraftToRestore] = useState<{ fileName: string, blocks: any[], timestamp: number } | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);

  const [isCurrentDictEnabled, setIsCurrentDictEnabled] = useState(true);
  const [isFolderManageOpen, setIsFolderManageOpen] = useState(false);

  // Sync orphan error message from i18n
  useEffect(() => {
    setOrphanErrorMessage(t('orphan_context_not_found' as any));
  }, [t]);

  // 字体设置同步：注入 CSS 变量（空值恢复默认栈）
  useEffect(() => {
    const root = document.documentElement;
    if (settings.uiFontFamily) {
      root.style.setProperty('--app-ui-font', `"${settings.uiFontFamily}"`);
    } else {
      root.style.removeProperty('--app-ui-font');
    }
  }, [settings.uiFontFamily]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.workspaceFontFamily) {
      root.style.setProperty('--app-editor-font', `"${settings.workspaceFontFamily}"`);
    } else {
      root.style.removeProperty('--app-editor-font');
    }
  }, [settings.workspaceFontFamily]);

  // App Host Hook (Native Bridge) —— 会话态经 useSessionMirror 读取
  const { 
    isLoading, 
    setLoading,
    error, 
    pickDirectory,
    pickSingleFile,
    restoreDirectory,
    saveLastActiveFile,
    getLastActiveFile, getLastActiveFileIndex,
    saveFile,
    saveNewFileInDirectory,
    loadFolderByPath, getStorablePath,
    appWindow,
    handleToggleFullscreen,
    handleToggleMaximized,
    openInExplorer,
    isDragging,
    clearAutoSelect,
    folderList, addToFolderList, pickDirectoryForList, removeFolderFromList, switchToDirectory, clearActiveDirectory, updateFileBlocks,
    listDirectory, findSavedSubfoldersOf,
  } = useAppHost({
    getActiveSession,
    findFileHolder: (fullPath, excludeId) => findWorkspaceHoldingFile(wsManagerRef.current!, fullPath, excludeId),
  });

  // Load dictionary on mount and when dictionary modal closes
  const loadDictionary = useCallback(async () => {
    const configId = settings.activeDictionaryId || 'default';
    const data = await dictionaryService.getDictionary(configId);
    setDictionary(data);
  }, [settings.activeDictionaryId]);

  const loadActiveConfig = useCallback(async () => {
    const configId = settings.activeDictionaryId || 'default';
    const configs = await dictionaryService.getConfigs();
    const activeConfig = configs.find(c => c.id === configId);
    setIsCurrentDictEnabled(activeConfig?.enabled ?? true);
  }, [settings.activeDictionaryId]);

  useEffect(() => {
    loadDictionary();
    loadActiveConfig();
  }, [loadDictionary, loadActiveConfig]);

  // Re-load dictionary when the modal closes (it might have changed)
  useEffect(() => {
    if (!isDictionaryOpen) {
      loadDictionary(); // For entries
      loadActiveConfig(); // For enabled status
    }
  }, [isDictionaryOpen, loadDictionary, loadActiveConfig]);

  const handleCloseDictionary = useCallback(() => setIsDictionaryOpen(false), []);

  const currentFile = files[currentFileIndex];
  
  // durationMs 未指定时沿用既有策略：助手气泡 5s，其余 3s
  const showToast = useCallback((message: string, variant: string = 'default', durationMs?: number) => {
    setToastState({ message, variant, durationMs });
    setToastVisible(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastVisible(false);
    }, durationMs ?? (variant !== 'default' && variant !== 'alarm' ? 5000 : 3000));
  }, []);

  const parserConfigSnapshotRef = useRef('');

  // Snapshot parser config when SettingsModal opens
  useEffect(() => {
    if (isSettingsOpen) {
      parserConfigSnapshotRef.current = JSON.stringify({
        profiles: settings.parserProfiles,
        activeId: settings.activeParserProfileId,
        folderMap: settings.folderProfileMap,
      });
    }
  }, [isSettingsOpen]);

  // 应用程序图标：<exe>/assets/icon/icon.png 存在且未被禁用时优先使用
  useEffect(() => {
    void applyAppIcon(settings.customIconDisabled ?? false);
  }, [settings.customIconDisabled]);

  // 系统托盘菜单文案：语言变化后重建（t 的身份随 settings.language 变化）
  useEffect(() => {
    void syncTrayMenu({
      show: t('tray_show_window'),
      quit: t('tray_quit'),
      tooltip: `${APP_NAME_EN} ${__APP_VERSION__}`,
    });
  }, [t]);

  useEffect(() => {
    const handleToast = (e: CustomEvent) => {
      const detail = e.detail;
      if (typeof detail === 'string') {
        showToast(detail);
      } else if (detail && typeof detail === 'object') {
        showToast(detail.message, detail.variant, detail.durationMs);
      }
    };
    window.addEventListener('app-toast', handleToast as EventListener);
    return () => window.removeEventListener('app-toast', handleToast as EventListener);
  }, [showToast]);

  // 事件驱动的确认请求（拖拽添加的合并提示等，来自 useAppHost）
  useEffect(() => {
    const handleConfirmRequest = (e: CustomEvent) => {
      const { title, message, variant, confirmLabel, cancelLabel } = e.detail || {};
      setConfirmModalState({
        isOpen: true,
        title,
        message,
        variant: variant || 'warning',
        confirmLabel,
        cancelLabel,
        onConfirm: () => resolveUserConfirm(true),
      });
    };
    window.addEventListener('app-modal-confirm', handleConfirmRequest as EventListener);
    return () => window.removeEventListener('app-modal-confirm', handleConfirmRequest as EventListener);
  }, []);

  // 1. 使用 useMemo 记忆化配置，防止虚拟列表在快速重绘时丢失内部缓存
  const calcVisualLines = (text: string): number => {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      width += text.charCodeAt(i) > 0x7F ? 2 : 1;
    }
    return Math.max(1, Math.ceil(width / 60));
  };

  const rowVirtualizer = useVirtualizer(  useMemo(() => ({
    count: currentBlocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index: number) => {
      const block = currentBlocksRef.current[index];
      if (!block) return 153;
      const sourceLines = calcVisualLines(block.sourceText);
      const targetLines = calcVisualLines(block.targetText);
      const maxLines = Math.max(sourceLines, targetLines);
      const textareaHeight = Math.max(maxLines * 20, 40) + 2;
      return textareaHeight * 2 + 69;
    },
    computeItemKey: (index: number) => {
      const block = currentBlocksRef.current[index];
      return block?.id || `item-${index}`;
    },
    overscan: 20,
  }), [currentBlocks.length]));

  const scrollToIndexRef = useRef(rowVirtualizer.scrollToIndex);
  scrollToIndexRef.current = rowVirtualizer.scrollToIndex;

  // Scroll to active match
  useEffect(() => {
    if (isSearchOpen && currentSearchIndex >= 0 && searchResults.length > 0) {
      const match = searchResults[currentSearchIndex];
      if (scrollToIndexRef.current) {
        scrollToIndexRef.current(match.index, {
          align: 'center',
        behavior: 'auto'
        });
      }
    }
  }, [currentSearchIndex, isSearchOpen, searchResults]);

  const ensureVisible = useCallback((element: HTMLElement, behavior: ScrollBehavior = 'auto') => {
    const rect = element.getBoundingClientRect();
    const boxHeight = rect.height;
    const viewportHeight = window.innerHeight;
    
    const floatingBar = document.getElementById('floating-progress-bar');
    const floatingBarTop = floatingBar ? floatingBar.getBoundingClientRect().top : viewportHeight;

    const isTooCloseToTop = rect.top <= boxHeight * 4;
    const isTooCloseToBottom = (viewportHeight - rect.bottom) <= boxHeight * 4;
    const isBlockedByBar = (floatingBarTop - rect.bottom) <= boxHeight * 3;

    if (isTooCloseToTop || isTooCloseToBottom || isBlockedByBar) {
      element.scrollIntoView({ behavior, block: 'center' });
    }
  }, []);

  const getSkipCount = useCallback((text: string) => {
    const regex = /^([\u3000「『〇]|@[a-zA-Z0-9]{1,3})+/;
    const match = text.match(regex);
    return match ? match[0].length : 0;
  }, []);

  const jumpToTranslation = useCallback((targetIndex: number, behavior: ScrollBehavior = 'auto', isDragging: boolean = false) => {
    const total = currentBlocksRef.current.length;
    if (targetIndex < 1 || (total > 0 && targetIndex > total)) return;
    activeSession.update({ lastFocusedIndex: targetIndex });
    
    if (scrollToIndexRef.current) {
      scrollToIndexRef.current(targetIndex - 1, {
        align: 'center',
        behavior: 'auto'
      });
      
      if (activeFieldRef.current) {
        const { rowId, field, selectionStart } = activeFieldRef.current;
        const targetBlock = currentBlocksRef.current[targetIndex - 1];
        
        if (targetBlock && targetBlock.id === rowId) {
          setTimeout(() => {
            const selector = `textarea[data-row-id="${rowId}"][data-field="${field}"]`;
            const el = document.querySelector(selector) as HTMLTextAreaElement;
            if (el) {
              el.focus({ preventScroll: true });
              el.setSelectionRange(selectionStart, selectionStart);
            }
          }, 50);
        }
      }
    }

    if (!isDragging) {
      setTimeout(() => {
        const targetTextarea = document.querySelector(`textarea[data-translation-index="${targetIndex}"]`) as HTMLTextAreaElement;
        if (targetTextarea) {
          if (document.activeElement !== targetTextarea) {
            targetTextarea.focus({ preventScroll: true });
            const skipCount = getSkipCount(targetTextarea.value);
            if (skipCount > 0) {
              requestAnimationFrame(() => {
                targetTextarea.setSelectionRange(skipCount, skipCount);
              });
            }
          }
          if (behavior === 'smooth') {
            const container = targetTextarea.closest('[data-active-match]');
            if (container) {
              container.classList.add('ring-4', 'ring-blue-400', 'ring-opacity-50');
              setTimeout(() => {
                container.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-50');
              }, 1000);
            }
          }
        }
      }, 50);
    }
  }, [getSkipCount, activeSession]);
  jumpRef.current = jumpToTranslation;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSettingsOpenRef.current || isDictionaryOpenRef.current || isFolderManageOpenRef.current || confirmModalStateRef.current.isOpen) {
        if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      const scrollKeys = ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '];
      if (e.key === 'Home') {
        parentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      } else if (e.key === 'End') {
        parentRef.current?.scrollTo({ top: parentRef.current.scrollHeight, behavior: 'auto' });
      } else if (scrollKeys.includes(e.key)) {
        if (document.activeElement === document.body || document.activeElement === null) {
          parentRef.current?.focus({ preventScroll: true });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 2. 移除监听 virtualItems 的 useEffect。
  // 它在极速滚动时会造成严重的焦点竞争和主线程阻塞。

  const inputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const handleToggleSourceEdit = () => {
    updateSettings({ enableSourceEdit: !settings.enableSourceEdit });
  };

  const handleToggleHalfWidthHighlight = () => {
    updateSettings({ enableHalfWidthHighlight: !settings.enableHalfWidthHighlight });
  };

  const handleToggleSpaceHighlight = () => {
    updateSettings({ enableSpaceHighlight: !settings.enableSpaceHighlight });
  };

  useEffect(() => {
    const currentFile = files[currentFileIndex];
    if (!currentFile || currentBlocks.length === 0 || !isDirty) {
      if (currentFile && !isDirty && !draftToRestore) {
        localStorage.removeItem(sessionDraftKey(activeSession, currentFile.name));
      }
      setAutoSaveStatus('idle');
      return;
    }

    const timer = setTimeout(() => {
      try {
        setAutoSaveStatus('saving');
        const draftData = {
          fileName: currentFile.name,
          blocks: currentBlocks,
          blankLinesBefore,
          trailingBlankLines,
          timestamp: Date.now()
        };
        localStorage.setItem(sessionDraftKey(activeSession, currentFile.name), JSON.stringify(draftData));
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setAutoSaveStatus('error');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentBlocks, isDirty, currentFileIndex, files, draftToRestore]);

  // 启动后延迟执行过期草稿清理（不阻塞首帧；StrictMode 双跑幂等）
  useEffect(() => {
    const t = setTimeout(cleanupExpiredDrafts, 500);
    return () => clearTimeout(t);
  }, []);

  const loadFileByIndex = useCallback((index: number, fileList = files, opts?: { skipConflictCheck?: boolean }) => {
    if (index >= 0 && index < fileList.length) {
      const file = fileList[index];
      // 跨工作区重复打开阻断：该文件已被其它工作区持有则拒绝并提示
      if (!opts?.skipConflictCheck) {
        const holder = findWorkspaceHoldingFile(wsManagerRef.current!, (file as any).fullPath || '', activeSession.id);
        if (holder) {
          showToast(t('file_open_in_workspace', { seq: String(holder.seq) }), 'alarm');
          return;
        }
      }
      activeSession.update({
        currentFileIndex: index,
        blankLinesBefore: file.blankLinesBefore || [],
        trailingBlankLines: file.trailingBlankLines ?? 0,
      });
      resetHistory(file.blocks);
      saveLastActiveFile(file.name);
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      setAutoSaveStatus('idle');

      const savedDraft = localStorage.getItem(sessionDraftKey(activeSession, file.name));
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          if (JSON.stringify(draft.blocks) !== JSON.stringify(file.blocks)) {
            setDraftToRestore(draft);
          } else {
            localStorage.removeItem(sessionDraftKey(activeSession, file.name));
          }
        } catch (e) {
          console.error('Failed to parse draft:', e);
        }
      } else {
        setDraftToRestore(null);
      }

      const savedPos = localStorage.getItem(sessionPosKey(activeSession, file.name));
      if (savedPos) {
        let pos = parseInt(savedPos, 10);
        const total = file.blocks.length;
        if (pos > total) pos = total;
        if (pos < 1) pos = 1;
        activeSession.update({ lastFocusedIndex: pos });
        setTimeout(() => {
          jumpToTranslation(pos, 'auto');
        }, 100);
      } else {
        activeSession.update({ lastFocusedIndex: 1 });
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      }
    }
  }, [files, resetHistory, saveLastActiveFile, jumpToTranslation, activeSession, showToast, t]);

  const handleParserConfigChanged = useCallback(async (overrideProfileId?: string) => {
    if (currentFileIndex >= 0) {
      const fileName = files[currentFileIndex]?.name;
      if (fileName) localStorage.removeItem(sessionDraftKey(activeSession, fileName));
      setDraftToRestore(null);
    }
    const loadedFiles = await restoreDirectory(t('parser_format_updated' as any), overrideProfileId);
    if (loadedFiles && loadedFiles.length > 0) {
      const activeIndex = getLastActiveFileIndex(loadedFiles);
      loadFileByIndex(activeIndex, loadedFiles, { skipConflictCheck: true });   // 本工作区重读，非重复打开
    }
  }, [files, currentFileIndex, restoreDirectory, getLastActiveFileIndex, loadFileByIndex, t]);

  useEffect(() => {
    const currentFile = files[currentFileIndex];
    if (currentFile && lastFocusedIndex > 0) {
      localStorage.setItem(sessionPosKey(activeSession, currentFile.name), lastFocusedIndex.toString());
    }
  }, [lastFocusedIndex, currentFileIndex, files, activeSession]);

  useEffect(() => {
    if (autoSelectIndex !== null && files.length > 0) {
      loadFileByIndex(autoSelectIndex);
      clearAutoSelect();
    }
  }, [autoSelectIndex, files, loadFileByIndex, clearAutoSelect]);

  const handlePickSingleFile = async () => {
    await pickSingleFile();
  };

  const handlePickDirectory = async () => {
    const loadedFiles = await pickDirectory();
    if (loadedFiles && loadedFiles.length > 0) {
      loadFileByIndex(getLastActiveFileIndex(loadedFiles), loadedFiles);
    }
  };

  const handleRestoreDirectory = async () => {
    const loadedFiles = await restoreDirectory();
    if (loadedFiles && loadedFiles.length > 0) {
      loadFileByIndex(getLastActiveFileIndex(loadedFiles), loadedFiles, { skipConflictCheck: true });   // 本工作区重读
    }
  };

  const handleSettingsClose = useCallback(() => {
    setIsSettingsOpen(false);
    const currentStr = JSON.stringify({
      profiles: settings.parserProfiles,
      activeId: settings.activeParserProfileId,
      folderMap: settings.folderProfileMap,
    });
    if (parserConfigSnapshotRef.current && parserConfigSnapshotRef.current !== currentStr) {
      // 基于"有效配置是否实际变化"判定重解析：跟随祖先具体配置时，仅切换全局不应重解析
      let oldEff = '';
      let oldProfiles: any[] = [];
      try {
        const s = JSON.parse(parserConfigSnapshotRef.current);
        oldEff = resolveEffectiveProfileId(s.folderMap, directoryPath || undefined, s.activeId);
        oldProfiles = s.profiles || [];
      } catch { /* 快照解析失败则按需要重解析处理 */ }
      const newEff = resolveEffectiveProfileId(settings.folderProfileMap, directoryPath || undefined, settings.activeParserProfileId);
      const oldProfile = oldProfiles.find(p => p.id === oldEff);
      const newProfile = settings.parserProfiles?.find(p => p.id === newEff);
      if (oldEff !== newEff || JSON.stringify(oldProfile) !== JSON.stringify(newProfile)) {
        handleParserConfigChanged();
      }
    }
  }, [settings.parserProfiles, settings.activeParserProfileId, settings.folderProfileMap, handleParserConfigChanged, directoryPath]);

  const handleSelectFile = (index: number) => {
    if (index >= 0 && index < files.length) {
      loadFileByIndex(index);
    }
  };

  const handleUpdateBlock = useCallback((
    index: number,
    field: 'sourceText' | 'targetText',
    value: string,
    selectionStart: number | null = null,
    isComposing: boolean = false
  ) => {

    const newBlocks = [...currentBlocksRef.current];
    newBlocks[index] = { ...newBlocks[index], [field]: value };
    const blockId = newBlocks[index].id;
    const fieldType = field === 'sourceText' ? 'source' : 'target';

    if (isComposing) {
      updateDraftState(newBlocks);
    } else {
      pushState(newBlocks, blockId, fieldType, selectionStart);
    }
  }, [pushState, updateDraftState]);

  const handleExport = async (): Promise<boolean> => {
    if (currentFileIndex < 0 || currentFileIndex >= files.length) return false;
    const currentFile = files[currentFileIndex];

    if ((currentFile as any).fullPath) {
      const { parserProfiles, folderProfileMap, activeParserProfileId } = settings;
      const effectiveProfile = (() => {
        if (!parserProfiles?.length) return passthroughProfile;
        const effectiveId = resolveEffectiveProfileId(folderProfileMap, directoryPath || undefined, activeParserProfileId);
        if (effectiveId) {
          const found = parserProfiles.find(p => p.id === effectiveId);
          if (found) return found;
        }
        return passthroughProfile;
      })();

      const { valid, lineRatio, charRatio, idOverCapture } = validateProfile((currentFile as any).rawContent, effectiveProfile);
      if (!valid) {
        if (idOverCapture) {
          showToast(t('id_overcapture_error' as any), 'alarm');
        } else {
          showToast(
            t('save_blocked_by_validation' as any, {
              ratioL: (lineRatio * 100).toFixed(1),
              ratioC: (charRatio * 100).toFixed(1),
            }),
            'alarm'
          );
        }
        return false;
      }
    }

    const content = serializeFile(currentBlocks, blankLinesBefore, trailingBlankLines);

    let fallbackToDownload = false;
    let isFallback = false;

    if ((currentFile as any).fullPath) {
        const success = await saveFile(currentFile, content);
        if (success) {
            markClean();
            updateFileBlocks(currentFileIndex, currentBlocks, blankLinesBefore, trailingBlankLines);
            localStorage.removeItem(sessionDraftKey(activeSession, currentFile.name));
            setDraftToRestore(null);
            showToast(t('save_success'));
            return true;
        } else {
            fallbackToDownload = true;
            isFallback = true;
        }
    } else {
        fallbackToDownload = true;
    }

    if (fallbackToDownload) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        markClean();
        localStorage.removeItem(sessionDraftKey(activeSession, currentFile.name));
        setDraftToRestore(null);
        if (isFallback) {
            showToast(t('save_fallback_download'), 'alarm');
        } else {
            showToast(t('download_success'));
        }
        return true;
    }
  };

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLTextAreaElement && e.target.hasAttribute('data-index')) {
        activeTextareaRef.current = e.target;
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSettingsOpen || isDictionaryOpen || confirmModalState.isOpen) return;
    if (e.target instanceof HTMLTextAreaElement && e.target.hasAttribute('data-index')) {
      activeTextareaRef.current = e.target;
    }
    let x = e.clientX;
    let y = e.clientY;
    const menuWidth = 260;
    const menuHeight = 320;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    setContextMenu({ x, y });
  }, [isSettingsOpen, isDictionaryOpen, confirmModalState.isOpen]);

  const getActiveBlockInfo = () => {
    const el = activeTextareaRef.current;
    if (!el) return null;
    const index = parseInt(el.getAttribute('data-index') || '-1', 10);
    const field = el.getAttribute('data-field') as 'sourceText' | 'targetText';
    if (index >= 0 && field) return { index, field, el };
    return null;
  };

  const handleCut = async () => {
    const info = getActiveBlockInfo();
    if (!info) return;
    const { index, field, el } = info;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value.substring(start, end);
    if (text) {
      await navigator.clipboard.writeText(text);
      const newValue = el.value.substring(0, start) + el.value.substring(end);
      handleUpdateBlock(index, field, newValue, start);
      setTimeout(() => {
        const currentEl = document.querySelector(`textarea[data-index="${index}"][data-field="${field}"]`) as HTMLTextAreaElement;
        const targetEl = currentEl || el;
        targetEl.focus({ preventScroll: true });
        targetEl.setSelectionRange(start, start);
      }, 10);
    } else {
      el.focus({ preventScroll: true });
    }
  };

  const handleCopy = async () => {
    const info = getActiveBlockInfo();
    if (!info) return;
    const { el } = info;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value.substring(start, end);
    if (text) {
      await navigator.clipboard.writeText(text);
    }
    el.focus({ preventScroll: true });
  };

  const handlePaste = async () => {
    const info = getActiveBlockInfo();
    if (!info) return;
    const { index, field, el } = info;
    try {
      const text = await navigator.clipboard.readText();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newValue = el.value.substring(0, start) + text + el.value.substring(end);
      const newCursor = start + text.length;
      handleUpdateBlock(index, field, newValue, newCursor);
      setTimeout(() => {
        const currentEl = document.querySelector(`textarea[data-index="${index}"][data-field="${field}"]`) as HTMLTextAreaElement;
        const targetEl = currentEl || el;
        targetEl.focus({ preventScroll: true });
        targetEl.setSelectionRange(newCursor, newCursor);
      }, 10);
    } catch (err) {
      console.error('Failed to read clipboard', err);
      el.focus({ preventScroll: true });
    }
  };

  const handleDelete = () => {
    const info = getActiveBlockInfo();
    if (!info) return;
    const { index, field, el } = info;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start !== end) {
      const newValue = el.value.substring(0, start) + el.value.substring(end);
      handleUpdateBlock(index, field, newValue, start);
      setTimeout(() => {
        const currentEl = document.querySelector(`textarea[data-index="${index}"][data-field="${field}"]`) as HTMLTextAreaElement;
        const targetEl = currentEl || el;
        targetEl.focus({ preventScroll: true });
        targetEl.setSelectionRange(start, start);
      }, 10);
    } else {
      el.focus({ preventScroll: true });
    }
  };

  const handleSearch = useCallback((query: string, direction: 'next' | 'prev') => {
    if (!query) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }
    const results: {index: number, field: 'sourceText'|'targetText', start: number, end: number}[] = [];
    currentBlocks.forEach((block, idx) => {
      if (enableSourceEdit) {
        let pos = block.sourceText.indexOf(query);
        while (pos !== -1) {
          results.push({ index: idx, field: 'sourceText', start: pos, end: pos + query.length });
          pos = block.sourceText.indexOf(query, pos + 1);
        }
      }
      let pos = block.targetText.indexOf(query);
      while (pos !== -1) {
        results.push({ index: idx, field: 'targetText', start: pos, end: pos + query.length });
        pos = block.targetText.indexOf(query, pos + 1);
      }
    });
    setSearchResults(results);
    if (results.length === 0) {
      setCurrentSearchIndex(-1);
      return;
    }
    let nextIndex = 0;
    if (searchResults.length === results.length) {
      if (direction === 'next') {
        nextIndex = (currentSearchIndex + 1) % results.length;
      } else {
        nextIndex = (currentSearchIndex - 1 + results.length) % results.length;
      }
    }
    setCurrentSearchIndex(nextIndex);
    const match = results[nextIndex];
    const fieldKey = match.field === 'sourceText' ? 'source' : 'target';
    const ref = inputRefs.current.get(`${match.index}-${fieldKey}`);
    if (ref) {
      ref.focus({ preventScroll: true });
      ref.setSelectionRange(match.start, match.end);
    }
  }, [currentBlocks, enableSourceEdit, currentSearchIndex, searchResults.length]);

  const handleReplace = useCallback((query: string, replacement: string, all: boolean) => {
    if (!query) return;
    if (all) {
      let count = 0;
      currentBlocks.forEach(block => {
        if (enableSourceEdit) count += block.sourceText.split(query).length - 1;
        count += block.targetText.split(query).length - 1;
      });

      if (count === 0) {
        showToast(t('no_results'), 'alarm');
        return;
      }

      setConfirmModalState({
        isOpen: true,
        title: t('replace_all_title'),
        message: t('replace_all_message', { find: query, replace: replacement, count: count.toString() }),
        variant: 'primary',
        confirmLabel: t('replace_all_confirm'),
        onConfirm: () => {
          let changed = false;
          let firstChangedBlockId: string | null = null;
          let firstChangedField: 'source' | 'target' | null = null;
          let firstChangedIndex: number | null = null;
          const newBlocks = currentBlocks.map((block) => {
            let newSource = block.sourceText;
            let newTarget = block.targetText;
            if (enableSourceEdit && newSource.includes(query)) {
              if (!firstChangedBlockId) {
                 firstChangedBlockId = block.id;
                 firstChangedField = 'source';
                 firstChangedIndex = newSource.indexOf(query) + replacement.length;
              }
              newSource = newSource.split(query).join(replacement);
              changed = true;
            }
            if (newTarget.includes(query)) {
              if (!firstChangedBlockId) {
                 firstChangedBlockId = block.id;
                 firstChangedField = 'target';
                 firstChangedIndex = newTarget.indexOf(query) + replacement.length;
              }
              newTarget = newTarget.split(query).join(replacement);
              changed = true;
            }
            return { ...block, sourceText: newSource, targetText: newTarget };
          });
          if (changed) {
            pushState(newBlocks, firstChangedBlockId, firstChangedField, firstChangedIndex);
            setTimeout(() => handleSearch(query, 'next'), 0);
            showToast(t('replaced_all_success'));
          }
        }
      });
    } else {
      if (currentSearchIndex >= 0 && currentSearchIndex < searchResults.length) {
        const match = searchResults[currentSearchIndex];
        const block = currentBlocks[match.index];
        const text = block[match.field];
        const newText = text.substring(0, match.start) + replacement + text.substring(match.end);
        const newCursor = match.start + replacement.length;
        handleUpdateBlock(match.index, match.field, newText, newCursor);
        setTimeout(() => handleSearch(query, 'next'), 0);
      }
    }
  }, [currentBlocks, enableSourceEdit, currentSearchIndex, searchResults, handleUpdateBlock, pushState, handleSearch, showToast, t]);

  const restoreFocus = useCallback((transition: any) => {
      if (!transition) return;
      const { targetState, fromState } = transition;
      let changedRowId = null;
      let changedField = null;

      if (targetState.blocks && fromState.blocks) {
          for (let i = 0; i < targetState.blocks.length; i++) {
              const tBlock = targetState.blocks[i];
              const fBlock = fromState.blocks[i];
              if (tBlock.sourceText !== fBlock.sourceText) {
                  changedRowId = tBlock.id;
                  changedField = 'source';
                  break;
              }
              if (tBlock.targetText !== fBlock.targetText) {
                  changedRowId = tBlock.id;
                  changedField = 'target';
                  break;
              }
          }
      }

      const rowIdToFocus = changedRowId || fromState.focusedRowId || targetState.focusedRowId;
      const fieldToFocus = changedField || fromState.focusedField || targetState.focusedField;
      let cursorToFocus = targetState.selectionStart !== null ? targetState.selectionStart : fromState.selectionStart;
      
      if (targetState.selectionStart === null && changedRowId && changedField) {
          const tBlock = targetState.blocks.find((b: any) => b.id === changedRowId);
          const fBlock = fromState.blocks.find((b: any) => b.id === changedRowId);
          if (tBlock && fBlock) {
              const tText = changedField === 'source' ? tBlock.sourceText : tBlock.targetText;
              const fText = changedField === 'source' ? fBlock.sourceText : fBlock.targetText;
              let i = 0;
              while (i < tText.length && i < fText.length && tText[i] === fText[i]) i++;
              cursorToFocus = i;
          }
      }
      
      if (rowIdToFocus) {
          const field = fieldToFocus === 'source' ? 'sourceText' : 'targetText';
          const selector = `textarea[data-row-id="${rowIdToFocus}"][data-field="${field}"]`;
          const tryFocus = () => {
            const el = document.querySelector(selector) as HTMLTextAreaElement;
            if (el) {
                el.focus({ preventScroll: true });
                ensureVisible(el, 'auto');
                if (cursorToFocus !== null) el.setSelectionRange(cursorToFocus, cursorToFocus);
                return true;
            }
            return false;
          };
          if (!tryFocus()) {
            const index = currentBlocksRef.current.findIndex(b => b.id === rowIdToFocus);
            if (index !== -1 && scrollToIndexRef.current) {
              scrollToIndexRef.current(index, { align: 'center', behavior: 'auto' });
              setTimeout(tryFocus, 150);
            }
          }
      }
  }, [ensureVisible]);

  const handleUndo = useCallback(() => {
      const transition = undo();
      if (transition) setTimeout(() => restoreFocus(transition), 10);
  }, [undo, restoreFocus]);

  const handleRedo = useCallback(() => {
      const transition = redo();
      if (transition) setTimeout(() => restoreFocus(transition), 10);
  }, [redo, restoreFocus]);

  // Ref proxies for keyboard handler — avoid listener re-registration on every render
  const handleExportRef = useRef(handleExport);
  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const handleToggleFullscreenRef = useRef(handleToggleFullscreen);
  const handleToggleMaximizedRef = useRef(handleToggleMaximized);
  const isSettingsOpenRef = useRef(isSettingsOpen);
  const isDictionaryOpenRef = useRef(isDictionaryOpen);
  const isFolderManageOpenRef = useRef(isFolderManageOpen);
  const isSearchOpenRef = useRef(isSearchOpen);
  const isFileListOpenRef = useRef(isFileListOpen);
  const contextMenuRef = useRef(contextMenu);
  const enableSourceEditRef = useRef(enableSourceEdit);
  const confirmModalStateRef = useRef(confirmModalState);
  const closeToTrayRef = useRef(settings.closeToTray);

  useEffect(() => {
    handleExportRef.current = handleExport;
    handleUndoRef.current = handleUndo;
    handleRedoRef.current = handleRedo;
    handleToggleFullscreenRef.current = handleToggleFullscreen;
    handleToggleMaximizedRef.current = handleToggleMaximized;
    isSettingsOpenRef.current = isSettingsOpen;
    isDictionaryOpenRef.current = isDictionaryOpen;
    isFolderManageOpenRef.current = isFolderManageOpen;
    isSearchOpenRef.current = isSearchOpen;
    isFileListOpenRef.current = isFileListOpen;
    contextMenuRef.current = contextMenu;
    enableSourceEditRef.current = enableSourceEdit;
    confirmModalStateRef.current = confirmModalState;
    closeToTrayRef.current = settings.closeToTray;
  });

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenuRef.current) { setContextMenu(null); e.preventDefault(); return; }
        if (isFileListOpenRef.current) { setIsFileListOpen(false); e.preventDefault(); return; }
        if (isSearchOpenRef.current) { setIsSearchOpen(false); e.preventDefault(); return; }
        if (isSettingsOpenRef.current || isDictionaryOpenRef.current) return;
        setIsSettingsOpen(true);
        e.preventDefault();
        return;
      }

      if (e.key === 'F11') { e.preventDefault(); handleToggleFullscreenRef.current(); return; }
      if (e.altKey && e.key === 'Enter') { e.preventDefault(); handleToggleMaximizedRef.current(); return; }

      if (isSettingsOpenRef.current || isDictionaryOpenRef.current || isFolderManageOpenRef.current || confirmModalStateRef.current.isOpen) return;
      if ((e.target as HTMLElement).closest('.search-panel-container') && e.key === 'Enter') return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setIsFolderManageOpen(true); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); setIsDictionaryOpen(true); return; }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleExportRef.current(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) handleRedoRef.current(); else handleUndoRef.current(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedoRef.current(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault(); setIsSearchOpen(true);
        setTimeout(() => searchPanelRef.current?.focusInput(), 0);
      } else if (e.key === ' ') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          if (activeFieldRef.current) {
            const { rowId, field, selectionStart } = activeFieldRef.current;
            if (field === 'readonly' || (field === 'sourceText' && !enableSourceEditRef.current)) return;
            e.preventDefault();
            const index = currentBlocksRef.current.findIndex(b => b.id === rowId);
            if (index !== -1 && scrollToIndexRef.current) {
              scrollToIndexRef.current(index, { align: 'center', behavior: 'auto' });
              const selector = `textarea[data-row-id="${rowId}"][data-field="${field}"]`;
              const el = document.querySelector(selector) as HTMLTextAreaElement;
              if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(selectionStart, selectionStart); }
            }
          }
        }
      } else if ((e.key.length === 1 || ['Backspace', 'Enter', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        if (activeFieldRef.current) {
          const { rowId, field, selectionStart } = activeFieldRef.current;
          if (field === 'readonly' || (field === 'sourceText' && !enableSourceEditRef.current)) return;
          if (['Backspace', 'Enter', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
          const index = currentBlocksRef.current.findIndex(b => b.id === rowId);
          if (index !== -1 && scrollToIndexRef.current) {
            scrollToIndexRef.current(index, { align: 'center', behavior: 'auto' });
            const selector = `textarea[data-row-id="${rowId}"][data-field="${field}"]`;
            const el = document.querySelector(selector) as HTMLTextAreaElement;
            if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(selectionStart, selectionStart); }
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // 任何遮罩类 modal 打开时，使工作编辑区失去焦点，防止输入/粘贴/行内导航穿透
  useEffect(() => {
    if (isSettingsOpen || isDictionaryOpen || isFolderManageOpen || confirmModalState.isOpen) {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches('textarea[data-row-id]')) {
        el.blur();
      }
    }
  }, [isSettingsOpen, isDictionaryOpen, isFolderManageOpen, confirmModalState.isOpen]);

  const registerRef = useCallback((index: number, field: 'source' | 'target', ref: HTMLTextAreaElement | null) => {
    const key = `${index}-${field}`;
    if (ref) inputRefs.current.set(key, ref); else inputRefs.current.delete(key);
  }, []);

  const handleNavigate = useCallback((direction: 'up' | 'down' | 'next', currentIndex: number, currentField: 'source' | 'target') => {
    let nextIndex = currentIndex;
    let nextField = currentField;
    if (direction === 'next') { nextIndex = currentIndex + 1; nextField = enableSourceEdit ? 'source' : 'target'; }
    else if (direction === 'up') { if (enableSourceEdit) { if (currentField === 'target') nextField = 'source'; else { nextIndex = currentIndex - 1; nextField = 'target'; } } else { nextIndex = currentIndex - 1; nextField = 'target'; } }
    else if (direction === 'down') { if (enableSourceEdit) { if (currentField === 'source') nextField = 'target'; else { nextIndex = currentIndex + 1; nextField = 'source'; } } else { nextIndex = currentIndex + 1; nextField = 'target'; } }
    if (nextField === 'source' && !enableSourceEdit) nextField = 'target';

    if (nextIndex >= 0 && nextIndex < currentBlocksRef.current.length) {
        const tryFocus = () => {
          const key = `${nextIndex}-${nextField}`;
          let element = inputRefs.current.get(key) || (document.querySelector(`textarea[data-index="${nextIndex}"][data-field="${nextField}Text"]`) as HTMLTextAreaElement);
          if (element) {
              element.focus({ preventScroll: true });
              ensureVisible(element, 'auto');
              const skipCount = getSkipCount(element.value);
              if (skipCount > 0) requestAnimationFrame(() => element.setSelectionRange(skipCount, skipCount));
              return true;
          }
          return false;
        };
        if (!tryFocus() && scrollToIndexRef.current) {
          scrollToIndexRef.current(nextIndex, { align: 'center', behavior: 'auto' });
          setTimeout(tryFocus, 50);
        }
    }
  }, [enableSourceEdit, ensureVisible, getSkipCount]);

  const handleRestoreDraft = () => {
    if (draftToRestore) {
      pushState(draftToRestore.blocks);
      // 草稿若携带空行结构（新格式）则一并恢复，保持与内容一致
      activeSession.update({
        blankLinesBefore: Array.isArray(draftToRestore.blankLinesBefore) ? draftToRestore.blankLinesBefore : blankLinesBefore,
        trailingBlankLines: typeof draftToRestore.trailingBlankLines === 'number' ? draftToRestore.trailingBlankLines : trailingBlankLines,
      });
      setDraftToRestore(null);
      showToast(t('draft_restored'));
      setTimeout(() => jumpToTranslation(lastFocusedIndex, 'auto'), 100);
    }
  };

  const handleDiscardDraft = () => {
    if (draftToRestore) {
      setConfirmModalState({
        isOpen: true,
        title: t('discard_draft_title'),
        message: t('discard_draft_message'),
        onConfirm: () => {
          localStorage.removeItem(sessionDraftKey(activeSession, draftToRestore.fileName));
          setDraftToRestore(null);
          showToast(t('draft_discarded'));
        },
        variant: 'danger',
        confirmLabel: t('discard'),
      });
    }
  };

  // --- C 阶段：多工作区切换/新建/关闭 ---
  // 切换/新建的公共副作用：清空搜索与待恢复提示（跨工作区不串状态）
  const clearTransientUiState = useCallback(() => {
    setIsSearchOpen(false);
    setSearchResults([]);
    setCurrentSearchIndex(-1);
    setGlobalSearchQuery('');
    setDraftToRestore(null);
  }, []);

  const handleCreateWorkspace = useCallback(() => {
    const ws = wsManagerRef.current!.createBlank();
    if (!ws) {
      showToast(t('workspace_limit_reached'), 'alarm');
      return;
    }
    clearTransientUiState();
  }, [clearTransientUiState, showToast, t]);

  const handleSwitchWorkspace = useCallback((id: string) => {
    const mgr = wsManagerRef.current!;
    const outgoing = mgr.active();
    if (outgoing.id === id) return;
    flushSessionDraft(outgoing);   // 离开前 flush 脏草稿（重启后按确认状态恢复）
    if (!mgr.switchTo(id)) return;
    const ws = mgr.active();
    clearTransientUiState();
    // 定位到该工作区关闭前最后聚焦的 block（两段式：首跳 + 测量晚到校准）
    if (ws.history.blocks.length > 0) {
      const target = Math.min(Math.max(ws.lastFocusedIndex, 1), ws.history.blocks.length);
      setTimeout(() => jumpRef.current(target, 'auto'), 100);
      setTimeout(() => {
        if (ws.lastFocusedIndex === target) jumpRef.current(target, 'auto');
      }, 350);
    }
  }, [clearTransientUiState]);

  // 将指定工作区的当前文件写盘（用于"保存并关闭"）；成功后该会话标记为已保存
  const saveWorkspaceCurrent = useCallback(async (ws: WorkspaceSession): Promise<boolean> => {
    const idx = ws.currentFileIndex;
    if (idx < 0 || idx >= ws.files.length) return true;
    const file = ws.files[idx];
    if (!(file as any).fullPath) return true;
    const blocks = ws.history.blocks;
    const content = serializeFile(blocks, ws.blankLinesBefore, ws.trailingBlankLines);
    const ok = await saveFile(file, content);
    if (ok) {
      ws.history.markClean();
      const updated = [...ws.files];
      updated[idx] = { ...updated[idx], blocks, blankLinesBefore: [...ws.blankLinesBefore], trailingBlankLines: ws.trailingBlankLines };
      ws.update({ files: updated });
    }
    return ok;
  }, [saveFile]);

  const handleCloseWorkspaceRequest = useCallback((ws: WorkspaceSession) => {
    const finishClose = () => { wsManagerRef.current!.close(ws.id); };
    if (!ws.history.isDirty) {
      finishClose();
      return;
    }
    const name = ws.directoryName || ws.name;
    const saveAndClose = async () => {
      const ok = await saveWorkspaceCurrent(ws);
      if (ok) {
        finishClose();
      } else {
        showToast(t('workspace_save_failed'), 'alarm');
      }
    };
    const discardAndClose = () => {
      const f = ws.files[ws.currentFileIndex];
      if (f) localStorage.removeItem(sessionDraftKey(ws, f.name));
      finishClose();
    };
    setConfirmModalState({
      isOpen: true,
      title: t('dirty_ws_title'),
      message: t('dirty_ws_message', { name }),
      variant: 'warning',
      confirmLabel: t('save_and_close'),
      cancelLabel: t('cancel'),
      tertiaryLabel: t('discard_and_close'),
      onConfirm: () => { void saveAndClose(); },
      onTertiary: discardAndClose,
    });
  }, [saveWorkspaceCurrent, showToast, t]);

  // --- 退出守卫：X / Alt+F4 / 任务栏 / 电源按钮菜单统一走此链路 ---

  const destroyWindow = useCallback(async () => {
    if (appWindow) await appWindow.destroy();
  }, [appWindow]);

  const showQuitConfirm = useCallback(() => {
    const mgr = wsManagerRef.current!;
    // 退出前 flush 所有脏会话草稿（崩溃兜底；随后按用户选择保存/放弃）
    mgr.workspaces.forEach(ws => flushSessionDraft(ws));
    const dirtyList = mgr.workspaces.filter(ws => ws.history.isDirty);

    if (dirtyList.length === 0) {
      // 无脏工作区：保留原确认流程（确认一次后退出）
      setConfirmModalState({
        isOpen: true,
        title: t('quit_confirm_title'),
        message: t('quit_confirm_message'),
        variant: 'danger',
        confirmLabel: t('quit_app'),
        onConfirm: () => {
          saveWorkspaceRegistry(mgr);
          void destroyWindow();
        },
      });
      return;
    }

    // 有脏工作区：三按钮，未确认不允许关闭
    const names = dirtyList.map(ws => ws.directoryName || ws.name).join('、');
    const saveAllAndExit = async () => {
      for (const ws of dirtyList) {
        const ok = await saveWorkspaceCurrent(ws);
        if (!ok) {
          showToast(t('workspace_save_failed'), 'alarm');
          return;   // 任一保存失败则不退出，保持运行
        }
        const f = ws.files[ws.currentFileIndex];
        if (f) localStorage.removeItem(sessionDraftKey(ws, f.name));
      }
      saveWorkspaceRegistry(mgr);
      void destroyWindow();
    };
    const exitWithoutSaving = () => {
      // 放弃全部未保存更改：清除对应草稿键，重启后恢复为磁盘状态
      dirtyList.forEach(ws => {
        const f = ws.files[ws.currentFileIndex];
        if (f) localStorage.removeItem(sessionDraftKey(ws, f.name));
      });
      saveWorkspaceRegistry(mgr);
      void destroyWindow();
    };

    setConfirmModalState({
      isOpen: true,
      title: t('quit_dirty_title'),
      message: t('quit_dirty_message', { count: String(dirtyList.length), names }),
      variant: 'warning',
      confirmLabel: t('save_all_and_exit'),
      cancelLabel: t('cancel'),
      tertiaryLabel: t('exit_without_saving'),
      onConfirm: () => { void saveAllAndExit(); },
      onTertiary: exitWithoutSaving,
    });
  }, [t, destroyWindow, showToast, saveWorkspaceCurrent, saveWorkspaceRegistry, flushSessionDraft]);

  const handleQuitRequest = useCallback(() => {
    showQuitConfirm();
  }, [showQuitConfirm]);

  // 托盘「退出」：不走确认框（托盘操作本身多步、自带防呆），
  // 但内部与确认框走同一套落盘顺序，确保草稿/工作区记录不丢。
  const quickQuit = useCallback(async () => {
    const mgr = wsManagerRef.current!;
    // 1) 同 showQuitConfirm：先 flush 全部会话草稿（崩溃兜底）
    mgr.workspaces.forEach(ws => flushSessionDraft(ws));
    // 2) 尽力保存脏工作区；失败则保留草稿、不阻断退出
    //    （区别：确认框的「保存并退出」在任一失败时会中止退出，静默路径不能这样卡住）
    for (const ws of mgr.workspaces.filter(w => w.history.isDirty)) {
      try {
        if (await saveWorkspaceCurrent(ws)) {
          const f = ws.files[ws.currentFileIndex];
          if (f) localStorage.removeItem(sessionDraftKey(ws, f.name));
        }
      } catch {
        // 草稿已在第 1 步落盘，忽略单文件保存失败
      }
    }
    // 3) 同 showQuitConfirm：保存注册表后销毁窗口退出
    saveWorkspaceRegistry(mgr);
    await destroyWindow();
  }, [destroyWindow, saveWorkspaceCurrent, saveWorkspaceRegistry, flushSessionDraft]);

  useEffect(() => {
    if (!appWindow) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onTrayQuit(() => { void quickQuit(); }).then(fn => {
      if (disposed) fn(); else unlisten = fn;
    });
    return () => { disposed = true; unlisten?.(); };
  }, [appWindow, quickQuit]);

  // Intercept X / ALT+F4 / taskbar close / 电源按钮菜单
  useEffect(() => {
    if (!appWindow) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closeToTrayRef.current) {
        // 关闭到托盘：必须 hide()——destroy() 掉全部窗口会让进程直接退出。
        // 隐藏前仍把草稿 + 注册表落盘，防进程被外部终止时丢记录。
        const mgr = wsManagerRef.current;
        if (mgr) {
          mgr.workspaces.forEach(ws => flushSessionDraft(ws));
          saveWorkspaceRegistry(mgr);
        }
        const HINT_KEY = 'himeno_tray_hint_shown';
        if (!localStorage.getItem(HINT_KEY)) {
          // 首次关闭到托盘：先拦下 hide，让用户确认后再隐藏；
          // 确认 → 隐藏 + 标记已完成；取消（含 ESC / 点遮罩 / 点 ✕）→ 静默取消本次隐藏且不标记，下次再问。
          setConfirmModalState({
            isOpen: true,
            title: t('tray_minimized_title'),
            message: t('tray_minimized_hint'),
            variant: 'warning',
            confirmLabel: t('tray_minimize_confirm'),
            cancelLabel: t('cancel'),
            onConfirm: () => {
              localStorage.setItem(HINT_KEY, '1');
              void appWindow.hide();
            },
          });
          return;
        }
        await appWindow.hide();
        return;
      }
      showQuitConfirm();
    }).then(fn => {
      if (disposed) fn(); else unlisten = fn;
    });
    return () => { disposed = true; unlisten?.(); };
  }, [appWindow, showQuitConfirm, t]);

  // --- 启动恢复：读取工作区注册表，重建全部会话（含脏内容静默采用） ---
  const wsRestoredRef = useRef(false);
  useEffect(() => {
    if (wsRestoredRef.current) return;
    wsRestoredRef.current = true;
    const mgr = wsManagerRef.current!;
    const registry = loadWorkspaceRegistry();
    if (!registry) return;   // 迁移：无注册表时保持既有 last_directory_path 恢复按钮行为

    const restored = registry.items.map(item => createWorkspaceSession({
      id: item.id,
      seq: item.seq,
      name: item.name,
      directoryPath: item.directoryPath,
      directoryName: item.directoryName,
      singleFilePath: item.singleFilePath,
      isRestorable: !!item.directoryPath,
      lastFocusedIndex: item.lastFocusedIndex,
      blankLinesBefore: Array.isArray(item.blankLinesBefore) ? item.blankLinesBefore : [],
      trailingBlankLines: item.trailingBlankLines || 0,
    }));
    mgr.hydrate(restored, registry.activeId);

    setLoading(true);
    void (async () => {
      try {
        await Promise.all(mgr.workspaces.map(async (ws) => {
          if (!ws.directoryPath) return;   // 空白/单文件工作区：暂仅目录绑定支持自动重载
          try {
            const storable = await getStorablePath(ws.directoryPath);
            const loadedFiles = await loadFolderByPath(ws.directoryPath, storable, ws, { silent: true });
            // 定位当前文件并静默采用其草稿（若有）：收编进会话内存与 files，删除草稿键防误报
            let idx = loadedFiles.findIndex(f => f.name === registry.items.find(it => it.id === ws.id)?.currentFileName);
            if (idx === -1) idx = Math.min(Math.max(ws.lastFocusedIndex, 1), loadedFiles.length) - 1;
            if (idx < 0 || idx >= loadedFiles.length) { ws.update({ currentFileIndex: -1 }); return; }
            const file = loadedFiles[idx];
            let blocks = file.blocks;
            let blankLines = file.blankLinesBefore || [];
            let trailing = file.trailingBlankLines ?? 0;
            let adoptedDirty = false;
            const draftRaw = localStorage.getItem(sessionDraftKey(ws, file.name));
            if (draftRaw) {
              try {
                const draft = JSON.parse(draftRaw);
                if (Array.isArray(draft?.blocks) && draft.blocks.length > 0) {
                  blocks = draft.blocks;
                  blankLines = Array.isArray(draft.blankLinesBefore) ? draft.blankLinesBefore : blankLines;
                  trailing = typeof draft.trailingBlankLines === 'number' ? draft.trailingBlankLines : trailing;
                  adoptedDirty = true;
                }
              } catch { /* 草稿损坏则回退磁盘内容 */ }
            }
            ws.update({ currentFileIndex: idx, blankLinesBefore: blankLines, trailingBlankLines: trailing });
            ws.history.resetHistory(blocks);
            if (adoptedDirty) {
              ws.history.markDirty();
              localStorage.removeItem(sessionDraftKey(ws, file.name));   // 收编：更新 files 并删除键，防止后续误报草稿条
              const updated = [...ws.files];
              updated[idx] = { ...updated[idx], blocks, blankLinesBefore: [...blankLines], trailingBlankLines: trailing };
              ws.update({ files: updated });
            }
            ws.update({ lastFocusedIndex: Math.min(Math.max(ws.lastFocusedIndex, 1), blocks.length || 1) });
          } catch (err) {
            console.error('[workspace-restore] failed for', ws.directoryPath, err);
          }
        }));
      } finally {
        setLoading(false);
        saveWorkspaceRegistry(mgr);   // 恢复完成后固化一次
        // 问题6：默认激活的工作区（若有活跃文件）自动定位到关闭前最后聚焦的 block
        const act = mgr.active();
        if (act.currentFileIndex >= 0 && act.history.blocks.length > 0) {
          const idx = Math.min(Math.max(act.lastFocusedIndex, 1), act.history.blocks.length);
          setTimeout(() => jumpRef.current(idx, 'auto'), 100);
          setTimeout(() => {
            if (act.lastFocusedIndex === idx) jumpRef.current(idx, 'auto');
          }, 350);
        }
      }
    })();
  }, []);


  return (
    <div className="flex flex-col h-screen bg-gray-100 text-gray-900 overflow-hidden font-sans" style={{ fontFamily: 'var(--app-ui-font)' }} onContextMenu={(e) => e.preventDefault()}>
      <AnimatePresence>
        {isDragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-blue-600/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white p-12 rounded-2xl shadow-2xl border-4 border-dashed border-blue-500 flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600"><Upload size={40} className="animate-bounce" /></div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-800">{t('drop_to_open')}</h3>
                <p className="text-gray-500 mt-2">{t('drop_hint')}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast message={toastState?.message || ''} isVisible={toastVisible} onClose={() => setToastVisible(false)} variant={toastState?.variant} />
      <SearchPanel ref={searchPanelRef} isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSearch={handleSearch} onReplace={handleReplace} matchCount={searchResults.length} currentMatchIndex={currentSearchIndex} searchQuery={globalSearchQuery} setSearchQuery={setGlobalSearchQuery} />

      <Header
        onPickDirectory={handlePickDirectory} onPickSingleFile={handlePickSingleFile} onRestoreDirectory={handleRestoreDirectory} onOpenFolderManage={() => setIsFolderManageOpen(true)} isRestorable={isRestorable} directoryName={directoryName}
        onExport={handleExport} onUndo={handleUndo} onRedo={handleRedo} canUndo={canUndo} canRedo={canRedo}
        isSourceEditEnabled={enableSourceEdit} toggleSourceEdit={handleToggleSourceEdit} isHalfWidthHighlightEnabled={enableHalfWidthHighlight} toggleHalfWidthHighlight={handleToggleHalfWidthHighlight}
        toggleFileList={() => setIsFileListOpen(!isFileListOpen)} onOpenSettings={() => setIsSettingsOpen(true)} onOpenDictionary={() => setIsDictionaryOpen(true)}
        currentFileName={currentFile?.name || ''} currentFileChapterTitle={currentFile?.chapterTitle} autoSaveStatus={autoSaveStatus}
        isFullscreen={settings.startFullscreen} onQuit={handleQuitRequest} onToggleFullscreen={handleToggleFullscreen}
      />

      <SettingsModal isOpen={isSettingsOpen} onClose={handleSettingsClose} onOpenDictionary={() => { setIsSettingsOpen(false); setIsDictionaryOpen(true); }} settings={settings} updateSettings={updateSettings} showConfirmModal={setConfirmModalState} isConfirmModalOpen={confirmModalState.isOpen} onQuit={handleQuitRequest} />
      <DictionaryModal isOpen={isDictionaryOpen} onClose={handleCloseDictionary} settings={settings} updateSettings={updateSettings} showConfirmModal={setConfirmModalState} saveFileToDirectory={saveNewFileInDirectory} directoryName={directoryName} isConfirmModalOpen={confirmModalState.isOpen} />
      <FolderManageModal
        isOpen={isFolderManageOpen}
        onClose={() => setIsFolderManageOpen(false)}
        directories={folderList}
        activeDirectory={directoryPath}
        activeFileName={files[currentFileIndex]?.name}
        onSelectDirectory={async (path) => {
          if ((files[currentFileIndex] as any)?.fullPath && isDirty) {
            if (!(await handleExport())) return;
          }
          const loadedFiles = await switchToDirectory(path);
          if (loadedFiles && loadedFiles.length > 0) {
            loadFileByIndex(getLastActiveFileIndex(loadedFiles), loadedFiles);
          }
          setIsFolderManageOpen(false);
        }}
        onProfileBindingChange={(dirPath, profileId) => {
          if (dirPath === directoryPath) handleParserConfigChanged(profileId);
        }}
        onAddDirectory={async () => {
          try {
            const selected = await pickDirectoryForList();
            if (!selected) return null;
            const subs = findSavedSubfoldersOf(selected);
            console.log('[add] selected=', selected, 'subs=', subs.length);
            if (subs.length === 0) {
              const added = addToFolderList(selected);
              console.log('[add] addToFolderList added=', added);
              if (!added) {
                window.dispatchEvent(new CustomEvent('app-toast', {
                  detail: { message: t('folder_already_exists'), variant: 'alarm' }
                }));
              } else {
                window.dispatchEvent(new CustomEvent('app-toast', {
                  detail: t('folder_added', { name: selected.split(/[\\/]/).pop() || selected })
                }));
              }
              return selected;
            }
            setConfirmModalState({
              isOpen: true,
              title: t('merge_subfolders_title'),
              message: t('merge_subfolders_message'),
              variant: 'warning',
              confirmLabel: t('continue'),
              cancelLabel: t('cancel'),
              onConfirm: () => {
                try {
                  let activeRemoved = false;
                  subs.forEach(s => {
                    if (removeFolderFromList(s.path)) activeRemoved = true;
                  });
                  if (activeRemoved) {
                    addToFolderList(selected);
                    switchToDirectory(selected);
                  } else {
                    addToFolderList(selected);
                  }
                  window.dispatchEvent(new CustomEvent('app-toast', {
                    detail: t('merge_success')
                  }));
                } catch (err) {
                  console.error('[add] merge onConfirm failed:', err);
                  window.dispatchEvent(new CustomEvent('app-toast', {
                    detail: { message: err instanceof Error ? err.message : String(err), variant: 'alarm' }
                  }));
                }
              },
            });
            return selected;
          } catch (err) {
            console.error('[add] onAddDirectory failed:', err);
            window.dispatchEvent(new CustomEvent('app-toast', {
              detail: { message: err instanceof Error ? err.message : String(err), variant: 'alarm' }
            }));
            return null;
          }
        }}
        onRemoveDirectory={(path) => {
          setConfirmModalState({
            isOpen: true,
            title: t('remove_folder_confirm_title'),
            message: t('remove_folder_confirm_message', { name: path.split(/[\\/]/).pop() || path }),
            onConfirm: () => {
              const wasActive = removeFolderFromList(path);
              if (wasActive) {
                const next = folderList.find(f => f.path !== path);
                if (next) switchToDirectory(next.path);
                else clearActiveDirectory();
              }
              window.dispatchEvent(new CustomEvent('app-toast', {
                detail: t('folder_removed')
              }));
            },
            variant: 'danger',
          });
        }}
        onOpenInExplorer={(path) => openInExplorer(path)}
        onListDirectory={listDirectory}
        onOpenFile={(dirPath, fileName) => {
          // 跨工作区重复打开预检：命中则阻断——不弹确认、不切换文件夹、不改任何状态
          const holder = findWorkspaceHoldingFile(wsManagerRef.current!, `${dirPath}/${fileName}`, activeSession.id);
          if (holder) {
            showToast(t('file_open_in_workspace', { seq: String(holder.seq) }), 'alarm');
            return;
          }
          setConfirmModalState({
            isOpen: true,
            title: t('open_file_confirm_title'),
            message: t('open_file_confirm_message', { name: fileName }),
            variant: 'primary',
            confirmLabel: t('open_file'),
            cancelLabel: t('cancel'),
            onConfirm: async () => {
              if ((files[currentFileIndex] as any)?.fullPath && isDirty) {
                if (!(await handleExport())) return;
              }
              const loadedFiles = dirPath !== directoryPath ? await switchToDirectory(dirPath) : files;
              if (!loadedFiles || loadedFiles.length === 0) return;
              const idx = loadedFiles.findIndex(f => f.name === fileName);
              if (idx >= 0) {
                loadFileByIndex(idx, loadedFiles);
                setIsFolderManageOpen(false);
              }
            },
          });
        }}
        isConfirmModalOpen={confirmModalState.isOpen}
      />
      <ConfirmModal isOpen={confirmModalState.isOpen} onClose={() => { resolveUserConfirm(false); setConfirmModalState(prev => ({ ...prev, isOpen: false })); }} onConfirm={confirmModalState.onConfirm} title={confirmModalState.title} message={confirmModalState.message} variant={confirmModalState.variant} confirmLabel={confirmModalState.confirmLabel} cancelLabel={confirmModalState.cancelLabel} tertiaryLabel={confirmModalState.tertiaryLabel} onTertiary={confirmModalState.onTertiary} />

      {draftToRestore && (
        <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between z-30 shadow-md animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center text-sm"><span className="mr-2">📝</span><span>{t('draft_detected', { fileName: draftToRestore.fileName, time: new Date(draftToRestore.timestamp).toLocaleString() })}</span></div>
          <div className="flex gap-2">
            <button onClick={handleRestoreDraft} className="px-3 py-1 bg-white text-blue-600 text-xs font-bold rounded hover:bg-blue-50 transition-colors">{t('restore_draft')}</button>
            <button onClick={handleDiscardDraft} className="px-3 py-1 bg-transparent border border-white text-white text-xs font-medium rounded hover:bg-white/10 transition-colors">{t('discard')}</button>
          </div>
        </div>
      )}

      <div className="relative flex-1 flex overflow-hidden">
        <FileList files={files} currentFileIndex={currentFileIndex} onSelectFile={handleSelectFile} isOpen={isFileListOpen} onClose={() => setIsFileListOpen(false)} directoryName={directoryName} />
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
             <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : currentFileIndex !== -1 ? (
            <div ref={parentRef} className="h-full overflow-auto outline-none" tabIndex={-1} onContextMenu={handleContextMenu}>
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                    <div key={virtualRow.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}>
                      <EditorRow
                        block={currentBlocks[virtualRow.index]} index={virtualRow.index} enableSourceEdit={enableSourceEdit} enableHalfWidthHighlight={enableHalfWidthHighlight} enableSpaceHighlight={enableSpaceHighlight} enableFuzzyMatch={enableFuzzyMatch} enableDictionaryHints={isCurrentDictEnabled} dictionary={dictionary} searchQuery={globalSearchQuery} isSearchPanelVisible={isSearchOpen}
                        activeMatchField={isSearchOpen && currentSearchIndex >= 0 && searchResults[currentSearchIndex]?.index === virtualRow.index ? searchResults[currentSearchIndex].field : null}
                        onUpdate={handleUpdateBlock} registerRef={registerRef} onNavigate={handleNavigate} onTargetFocus={handleTargetFocus} activeFieldRef={activeFieldRef}
                      />
                    </div>
                ))}
              </div>
              <div className="h-32" />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-xl mb-2">{t('no_file_loaded')}</p>
                <p className="text-sm mb-4">{t('open_folder_hint')}</p>
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onSave={handleExport} onUndo={handleUndo} onRedo={handleRedo} onCut={handleCut} onCopy={handleCopy} onPaste={handlePaste} onDelete={handleDelete} searchQuery={globalSearchQuery} setSearchQuery={setGlobalSearchQuery}
          onSearchInText={(q: string) => { setGlobalSearchQuery(q); setIsSearchOpen(true); setTimeout(() => handleSearch(q, 'next'), 100); }}
        />
      )}

      {currentFileIndex !== -1 && currentBlocks.length > 0 && (
        <NavigationControl currentBlocksLength={currentBlocks.length} lastFocusedIndex={lastFocusedIndex} onJump={jumpToTranslation} onIndexChange={handleIndexChange} />
      )}

      <WorkspaceManagerBar
        manager={wsManagerRef.current}
        onCreate={handleCreateWorkspace}
        onSwitch={handleSwitchWorkspace}
        onCloseRequest={handleCloseWorkspaceRequest}
      />
    </div>
  );
}

export default App;
