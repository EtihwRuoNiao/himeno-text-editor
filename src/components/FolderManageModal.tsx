import React, { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FolderOpen, HardDrive, ExternalLink, Trash2, Plus, ChevronDown, ChevronRight, ArrowLeft, FileText } from 'lucide-react';
import { defaultProfile } from '../utils/parser';
import { useTranslation } from '../contexts/AppContext';
import { FolderItem, DirectoryListing } from '../types';
import { GLOBAL_SENTINEL, resolveEffectiveProfileId, isPathWithin, isSamePath } from '../utils/folderUtils';

interface FolderManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  directories: FolderItem[];
  activeDirectory: string | null;
  activeFileName?: string;
  onSelectDirectory: (path: string) => Promise<void>;
  onAddDirectory: () => Promise<string | null>;
  onRemoveDirectory: (path: string) => void;
  onOpenInExplorer: (path: string) => void;
  onProfileBindingChange?: (dirPath: string, profileId?: string) => void;
  onListDirectory: (path: string) => Promise<DirectoryListing>;
  onOpenFile: (dirPath: string, fileName: string) => Promise<void>;
  isConfirmModalOpen?: boolean;
}

export const FolderManageModal: React.FC<FolderManageModalProps> = ({
  isOpen,
  onClose,
  directories,
  activeDirectory,
  activeFileName,
  onSelectDirectory,
  onAddDirectory,
  onRemoveDirectory,
  onOpenInExplorer,
  onProfileBindingChange,
  onListDirectory,
  onOpenFile,
  isConfirmModalOpen = false,
}) => {
  const { t, settings, updateSettings } = useTranslation();
  const onCloseRef = useRef(onClose);
  const isConfirmModalOpenRef = useRef(isConfirmModalOpen);

  useEffect(() => {
    onCloseRef.current = onClose;
    isConfirmModalOpenRef.current = isConfirmModalOpen;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isConfirmModalOpenRef.current) return;
        if (dropdownStateRef.current) {
          setDropdownState(null);
          e.stopImmediatePropagation();
        } else {
          onCloseRef.current();
          e.stopImmediatePropagation();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown, { capture: true });
    }

    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen]);

  const [dropdownState, setDropdownState] = useState<{ dir: string; style: React.CSSProperties; maxHeight: number } | null>(null);
  const dropdownStateRef = useRef(dropdownState);
  dropdownStateRef.current = dropdownState;

  // 浏览状态：browseStack 为进入的目录链（面包屑），browseData 为栈顶目录的列表
  const [browseStack, setBrowseStack] = useState<FolderItem[]>([]);
  const [browseData, setBrowseData] = useState<DirectoryListing | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const browseSeqRef = useRef(0);

  // 面包屑过长时的折叠：truncateFrom 为可见尾部链的起始下标（之前的层级折叠为省略号）
  const [truncateFrom, setTruncateFrom] = useState(0);
  const crumbsContainerRef = useRef<HTMLDivElement>(null);
  const measureRowRef = useRef<HTMLDivElement>(null);
  const ellipsisMeasureRef = useRef<HTMLDivElement>(null);

  // 文件列表行元素收集：用于定位当前已打开文件
  const fileRowRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!dropdownState) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown]')) {
        setDropdownState(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [dropdownState]);

  const loadListing = useCallback(async (path: string) => {
    const seq = ++browseSeqRef.current;
    setBrowseLoading(true);
    setBrowseData(null);
    const data = await onListDirectory(path);
    if (seq !== browseSeqRef.current) return;
    setBrowseData(data);
    setBrowseLoading(false);
  }, [onListDirectory]);

  // 打开弹窗时重置浏览状态；若当前工作文件夹是不在根列表中的二级文件夹，
  // 则以最深已保存祖先为根构造浏览链并定位到该文件夹（无需持久化“二级标记”，即时推导）。
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      prevOpenRef.current = false;
      return;
    }
    if (prevOpenRef.current) return;
    prevOpenRef.current = true;
    setBrowseStack([]);
    setBrowseData(null);
    setDropdownState(null);
    if (activeDirectory) {
      const activeInList = directories.some(d => isSamePath(d.path, activeDirectory));
      if (!activeInList) {
        const ancestors = directories
          .filter(d => isPathWithin(activeDirectory, d.path))
          .sort((a, b) => b.path.length - a.path.length);
        const root = ancestors[0];
        if (root) {
          const rel = activeDirectory.slice(root.path.length).replace(/^[\\/]+/, '');
          const segments = rel.split(/[\\/]/).filter(Boolean);
          let acc = root.path.replace(/[\\/]+$/, '');
          const chain: FolderItem[] = [{ path: root.path, name: root.name }];
          segments.forEach((seg) => {
            acc = acc + '\\' + seg;
            chain.push({ path: acc, name: seg });
          });
          const last = chain[chain.length - 1];
          if (last && !isSamePath(last.path, activeDirectory)) {
            chain[chain.length - 1] = { path: activeDirectory, name: last.name };
          }
          setBrowseStack(chain);
          loadListing(activeDirectory);
        }
      }
    }
  }, [isOpen, activeDirectory, directories, loadListing]);

  const enterFolder = (dir: FolderItem) => {
    setDropdownState(null);
    setBrowseStack(prev => [...prev, dir]);
    loadListing(dir.path);
  };

  const goToLevel = (index: number) => {
    setDropdownState(null);
    if (index < 0) {
      setBrowseStack([]);
      setBrowseData(null);
      return;
    }
    const target = browseStack[index];
    setBrowseStack(prev => prev.slice(0, index + 1));
    loadListing(target.path);
  };

  const goBack = () => goToLevel(browseStack.length - 2);

  // 面包屑折叠计算：隐藏测量行按"无省略号"布局完整渲染（根列表 + 箭头 + 全部 crumb），
  // 与可见行共用容器坐标系；放不下时从尾部逐项回退，追加省略号块宽度后找最大可容纳尾部链。
  const recomputeTruncation = useCallback(() => {
    const measure = measureRowRef.current;
    const container = crumbsContainerRef.current;
    const eBlockEl = ellipsisMeasureRef.current;
    if (!measure || !container || !eBlockEl || browseStack.length === 0) {
      setTruncateFrom(0);
      return;
    }
    const available = container.clientWidth;
    const natural = measure.scrollWidth;
    if (natural <= available) {
      setTruncateFrom(0);
      return;
    }
    const kids = Array.from(measure.children) as HTMLElement[];
    // 测量行子项结构：[根列表][箭头][crumb0][箭头][crumb1]…
    if (kids.length < 3) {
      setTruncateFrom(0);
      return;
    }
    const prefixT = kids[2].offsetLeft + eBlockEl.offsetWidth + 2;
    const end = kids[kids.length - 1].offsetLeft + kids[kids.length - 1].offsetWidth;
    let best = browseStack.length - 1;
    for (let k = browseStack.length - 1; k >= 0; k--) {
      const el = kids[2 + 2 * k];
      if (!el) { best = k; continue; }
      const total = prefixT + (end - el.offsetLeft);
      best = k;
      if (total <= available) break;
    }
    setTruncateFrom(best);
  }, [browseStack]);

  useLayoutEffect(() => {
    recomputeTruncation();
    const container = crumbsContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recomputeTruncation());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recomputeTruncation]);

  // 当前已打开文件出现在文件列表时，高亮并滚动定位到该行
  useEffect(() => {
    if (!activeFileName || !browseData || !browseData.fileNames.includes(activeFileName)) return;
    const el = fileRowRefs.current.get(activeFileName);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeFileName, browseData, browseStack]);

  const safeTruncateFrom = Math.min(Math.max(truncateFrom, 0), browseStack.length);

  const activeDir = directories.find(d => d.path === activeDirectory)
    || (activeDirectory
      ? { path: activeDirectory, name: activeDirectory.split(/[\\/]/).pop() || activeDirectory }
      : undefined);

  const profileNameOf = (id?: string) =>
    settings.parserProfiles?.find(p => p.id === id)?.name || defaultProfile.name;

  const globalProfileLabel = () => {
    const name = profileNameOf(settings.activeParserProfileId);
    return `${t('default_profile')}: ${name}`;
  };

  // 根据行类型与绑定状态生成下拉按钮的显示文本
  const folderProfileLabel = (dir: FolderItem, isRootRow: boolean): { label: string; title: string } => {
    const boundId = settings.folderProfileMap?.[dir.path];
    if (boundId === GLOBAL_SENTINEL) {
      const label = globalProfileLabel();
      return { label, title: label };
    }
    if (boundId) {
      const name = profileNameOf(boundId);
      return { label: name, title: name };
    }
    if (!isRootRow) {
      // 跟随配置（默认）：递归解析上级文件夹的实际配置
      const effectiveId = resolveEffectiveProfileId(settings.folderProfileMap, dir.path, settings.activeParserProfileId);
      const name = profileNameOf(effectiveId);
      return { label: t('follow_parent_config'), title: `${t('follow_parent_config')}: ${name}` };
    }
    const label = globalProfileLabel();
    return { label, title: label };
  };

  // 下拉菜单项：浏览视图行 = [跟随配置, 全局配置, ...配置]；根视图行 = [全局配置, ...配置]
  const buildProfileMenuItems = (isRootRow: boolean): { id: string; label: string }[] => {
    const items: { id: string; label: string }[] = isRootRow
      ? [{ id: '', label: globalProfileLabel() }]
      : [{ id: '', label: t('follow_parent_config') }, { id: GLOBAL_SENTINEL, label: globalProfileLabel() }];
    for (const p of settings.parserProfiles || []) {
      items.push({ id: p.id, label: p.name });
    }
    return items;
  };

  // 共享下拉：触发按钮（打开/关闭 + fixed 定位 + 翻转计算）
  const toggleProfileDropdown = (e: React.MouseEvent<HTMLButtonElement>, dir: FolderItem, isRootRow: boolean) => {
    e.stopPropagation();
    if (dropdownState?.dir === dir.path) { setDropdownState(null); return; }
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const itemCount = buildProfileMenuItems(isRootRow).length;
    const itemHeight = 28;
    const menuPadding = 8;
    const maxVisibleItems = 4;
    const maxHeight = itemHeight * maxVisibleItems + menuPadding;
    const totalContentHeight = Math.min(itemCount * itemHeight + menuPadding, maxHeight);
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < totalContentHeight;
    setDropdownState({
      dir: dir.path,
      style: {
        position: 'fixed',
        zIndex: 200,
        right: window.innerWidth - rect.right,
        top: flip ? rect.top - totalContentHeight - 4 : rect.bottom + 4,
      },
      maxHeight,
    });
  };

  // 共享下拉：选中项（写入绑定 + 工作目录受影响时按活动目录计算有效配置触发重解析）
  const handleProfileMenuClick = (dir: FolderItem, isRootRow: boolean, id: string) => {
    const newMap = { ...(settings.folderProfileMap || {}) };
    if (id === GLOBAL_SENTINEL) newMap[dir.path] = GLOBAL_SENTINEL;
    else if (id) newMap[dir.path] = id;
    else delete newMap[dir.path];
    updateSettings({ folderProfileMap: newMap });
    setDropdownState(null);
    if (activeDirectory && isPathWithin(activeDirectory, dir.path)) {
      const effectiveProfileId = resolveEffectiveProfileId(newMap, activeDirectory, settings.activeParserProfileId) || 'default';
      onProfileBindingChange?.(activeDirectory, effectiveProfileId);
    }
  };

  // 共享下拉：菜单 JSX（与触发按钮共用 dropdownState，互斥联动）
  const renderProfileMenu = (dir: FolderItem, isRootRow: boolean) =>
    dropdownState?.dir === dir.path ? (
      <div
        style={{ ...dropdownState.style, maxHeight: dropdownState.maxHeight }}
        className="w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 overflow-y-auto"
      >
        {buildProfileMenuItems(isRootRow).map(item => {
          const id = item.id;
          const label = item.label;
          const isSelected = (settings.folderProfileMap?.[dir.path] || '') === id;
          return (
            <button
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                handleProfileMenuClick(dir, isRootRow, id);
              }}
              className={`w-full truncate text-left px-3 py-1.5 text-xs ${
                isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'
              }`}
              title={label}
            >
              {label}
            </button>
          );
        })}
      </div>
    ) : null;

  const renderFolderRow = (dir: FolderItem, isActive: boolean, isRootRow: boolean) => (
    <div
      key={dir.path}
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
        isActive ? 'bg-blue-50/50' : 'hover:bg-gray-50/50 cursor-pointer'
      }`}
      onClick={() => enterFolder(dir)}
    >
      {/* 最左侧图标：打开为工作文件夹（原“点击行”的行为） */}
      <button
        onClick={(e) => { e.stopPropagation(); onSelectDirectory(dir.path); }}
        className="relative shrink-0 p-1.5 -ml-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
        title={t('open_as_working_folder')}
      >
        <FolderOpen className={`w-4 h-4 ${isActive ? 'text-blue-600' : ''}`} />
        {isActive && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm truncate ${isActive ? 'font-medium text-blue-900' : 'text-gray-700'}`}>
          {dir.name}
        </div>
        <div className="text-xs text-gray-400 truncate" title={dir.path}>{dir.path}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onOpenInExplorer(dir.path); }}
          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
          title={t('open_in_explorer')}
        >
          <ExternalLink size={15} />
        </button>
        {isRootRow && (
          <button
            onClick={(e) => { if (isActive) return; e.stopPropagation(); onRemoveDirectory(dir.path); }}
            className={`p-1.5 rounded-md transition-colors ${
              isActive
                ? 'text-gray-200 cursor-not-allowed'
                : 'text-gray-400 hover:bg-red-50 hover:text-red-500'
            }`}
            title={isActive ? t('cannot_remove_active_folder') : t('remove_folder')}
            disabled={isActive}
          >
            <Trash2 size={15} />
          </button>
        )}
        <div data-dropdown className="relative">
          <button
            onClick={(e) => toggleProfileDropdown(e, dir, isRootRow)}
            className="w-24 truncate text-xs text-left bg-white border border-gray-200 rounded pl-1.5 pr-1 py-0.5 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 flex items-center gap-0.5"
            title={folderProfileLabel(dir, isRootRow).title}
          >
            <span className="flex-1 truncate">
              {folderProfileLabel(dir, isRootRow).label}
            </span>
            <ChevronDown size={12} className="shrink-0 text-gray-400" />
          </button>
          {renderProfileMenu(dir, isRootRow)}
        </div>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          />
          <div
            className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none"
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-[780px] overflow-hidden flex flex-col h-[85vh] pointer-events-auto"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2 text-gray-800">
                  <HardDrive className="w-5 h-5" />
                  <h2 className="font-semibold text-lg">{t('manage_folders')}</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 flex flex-col flex-1 min-h-0 gap-4">

                {/* Active Folder Panel — 常驻显示 */}
                <div className="shrink-0 bg-blue-50 rounded-lg px-4 py-3 border border-blue-100 min-h-[82px]">
                  {activeDir ? (
                    <>
                      <div className="text-xs font-medium text-blue-500 uppercase tracking-wider mb-1">
                        {t('active_folder')}
                      </div>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-blue-900 truncate">{activeDir.name}</div>
                          <div className="text-xs text-blue-600/70 truncate">{activeDir.path}</div>
                        </div>
                        <button
                          onClick={() => onOpenInExplorer(activeDir.path)}
                          className="ml-auto shrink-0 p-1.5 hover:bg-blue-100 rounded-md text-blue-600 transition-colors"
                          title={t('open_in_explorer')}
                        >
                          <ExternalLink size={16} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                        {t('active_folder')}
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <FolderOpen className="w-4 h-4 shrink-0 opacity-50" />
                        <span className="text-sm">{t('no_active_folder')}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Folder List 标题 — 固定 */}
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('folder_list')}
                </div>

                {/* 返回上级 + 面包屑 — 浏览状态下显示；根列表 crumb 常驻；过长时折叠中间层级，不滚动 */}
                {browseStack.length > 0 && (
                <div className="shrink-0 flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
                  {browseStack.length > 0 && (
                    <button
                      onClick={goBack}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
                      title={t('back_to_parent')}
                    >
                      <ArrowLeft size={13} />
                      {t('back')}
                    </button>
                  )}
                  <div ref={crumbsContainerRef} className="relative flex items-center gap-0.5 min-w-0 overflow-hidden text-xs text-gray-500">
                    <button
                      onClick={() => goToLevel(-1)}
                      className="shrink-0 bg-blue-50 text-blue-700 font-medium px-1.5 py-0.5 rounded hover:bg-blue-100 transition-colors"
                      title={t('root_list')}
                    >
                      {t('root_list')}
                    </button>
                    {browseStack.length > 0 && <ChevronRight size={11} className="shrink-0 text-gray-300" />}
                    {safeTruncateFrom > 0 && (
                      <>
                        <span
                          className="shrink-0 px-1.5 py-0.5 text-gray-400 select-none"
                          title={t('breadcrumb_omitted', {
                            count: String(safeTruncateFrom),
                            names: browseStack.slice(0, safeTruncateFrom).map(f => f.name).join('、'),
                          })}
                        >
                          …
                        </span>
                        <ChevronRight size={11} className="shrink-0 text-gray-300" />
                      </>
                    )}
                    {browseStack.slice(safeTruncateFrom).map((f, j) => {
                      const i = safeTruncateFrom + j;
                      const isLast = i === browseStack.length - 1;
                      return (
                        <Fragment key={f.path}>
                          <button
                            onClick={() => goToLevel(i)}
                            className="shrink-0 max-w-36 truncate px-1.5 py-0.5 rounded hover:bg-gray-200 hover:text-gray-700 transition-colors"
                            title={f.path}
                          >
                            {f.name}
                          </button>
                          {!isLast && <ChevronRight size={11} className="shrink-0 text-gray-300" />}
                        </Fragment>
                      );
                    })}
                    {/* 隐藏测量行：无省略号布局完整渲染，与可见行共用容器坐标系 */}
                    <div
                      ref={measureRowRef}
                      aria-hidden
                      className="absolute left-0 top-0 invisible pointer-events-none flex items-center gap-0.5 text-xs text-gray-500"
                    >
                      <span className="shrink-0 bg-blue-50 text-blue-700 font-medium px-1.5 py-0.5">{t('root_list')}</span>
                      {browseStack.length > 0 && <ChevronRight size={11} className="shrink-0 text-gray-300" />}
                      {browseStack.map((f, i) => (
                        <Fragment key={f.path}>
                          <span className="shrink-0 max-w-36 truncate px-1.5 py-0.5">{f.name}</span>
                          {i < browseStack.length - 1 && <ChevronRight size={11} className="shrink-0 text-gray-300" />}
                        </Fragment>
                      ))}
                    </div>
                    {/* 隐藏测量：省略号块（省略号 + 箭头）宽度 */}
                    <div
                      ref={ellipsisMeasureRef}
                      aria-hidden
                      className="absolute left-0 top-0 invisible pointer-events-none flex items-center gap-0.5 text-xs text-gray-500"
                    >
                      <span className="shrink-0 px-1.5 py-0.5">…</span>
                      <ChevronRight size={11} className="shrink-0 text-gray-300" />
                    </div>
                  </div>
                </div>
                )}

                {/* 分栏区域：浏览状态下左=文件夹列表，右=文件列表 */}
                <div className="flex-1 min-h-0 flex gap-3">
                  {/* 文件夹列表列 */}
                  <div
                    className={`border border-gray-200 rounded-lg overflow-y-auto min-h-0 ${
                      browseStack.length > 0 ? 'w-[320px] shrink-0' : 'flex-1'
                    }`}
                    style={{ scrollbarGutter: 'stable' }}
                  >
                    {browseLoading ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                      </div>
                    ) : browseStack.length > 0 ? (
                      browseData && browseData.folders.length > 0 ? (
                        <div className="divide-y divide-gray-100 border-b border-gray-100">
                          {browseData.folders.map((dir) => renderFolderRow(dir, dir.path === activeDirectory, false))}
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
                          <FolderOpen className="w-10 h-10 mb-2 opacity-50" />
                          <p className="text-sm">{t('no_subfolders')}</p>
                        </div>
                      )
                    ) : directories.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
                        <HardDrive className="w-10 h-10 mb-2 opacity-50" />
                        <p className="text-sm">{t('no_saved_folders')}</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100 border-b border-gray-100">
                        {directories.map((dir) => renderFolderRow(dir, dir.path === activeDirectory, true))}
                      </div>
                    )}
                  </div>

                  {/* 文件列表列 — 仅浏览状态下显示 */}
                  {browseStack.length > 0 && (
                    <div className="w-[400px] shrink-0 border border-gray-200 rounded-lg overflow-hidden flex flex-col min-h-0">
                      <div className="shrink-0 w-full flex items-center justify-between gap-2 px-4 py-2 bg-gray-50/50 border-b border-gray-200">
                        <span className="text-xs font-medium text-gray-600">
                          {t('folder_files', { count: String(browseData?.fileNames.length || 0) })}
                        </span>
                        <div data-dropdown className="relative">
                          <button
                            onClick={(e) => toggleProfileDropdown(e, browseStack[browseStack.length - 1], false)}
                            className="w-24 truncate text-xs text-left bg-white border border-gray-200 rounded pl-1.5 pr-1 py-0.5 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 flex items-center gap-0.5"
                            title={folderProfileLabel(browseStack[browseStack.length - 1], false).title}
                          >
                            <span className="flex-1 truncate">
                              {folderProfileLabel(browseStack[browseStack.length - 1], false).label}
                            </span>
                            <ChevronDown size={12} className="shrink-0 text-gray-400" />
                          </button>
                          {renderProfileMenu(browseStack[browseStack.length - 1], false)}
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-100">
                        {browseData && browseData.fileNames.length > 0 ? (
                          browseData.fileNames.map((name) => {
                            const isActiveFile = name === activeFileName;
                            return (
                              <button
                                key={name}
                                ref={(el) => {
                                  if (el) fileRowRefs.current.set(name, el);
                                  else fileRowRefs.current.delete(name);
                                }}
                                onClick={() => onOpenFile(browseStack[browseStack.length - 1].path, name)}
                                className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                                  isActiveFile
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-gray-700 hover:bg-blue-50/50 hover:text-blue-700'
                                }`}
                                title={t('open_file')}
                              >
                                <FileText size={13} className={`shrink-0 ${isActiveFile ? 'text-blue-600' : 'text-gray-400'}`} />
                                <span className="truncate">{name}</span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-4 py-3 text-xs text-gray-500 text-center">{t('no_files_in_folder')}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end items-center gap-3 rounded-b-2xl">
                <button
                  onClick={onAddDirectory}
                  className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-colors flex items-center gap-2"
                >
                  <Plus size={16} />
                  {t('add_folder')}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  {t('close')}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
