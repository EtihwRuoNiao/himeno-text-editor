import React from 'react';
import { TextBlock, DictionaryEntry } from '../types';
import { TextAreaOverlay } from './TextAreaOverlay';

interface EditorRowProps {
  block: TextBlock;
  index: number;
  enableSourceEdit: boolean;
  enableHalfWidthHighlight: boolean;
  enableSpaceHighlight: boolean;
  enableFuzzyMatch: boolean;
  enableDictionaryHints: boolean;
  dictionary: DictionaryEntry[];
  searchQuery: string;
  isSearchPanelVisible: boolean;
  activeMatchField: 'sourceText' | 'targetText' | null;
  onUpdate: (index: number, field: 'sourceText' | 'targetText', value: string, selectionStart?: number, isComposing?: boolean) => void;
  registerRef: (index: number, field: 'source' | 'target', ref: HTMLTextAreaElement | null) => void;
  onNavigate: (direction: 'up' | 'down' | 'next', currentIndex: number, currentField: 'source' | 'target') => void;
  onTargetFocus: (index: number) => void;
  activeFieldRef: React.MutableRefObject<{ rowId: string, field: 'sourceText' | 'targetText' | 'readonly', selectionStart: number } | null>;
}

export const EditorRow: React.FC<EditorRowProps> = React.memo(({
  block,
  index,
  enableSourceEdit,
  enableHalfWidthHighlight,
  enableSpaceHighlight,
  enableFuzzyMatch,
  enableDictionaryHints,
  dictionary,
  searchQuery,
  isSearchPanelVisible,
  activeMatchField,
  onUpdate,
  registerRef,
  onNavigate,
  onTargetFocus,
  activeFieldRef,
}) => {
  
  // We no longer auto-focus on mount because calling focus() during scroll
  // causes severe rendering glitches (ghosting, incomplete paints).
  // Focus is handled explicitly by App.tsx when blind typing or navigating.

  const handleFocus = (field: 'sourceText' | 'targetText' | 'readonly') => {
    if (field === 'targetText') {
      onTargetFocus(index + 1);
    }
    
    // For readonly fields, we just update the ref to track that we are in a readonly area
    if (field === 'readonly') {
      activeFieldRef.current = {
        rowId: block.id,
        field: 'readonly',
        selectionStart: 0
      };
      return;
    }

    const selector = `textarea[data-row-id="${block.id}"][data-field="${field}"]`;
    const el = document.querySelector(selector) as HTMLTextAreaElement;
    
    // If we are already tracking this field, don't overwrite selectionStart.
    // The onSelect/onClick/onKeyUp/onChange handlers will take care of updating it.
    if (activeFieldRef.current?.rowId === block.id && activeFieldRef.current?.field === field) {
      return;
    }
    
    activeFieldRef.current = {
      rowId: block.id,
      field,
      selectionStart: el ? el.selectionStart : 0
    };
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    // We don't clear the ref on blur, so we remember the last focused element
    // even if it loses focus due to scrolling out of view.
  };

  const handleCursorUpdate = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    if (activeFieldRef.current && activeFieldRef.current.rowId === block.id) {
      activeFieldRef.current.selectionStart = (e.target as HTMLTextAreaElement).selectionStart;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: 'source' | 'target') => {
    // Custom navigation logic
    if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault();
      onNavigate('next', index, field);
    } else if (e.key === 'Home' || e.key === 'End') {
      // Prevent default cursor movement in textarea so that the global handler can scroll the page
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (e.shiftKey) return; // Allow text selection with Shift + Arrow keys
      
      const textarea = e.currentTarget as HTMLTextAreaElement;
      // If there's an active selection, arrow keys should collapse it first, not jump rows
      if (textarea.selectionStart !== textarea.selectionEnd) return;

      const startSelection = textarea.selectionStart;
      
      // We allow the native event to happen first to see if cursor moves
      // We use setTimeout to check the state AFTER the event has processed
      setTimeout(() => {
        const endSelection = textarea.selectionStart;
        
        if (startSelection === endSelection) {
          if (e.key === 'ArrowUp') {
             onNavigate('up', index, field);
          } else {
             onNavigate('down', index, field);
          }
        }
      }, 0);
    }
  };

  const isOrphan = block.orphan;

  return (
    <div className={`flex w-full border-b border-gray-200 transition-colors ${isOrphan ? 'bg-amber-50/40' : 'hover:bg-gray-50'}`}>
      {/* Left Pane: Read-only Original */}
      <div className="w-1/2 border-r border-gray-200 p-4 bg-gray-50 select-text">
        <div className="font-mono text-xs text-blue-600 mb-1 select-none opacity-70">
          {block.id || block.sourcePrefix}
        </div>
        
        {/* Original Source - Read Only Box */}
        <div className="mb-2 border border-gray-200 rounded-md shadow-sm bg-gray-50 p-0 overflow-hidden relative">
           <TextAreaOverlay
              value={block.originalSourceText}
              onChange={() => {}}
              isEditable={false}
              enableHalfWidthHighlight={enableHalfWidthHighlight}
              enableSpaceHighlight={enableSpaceHighlight}
              enableFuzzyMatch={enableFuzzyMatch}
              enableDictionaryHints={enableDictionaryHints}
              targetText={block.targetText}
              dictionary={dictionary}
              searchQuery={searchQuery}
              isSearchPanelVisible={isSearchPanelVisible}
              className="min-h-[2.5em] cursor-default"
              onFocus={() => handleFocus('readonly')}
              inputRef={undefined} // No ref needed for readonly
              {...{ tabIndex: -1 }} // Prevent TAB focus
            />
        </div>

        {/* Original Target - Read Only Box */}
        <div className="border border-gray-200 rounded-md shadow-sm bg-gray-50 p-0 overflow-hidden relative">
           <TextAreaOverlay
              value={block.originalTargetText}
              onChange={() => {}}
              isEditable={false}
              enableHalfWidthHighlight={enableHalfWidthHighlight}
              enableSpaceHighlight={enableSpaceHighlight}
              enableFuzzyMatch={enableFuzzyMatch}
              dictionary={dictionary}
              searchQuery={searchQuery}
              isSearchPanelVisible={isSearchPanelVisible}
              className="min-h-[2.5em] cursor-default"
              onFocus={() => handleFocus('readonly')}
              inputRef={undefined}
              {...{ tabIndex: -1 }}
            />
        </div>
      </div>

      {/* Right Pane: Editable */}
      <div className="w-1/2 p-4">
        <div className="font-mono text-xs text-blue-600 mb-1 select-none opacity-70">
          {block.targetPrefix}
        </div>
        
        {/* Source Line */}
        {(() => {
          const isBoxHighlighted = isSearchPanelVisible && activeMatchField === 'sourceText';
          return (
            <div 
              data-active-match={isBoxHighlighted}
              className={`mb-2 border rounded-md shadow-sm overflow-hidden relative transition-colors duration-200 ${
                isOrphan
                  ? 'bg-amber-50 border-amber-200'
                  : isBoxHighlighted 
                    ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50' 
                    : enableSourceEdit 
                      ? 'bg-white border-gray-300 focus-within:ring-2 focus-within:ring-blue-500' 
                      : 'bg-gray-50 border-gray-200'
              }`}
            >
                <TextAreaOverlay
                  value={block.sourceText}
                  onChange={(val, sel, isComposing) => {
                    if (isOrphan) return;
                    if (activeFieldRef.current && activeFieldRef.current.rowId === block.id) {
                      activeFieldRef.current.selectionStart = sel;
                    }
                    onUpdate(index, 'sourceText', val, sel, isComposing);
                  }}
                  isEditable={enableSourceEdit && !isOrphan}
                  enableHalfWidthHighlight={enableHalfWidthHighlight}
                  enableSpaceHighlight={enableSpaceHighlight}
                  enableFuzzyMatch={enableFuzzyMatch}
                  enableDictionaryHints={enableDictionaryHints}
                  targetText={block.targetText}
                  dictionary={dictionary}
                  searchQuery={searchQuery}
                  isSearchPanelVisible={isSearchPanelVisible}
                  onKeyDown={(e) => handleKeyDown(e, 'source')}
                  onFocus={() => handleFocus(isOrphan ? 'readonly' : 'sourceText')}
                  onBlur={handleBlur}
                  onSelect={handleCursorUpdate}
                  onClick={handleCursorUpdate}
                  onKeyUp={handleCursorUpdate}
                  inputRef={(el) => registerRef(index, 'source', el)}
                  data-index={index}
                  data-field="sourceText"
                  data-row-id={block.id}
                  className={`min-h-[2.5em] ${(!enableSourceEdit || isOrphan) ? 'cursor-default opacity-80' : ''}`}
                  {...{ tabIndex: enableSourceEdit && !isOrphan ? 0 : -1 }}
                />
            </div>
          );
        })()}

        {/* Target Line */}
        {(() => {
          const isBoxHighlighted = isSearchPanelVisible && activeMatchField === 'targetText';
          return (
            <div 
              data-active-match={isBoxHighlighted}
              className={`border rounded-md shadow-sm overflow-hidden relative transition-colors duration-200 ${
                isBoxHighlighted 
                  ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50' 
                  : 'bg-white border-gray-300 focus-within:ring-2 focus-within:ring-blue-500'
              }`}
            >
              <TextAreaOverlay
                value={block.targetText}
                onChange={(val, sel, isComposing) => {
                  if (activeFieldRef.current && activeFieldRef.current.rowId === block.id) {
                    activeFieldRef.current.selectionStart = sel;
                  }
                  onUpdate(index, 'targetText', val, sel, isComposing);
                }}
                isEditable={true}
                enableHalfWidthHighlight={enableHalfWidthHighlight}
                enableSpaceHighlight={enableSpaceHighlight}
                enableFuzzyMatch={enableFuzzyMatch}
                dictionary={dictionary}
                searchQuery={searchQuery}
                isSearchPanelVisible={isSearchPanelVisible}
                onKeyDown={(e) => handleKeyDown(e, 'target')}
                onFocus={() => handleFocus('targetText')}
                onBlur={handleBlur}
                onSelect={handleCursorUpdate}
                onClick={handleCursorUpdate}
                onKeyUp={handleCursorUpdate}
                inputRef={(el) => registerRef(index, 'target', el)}
                data-index={index}
                data-field="targetText"
                data-row-id={block.id}
                data-translation-index={index + 1}
                className="min-h-[2.5em]"
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
});
