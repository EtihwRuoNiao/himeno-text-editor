import React, { useRef, useEffect, useState, useMemo } from 'react';
import { FileData } from '../types';
import { FileText, X, Filter } from 'lucide-react';
import { ABOUT_PANEL_HEIGHT, ABOUT_POPOVER_EXTRA, AboutPanel } from './AboutPanel';
import { useTranslation } from '../contexts/AppContext';

interface FileListProps {
  files: FileData[];
  currentFileIndex: number;
  onSelectFile: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
  directoryName: string;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  currentFileIndex,
  onSelectFile,
  isOpen,
  onClose,
  directoryName,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const scrollableContainerRef = useRef<HTMLDivElement>(null);
  const [isFilterEnabled, setIsFilterEnabled] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  // 面板上方空间不足时改为向下展开（文件列表面板贴顶，短列表下向上会跑出视口）
  const [aboutFlip, setAboutFlip] = useState(false);
  const hasScrolledInitiallyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const currentScrollTopRef = useRef(0);

  const toggleAbout = () => {
    if (!isAboutOpen) {
      const r = aboutRef.current?.getBoundingClientRect();
      if (r) {
        const PANEL_H = ABOUT_PANEL_HEIGHT + ABOUT_POPOVER_EXTRA + 16; // 面板固定尺寸 + 弹出层内边距/边框 + 间距
        const spaceAbove = r.top;
        const spaceBelow = window.innerHeight - r.bottom;
        setAboutFlip(spaceAbove < PANEL_H && spaceBelow > spaceAbove);
      }
    }
    setIsAboutOpen(v => !v);
  };

  // 「关于」：随文件列表收起而关闭（组件常驻，不重置会残留在下次展开）
  useEffect(() => {
    if (!isOpen) setIsAboutOpen(false);
  }, [isOpen]);

  // 「关于」：点击「关于面板」与「文件列表面板」之外的任何位置都关闭。
  // 文件列表内部刻意不在此处处理：若在 mousedown 阶段就关闭，遮罩会被提前卸载，
  // 随后的 click 就会落到下面的文件项上（切换文件 / 收起列表）。
  // 列表内的点击统一由遮罩的 onClick 处理。
  useEffect(() => {
    if (!isAboutOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (aboutRef.current?.contains(target)) return;      // About 面板内：不关
      if (containerRef.current?.contains(target)) return;  // 文件列表内：交给遮罩
      setIsAboutOpen(false);
    };
    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, [isAboutOpen]);

  // 说明：文件列表内的点击拦截改用「遮罩层」实现（见 JSX 末尾的 absolute inset-0 元素）。
  // 不用 click 监听器是因为：点文件时 mousedown 会先触发外部点击关闭 -> 状态翻转 ->
  // effect 清理会把拦截器提前移除，等到 click 到达时已无人拦截，文件仍会被切换。

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 当文件夹名称变化时，从 localStorage 加载对应的筛选状态
  useEffect(() => {
    if (!directoryName) {
      setIsFilterEnabled(false);
      return;
    }
    hasScrolledInitiallyRef.current = false;
    currentScrollTopRef.current = 0;
    try {
      const saved = localStorage.getItem(`filelist-filter-${directoryName}`);
      setIsFilterEnabled(saved ? JSON.parse(saved) : false);
    } catch {
      setIsFilterEnabled(false);
    }
  }, [directoryName]);

  const toggleFilter = () => {
    const newState = !isFilterEnabled;
    setIsFilterEnabled(newState);
    if (directoryName) {
      localStorage.setItem(`filelist-filter-${directoryName}`, JSON.stringify(newState));
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onCloseRef.current();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    if (!hasScrolledInitiallyRef.current) {
      setTimeout(() => {
        if (activeItemRef.current) {
          activeItemRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
          hasScrolledInitiallyRef.current = true;
        }
      }, 0);
    } else {
      const savedScrollTop = localStorage.getItem(`filelist-scroll-${directoryName}`);
      if (scrollableContainerRef.current && savedScrollTop) {
        scrollableContainerRef.current.scrollTop = parseInt(savedScrollTop, 10);
        currentScrollTopRef.current = parseInt(savedScrollTop, 10);
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      // 使用 currentScrollTopRef，因为组件卸载时 scrollableContainerRef.current 可能为空
      if (directoryName) {
        localStorage.setItem(`filelist-scroll-${directoryName}`, currentScrollTopRef.current.toString());
      }
    };
  }, [isOpen, directoryName]);

  const fileIndexMap = useMemo(() => new Map(files.map((f, i) => [f, i])), [files]);

  if (!isOpen) return null;

  // 如果筛选开启，则过滤文件列表只显示有章节标题的文件，否则显示全部
  const displayedFiles = isFilterEnabled ? files.filter(file => file.chapterTitle) : files;

  return (
    <div
      ref={containerRef}
      className="absolute top-0 left-3 z-50 w-72 bg-white shadow-xl rounded-lg border border-gray-200 max-h-[80vh] flex flex-col animate-in fade-in duration-150"
    >
      <div className="p-3 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
        <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-700">{t('files')} ({displayedFiles.length})</span>
            <button 
                onClick={toggleFilter}
                title={t('toggle_filter_mode')}
                className={`p-1 rounded-md ${isFilterEnabled ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
            >
                <Filter size={14} />
            </button>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={16} />
        </button>
      </div>
      {/* Added flex-grow to ensure footer is pushed to the bottom */}
      <div
        ref={scrollableContainerRef}
        className="py-1 flex-grow overflow-y-auto"
        onScroll={(e) => {
          currentScrollTopRef.current = e.currentTarget.scrollTop;
        }}
      >
        {displayedFiles.map((file) => {
          const originalIndex = fileIndexMap.get(file)!;
          return (
            <button
              key={originalIndex}
              onClick={() => {
                onSelectFile(originalIndex);
                onClose();
              }}
              ref={originalIndex === currentFileIndex ? activeItemRef : null}
              className={`w-full text-left px-4 py-2 text-sm flex items-start gap-3 hover:bg-gray-100 ${
                originalIndex === currentFileIndex
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-700'
              }`}
            >
              <FileText size={14} className="shrink-0 text-gray-400 mt-0.5" />
              {/* 在文件名后显示章节标题 */}
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate">{file.name}</div>
                {file.chapterTitle && (
                  <div className="text-xs text-gray-400 truncate">{file.chapterTitle}</div>
                )}
              </div>
            </button>
          );
        })}
        {displayedFiles.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-500 text-center">{t('no_results')}</div>
        )}
      </div>
      <div ref={aboutRef} className="relative mt-auto p-3 border-t border-gray-100 bg-gray-50/50 flex justify-center items-center">
        <button
          type="button"
          onClick={toggleAbout}
          title={t('about')}
          className="text-[10px] font-mono text-gray-500 tracking-wider uppercase hover:text-blue-600 transition-colors"
        >
          🌸 Version {__APP_VERSION__} 🎀
        </button>

        {isAboutOpen && (
          <div className={`absolute ${aboutFlip ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 w-64 max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50 text-left`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-800">{t('about')}</h3>
              <button
                type="button"
                onClick={() => setIsAboutOpen(false)}
                title={t('close')}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <AboutPanel />
          </div>
        )}
      </div>

      {/* 遮罩：About 打开时拦截文件列表内的一切点击，避免误切换文件；点它即关闭 About */}
      {isAboutOpen && (
        <div
          className="absolute inset-0 z-40"
          aria-hidden="true"
          onClick={() => setIsAboutOpen(false)}
        />
      )}
    </div>
  );
};
