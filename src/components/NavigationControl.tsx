import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../contexts/AppContext';


interface NavigationControlProps {
  currentBlocksLength: number;
  lastFocusedIndex: number;
  onJump: (index: number, behavior?: ScrollBehavior, isDragging?: boolean) => void;
  onIndexChange: (index: number) => void;
}

export const NavigationControl: React.FC<NavigationControlProps> = ({
  currentBlocksLength,
  lastFocusedIndex,
  onJump,
  onIndexChange,
}) => {
  const { t } = useTranslation();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [inputValue, setInputValue] = useState<string>(lastFocusedIndex.toString());
  const sliderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(lastFocusedIndex.toString());
  }, [lastFocusedIndex]);

  const handleSliderMouseMove = (e: React.MouseEvent<HTMLInputElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percentage = x / rect.width;
    const value = Math.max(1, Math.min(currentBlocksLength, Math.round(percentage * (currentBlocksLength - 1) + 1)));
    
    setHoveredIndex(value);
    setHoverPos({ x: e.clientX, y: rect.top - 35 });
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    onIndexChange(val);
  };

  const handleSliderPointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    onJump(parseInt(e.currentTarget.value, 10), 'auto', false);
  };

  return (
    <>
      {hoveredIndex !== null && (
        <div 
          className="fixed z-50 px-2 py-1 bg-gray-900 text-white text-xs font-bold rounded shadow-lg pointer-events-none transform -translate-x-1/2 transition-opacity duration-150"
          style={{ left: hoverPos.x, top: hoverPos.y }}
        >
          {hoveredIndex}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
      
      <div 
        id="floating-progress-bar"
        className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white border border-gray-300 shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="flex items-center gap-3">
          <input 
            ref={sliderRef}
            type="range" 
            min={1} 
            max={currentBlocksLength} 
            value={lastFocusedIndex}
            onChange={handleSliderChange}
            onPointerUp={handleSliderPointerUp}
            onMouseMove={handleSliderMouseMove}
            onMouseLeave={() => setHoveredIndex(null)}
            className="w-48 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
        
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
          <input
            type="number"
            min={1}
            max={currentBlocksLength}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= currentBlocksLength) {
                onJump(val, 'auto');
              } else {
                setInputValue(lastFocusedIndex.toString());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = parseInt((e.target as HTMLInputElement).value, 10);
                if (!isNaN(val) && val >= 1 && val <= currentBlocksLength) {
                  onJump(val, 'auto');
                } else {
                  setInputValue(lastFocusedIndex.toString());
                }
              }
            }}
            className="w-12 bg-transparent border border-gray-300 p-0 text-center focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-gray-400">/</span>
          <span>{currentBlocksLength}</span>
          <button 
            className="ml-1 text-xs text-blue-500 hover:text-blue-700"
            onClick={() => {
              const val = parseInt(inputValue, 10);
              if (!isNaN(val) && val >= 1 && val <= currentBlocksLength) {
                onJump(val, 'auto');
              }
            }}
          >
            {t('jump_to')}
          </button>
        </div>
      </div>
    </>
  );
};
