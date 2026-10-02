import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/AppContext';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onSearchInText: (query: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onSave,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onSearchInText,
  searchQuery,
  setSearchQuery,
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearchInText(searchQuery);
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="fixed z-60 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[260px]"
      style={{ top: y, left: x }}
    >
      <div className="px-4 py-2">
        <input
          type="text"
          placeholder={t('search_in_text')}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-900 focus:outline-none focus:border-blue-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking input
          autoFocus
        />
      </div>

      <div className="h-px bg-gray-200 my-1" />

      <button onClick={() => { onCut(); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex justify-between items-center">
        <span>{t('cut')}</span>
        <span className="text-xs text-gray-400">Ctrl+X</span>
      </button>
      <button onClick={() => { onCopy(); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex justify-between items-center">
        <span>{t('copy')}</span>
        <span className="text-xs text-gray-400">Ctrl+C</span>
      </button>
      <button onClick={() => { onPaste(); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex justify-between items-center">
        <span>{t('paste')}</span>
        <span className="text-xs text-gray-400">Ctrl+V</span>
      </button>
      <button onClick={() => { onDelete(); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex justify-between items-center">
        <span>{t('delete')}</span>
        <span className="text-xs text-gray-400">Del</span>
      </button>
      
      <div className="h-px bg-gray-200 my-1" />

      <button onClick={() => { onUndo(); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex justify-between items-center">
        <span>{t('undo')}</span>
        <span className="text-xs text-gray-400">Ctrl+Z</span>
      </button>
      <button onClick={() => { onRedo(); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex justify-between items-center">
        <span>{t('redo')}</span>
        <span className="text-xs text-gray-400">Ctrl+Y</span>
      </button>
      <button onClick={() => { onSave(); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex justify-between items-center">
        <span>{t('save_export')}</span>
        <span className="text-xs text-gray-400">Ctrl+S</span>
      </button>
    </div>
  );
};
