import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { ArrowUp, ArrowDown, X, Replace, ReplaceAll } from 'lucide-react';
import { useTranslation } from '../contexts/AppContext';

export interface SearchPanelRef {
  focusInput: () => void;
}

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string, direction: 'next' | 'prev') => void;
  onReplace: (query: string, replacement: string, all: boolean) => void;
  matchCount: number;
  currentMatchIndex: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const SearchPanel = forwardRef<SearchPanelRef, SearchPanelProps>(({
  isOpen,
  onClose,
  onSearch,
  onReplace,
  matchCount,
  currentMatchIndex,
  searchQuery,
  setSearchQuery,
}, ref) => {
  const { t } = useTranslation();
  const [replaceQuery, setReplaceQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    }
  }));

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onSearch(searchQuery, e.shiftKey ? 'prev' : 'next');
      const currentInput = e.currentTarget;
      setTimeout(() => {
        currentInput.focus();
      }, 0);
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
            onReplace(searchQuery, replaceQuery, true);
        } else {
            onReplace(searchQuery, replaceQuery, false);
        }
        const currentInput = e.currentTarget;
        setTimeout(() => {
          currentInput.focus();
        }, 0);
    }
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusableElements = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements && focusableElements.length > 0) {
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={panelRef}
      onKeyDown={handlePanelKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="search-panel-container fixed top-16 right-4 z-50 w-80 bg-white rounded-lg shadow-xl border border-gray-200 p-3 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-500">{t('find')} & {t('replace')}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative flex items-center">
        <input
          ref={searchInputRef}
          type="text"
          placeholder={t('find')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="w-full pl-2 pr-16 py-1.5 text-sm bg-gray-50 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 placeholder-gray-400"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-gray-50 px-1">
           {searchQuery && (
             <button 
               onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} 
               className="text-gray-400 hover:text-gray-600"
             >
               <X size={14} />
             </button>
           )}
           {matchCount > 0 && (
               <span className="text-xs text-gray-400 ml-1">
                   {currentMatchIndex + 1}/{matchCount}
               </span>
           )}
        </div>
      </div>

      {/* Replace Input */}
      <div className="relative flex items-center">
         <input
          ref={replaceInputRef}
          type="text"
          placeholder={t('replace')}
          value={replaceQuery}
          onChange={(e) => setReplaceQuery(e.target.value)}
          onKeyDown={handleReplaceKeyDown}
          className="w-full pl-2 pr-8 py-1.5 text-sm bg-gray-50 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 placeholder-gray-400"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center bg-gray-50 px-1">
          {replaceQuery && (
             <button 
               onClick={() => { setReplaceQuery(''); replaceInputRef.current?.focus(); }} 
               className="text-gray-400 hover:text-gray-600"
             >
               <X size={14} />
             </button>
           )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1">
            <button 
                onClick={() => onSearch(searchQuery, 'prev')}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                title={t('previous_match')}
            >
                <ArrowUp size={16} />
            </button>
            <button 
                onClick={() => onSearch(searchQuery, 'next')}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                title={t('next_match')}
            >
                <ArrowDown size={16} />
            </button>
        </div>
        
        <div className="flex items-center gap-2">
            <button 
                onClick={() => onReplace(searchQuery, replaceQuery, false)}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                title={t('do_replace')}
            >
                <Replace size={16} />
            </button>
            <button 
                onClick={() => onReplace(searchQuery, replaceQuery, true)}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                title={t('do_replace_all')}
            >
                <ReplaceAll size={16} />
            </button>
        </div>
      </div>
    </div>
  );
});
