import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../contexts/AppContext';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  tertiaryLabel?: string;
  onTertiary?: () => void;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  tertiaryLabel,
  onTertiary,
}: ConfirmModalProps) {
  const { t } = useTranslation();

  const handleConfirm = () => {
    try {
      onConfirm();
    } catch (err) {
      console.error('[confirm] onConfirm failed:', err);
    } finally {
      onClose();
    }
  };

  const handleTertiary = () => {
    try {
      onTertiary?.();
    } catch (err) {
      console.error('[confirm] onTertiary failed:', err);
    } finally {
      onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown, { capture: true });
    }
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, onClose]);

  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500',
    danger: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
    warning: 'bg-yellow-500 hover:bg-yellow-600 focus-visible:ring-yellow-400 text-black',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={onClose}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          
          <div 
            className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none p-4"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-lg shadow-xl w-full max-w-md relative pointer-events-auto"
            >
              <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                  <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{message}</p>
              </div>

              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-lg">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium bg-white text-gray-700 border border-gray-300 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">{cancelLabel || t('cancel')}</button>
                {tertiaryLabel && onTertiary && (
                  <button type="button" onClick={handleTertiary} className="px-4 py-2 rounded-md text-sm font-medium bg-white text-red-600 border border-red-300 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">{tertiaryLabel}</button>
                )}
                <button type="button" onClick={handleConfirm} className={`px-4 py-2 rounded-md text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantClasses[variant]}`}>{confirmLabel || t('confirm')}</button>
              </div>
              
              <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-500 rounded-full p-1 hover:bg-gray-100" aria-label={t('close')}><X size={20} /></button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}