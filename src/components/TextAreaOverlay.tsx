import React, { useRef, useLayoutEffect, useMemo } from 'react';
import { generateHighlightHtml } from '../utils/textProcessing';
import { useTranslation } from '../contexts/AppContext';

import { DictionaryEntry } from '../types';

interface TextAreaOverlayProps {
  value: string;
  onChange: (value: string, selectionStart?: number, isComposing?: boolean) => void;
  isEditable: boolean;
  enableHalfWidthHighlight: boolean;
  enableSpaceHighlight: boolean;
  enableFuzzyMatch?: boolean;
  enableDictionaryHints?: boolean;
  targetText?: string;
  dictionary?: DictionaryEntry[];
  searchQuery?: string;
  isSearchPanelVisible?: boolean;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onKeyUp?: (e: React.KeyboardEvent) => void;
  onSelect?: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  'data-index'?: number;
  'data-field'?: string;
  'data-row-id'?: string;
  'data-translation-index'?: number;
  tabIndex?: number;
}

// Fixed CSS properties to ensure absolute pixel-perfect alignment between div and textarea
const SHARED_STYLES: React.CSSProperties = {
  gridArea: '1 / 1 / 2 / 2',
  margin: 0,
  padding: '8px',
  border: 'none',
  outline: 'none',
  fontFamily: 'var(--app-editor-font)',
  fontSize: '14px',
  lineHeight: '20px',
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
  textAlign: 'left',
  boxSizing: 'border-box',
  width: '100%',
  tabSize: 4,
};

export const TextAreaOverlay: React.FC<TextAreaOverlayProps> = ({
  value,
  onChange,
  isEditable,
  enableHalfWidthHighlight,
  enableSpaceHighlight,
  enableFuzzyMatch = false,
  enableDictionaryHints = false,
  targetText = '',
  dictionary = [],
  searchQuery = '',
  isSearchPanelVisible = false,
  placeholder,
  className = '',
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  onSelect,
  onClick,
  inputRef,
  'data-index': dataIndex,
  'data-field': dataField,
  'data-row-id': dataRowId,
  'data-translation-index': dataTranslationIndex,
  tabIndex,
}) => {
  const { t } = useTranslation();
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef || internalRef;
  const overlayRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value, e.target.selectionStart || 0, isComposing.current);
  };

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposing.current = false;
    // Trigger a final change event with the composed text
    const target = e.target as HTMLTextAreaElement;
    onChange(target.value, target.selectionStart || 0, false);
  };

  const handleClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (onClick) onClick(e);
    const textarea = e.currentTarget;
    const overlay = overlayRef.current;
    if (!textarea || !overlay) return;

    // Get click coordinates relative to the viewport
    const x = e.clientX;
    const y = e.clientY;

    // Find all dictionary match spans in the overlay
    const spans = overlay.querySelectorAll('.dictionary-match');
    let clickedSpan: HTMLElement | null = null;

    // Check if the click falls within the bounding box of any span
    for (const span of Array.from(spans)) {
      if (span instanceof HTMLElement) {
        const rects = span.getClientRects();
        for (const rect of Array.from(rects)) {
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            clickedSpan = span;
            break;
          }
        }
      }
      if (clickedSpan) break;
    }

    if (clickedSpan) {
      const translation = clickedSpan.getAttribute('data-translation');
      if (translation) {
        // Use a more robust way to copy
        const copyToClipboard = async (text: string) => {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch (err) {
            // Fallback for non-secure contexts or other failures
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
              document.execCommand('copy');
              return true;
            } catch (copyErr) {
              return false;
            } finally {
              document.body.removeChild(textArea);
            }
          }
        };

        copyToClipboard(translation).then((success) => {
          if (success) {
            window.dispatchEvent(new CustomEvent('app-toast', { 
              detail: t('copied').replace('{text}', translation)
            }));
          }
        });
      }
    }
  };

  const highlightHtml = useMemo(() => {
    // Always generate HTML to drive height consistently
    return generateHighlightHtml(
      value, 
      enableHalfWidthHighlight, 
      enableSpaceHighlight, 
      enableFuzzyMatch,
      enableDictionaryHints,
      targetText,
      searchQuery, 
      isSearchPanelVisible, 
      dictionary
    );
  }, [value, enableHalfWidthHighlight, enableSpaceHighlight, enableFuzzyMatch, enableDictionaryHints, targetText, searchQuery, isSearchPanelVisible, dictionary]);

  return (
    <div className={`textarea-overlay-container grid grid-cols-1 grid-rows-1 w-full relative ${className}`}>
      {/* Overlay Layer (Highlights & Height Driver) */}
      <div
        ref={overlayRef}
        style={{
          ...SHARED_STYLES,
          pointerEvents: 'none',
          color: 'transparent',
          zIndex: 1,
          backgroundColor: 'transparent',
          visibility: 'visible',
        }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlightHtml }}
      />

      {/* Input Layer */}
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onClick={handleClick}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onSelect={onSelect}
        readOnly={!isEditable}
        placeholder={placeholder}
        rows={1}
        data-index={dataIndex}
        data-field={dataField}
        data-row-id={dataRowId}
        data-translation-index={dataTranslationIndex}
        tabIndex={tabIndex}
        style={{
          ...SHARED_STYLES,
          resize: 'none',
          overflow: 'hidden',
          backgroundColor: 'transparent',
          zIndex: 2,
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          color: isEditable ? 'inherit' : '#6b7280', // text-gray-500 for read-only
        }}
        className={`
          focus:ring-0
          ${isEditable ? 'text-gray-900' : 'cursor-default'}
        `}
      />
    </div>
  );
};
