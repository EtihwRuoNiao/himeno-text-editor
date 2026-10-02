import React, { useState, useEffect, useRef } from 'react';
import { Save, Undo, Redo, FileText, File, FolderOpen, HardDrive, RefreshCw, Settings, BookOpen, Power, Maximize, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from '../contexts/AppContext';

interface HeaderProps {
  onPickDirectory: () => void;
  onPickSingleFile: () => void;
  onRestoreDirectory: () => void;
  onOpenFolderManage: () => void;
  isRestorable: boolean;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSourceEditEnabled: boolean;
  toggleSourceEdit: () => void;
  isHalfWidthHighlightEnabled: boolean;
  toggleHalfWidthHighlight: () => void;
  toggleFileList: () => void;
  onOpenSettings: () => void;
  onOpenDictionary: () => void;
  currentFileName: string;
  currentFileChapterTitle?: string;
  autoSaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  isFullscreen?: boolean;
  onQuit?: () => void;
  onToggleFullscreen?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onPickDirectory,
  onPickSingleFile,
  onRestoreDirectory,
  onOpenFolderManage,
  isRestorable,
  onExport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isSourceEditEnabled,
  toggleSourceEdit,
  isHalfWidthHighlightEnabled,
  toggleHalfWidthHighlight,
  toggleFileList,
  onOpenSettings,
  onOpenDictionary,
  currentFileName,
  currentFileChapterTitle,
  autoSaveStatus = 'idle',
  isFullscreen = false,
  onQuit,
  onToggleFullscreen,
}) => {
  const { t } = useTranslation();
  const [isOpenMenuOpen, setIsOpenMenuOpen] = useState(false);
  const openMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (openMenuRef.current && !openMenuRef.current.contains(e.target as Node)) {
        setIsOpenMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpenMenuOpen(false);
        e.stopImmediatePropagation();
      }
    };
    if (isOpenMenuOpen) {
      document.addEventListener('mousedown', handleClick);
      window.addEventListener('keydown', handleKeyDown, { capture: true });
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpenMenuOpen]);

  return (
    <header
      className="h-14 bg-white border-b border-gray-200 flex items-center px-4 justify-between shrink-0 z-40 relative"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="flex items-center gap-4">
        {/* File Controls */}
        <div className="flex items-center gap-2">
          <button
            onMouseDown={(e) => {
              e.stopPropagation();
              toggleFileList();
            }}
            className="w-44 h-11 p-2 border border-gray-300 shadow hover:bg-gray-100 rounded-md text-gray-600 flex items-center gap-2 transition-colors"
            title={t('file_list')}
          >
            <FileText size={18} className="shrink-0" />
            <div className="flex-1 flex flex-col items-start overflow-hidden text-left">
              <span className="text-sm font-medium w-full truncate hidden sm:block">
                {currentFileName || t('no_file')}
              </span>
              {currentFileChapterTitle && (
                  <span className="text-xs text-gray-400 w-full truncate hidden sm:block">
                      {currentFileChapterTitle}
                  </span>
              )}
            </div>
          </button>

          <div className="relative flex items-center" ref={openMenuRef}>
            <button
              onClick={onPickDirectory}
              className="p-2 hover:bg-gray-100 rounded-l-md text-gray-600 transition-colors flex items-center gap-2"
              title={t('open_folder')}
            >
              <FolderOpen size={18} />
              <span className="text-xs font-medium hidden md:block">{t('open_folder')}</span>
            </button>
            <button
              onClick={() => setIsOpenMenuOpen(prev => !prev)}
              className="py-2 px-1 hover:bg-gray-100 rounded-r-md text-gray-600 transition-colors self-stretch flex items-center justify-center"
              title={t('open_folder')}
            >
              <ChevronDown size={12} className={`text-gray-400 transition-transform ${isOpenMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {isOpenMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsOpenMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1"
                  >
                    <button
                      onClick={() => { setIsOpenMenuOpen(false); onPickDirectory(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <FolderOpen size={16} />
                      <span>{t('open_folder')}</span>
                    </button>
                    <button
                      onClick={() => { setIsOpenMenuOpen(false); onPickSingleFile(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <File size={16} />
                      <span>{t('open_file')}</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={onOpenFolderManage}
            className="p-2 hover:bg-gray-100 rounded-md text-gray-600 transition-colors flex items-center gap-2"
            title={`${t('manage_folders')} (Ctrl+Shift+F)`}
          >
            <HardDrive size={18} />
            <span className="text-xs font-medium hidden md:block">{t('manage_folders')}</span>
          </button>

          {isRestorable && (
            <button 
              onClick={onRestoreDirectory}
              className="p-2 bg-blue-50 hover:bg-blue-100 rounded-md text-blue-600 transition-colors flex items-center gap-2 animate-in fade-in duration-300" 
              title={t('restore')}
            >
              <RefreshCw size={16} />
              <span className="text-xs font-medium hidden md:block">{t('restore')}</span>
            </button>
          )}

          <button
            onClick={onExport}
            disabled={!currentFileName}
            className="p-2 hover:bg-gray-100 rounded-md text-gray-600 disabled:opacity-50 transition-colors relative"
            title={t('save_export')}
          >
            <Save size={18} />
            {autoSaveStatus !== 'idle' && (
              <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                autoSaveStatus === 'saving' ? 'bg-blue-500 animate-pulse' : 
                autoSaveStatus === 'saved' ? 'bg-green-500' : 'bg-red-500'
              }`} />
            )}
          </button>
        </div>

        <div className="w-px h-6 bg-gray-300 mx-2" />

        {/* History Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-2 hover:bg-gray-100 rounded-md text-gray-600 disabled:opacity-30 transition-colors"
            title={t('undo')}
          >
            <Undo size={18} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-2 hover:bg-gray-100 rounded-md text-gray-600 disabled:opacity-30 transition-colors"
            title={t('redo')}
          >
            <Redo size={18} />
          </button>
        </div>
      </div>

      {/* Settings & Toggles */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isSourceEditEnabled}
              onChange={toggleSourceEdit}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('edit_source')}
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isHalfWidthHighlightEnabled}
              onChange={toggleHalfWidthHighlight}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('highlight_half')}
          </label>
        </div>

        <div className="w-px h-6 bg-gray-300 mx-2" />

        {onQuit && (
          <button
            onClick={onQuit}
            className="p-2 hover:bg-red-100 rounded-md text-red-600 transition-colors"
            title={t('quit_app')}
          >
            <Power size={18}/>
          </button>
        )}

        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className={`p-2 rounded-md transition-colors ${isFullscreen ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'hover:bg-gray-100 text-gray-600'}`}
            title={t('fullscreen')}
          >
            <Maximize size={18} />
          </button>
        )}

        <button
          onClick={onOpenDictionary}
          className="p-2 hover:bg-gray-100 rounded-md text-gray-600 transition-colors"
          title={`${t('dictionary_title')} (Ctrl+Shift+D)`}
        >
          <BookOpen size={18} />
        </button>

        <button
          onClick={onOpenSettings}
          className="p-2 hover:bg-gray-100 rounded-md text-gray-600 transition-colors"
          title={t('settings_header')}
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
};
