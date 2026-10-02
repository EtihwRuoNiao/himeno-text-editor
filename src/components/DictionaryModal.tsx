import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Upload, Download, Trash2, Search, Edit2, Check, AlertCircle, ChevronDown } from 'lucide-react';
import { DictionaryEntry, AppSettings, DictionaryCategory, DictionaryConfig } from '../types';
import { TableVirtuoso } from 'react-virtuoso';
import { dictionaryService } from '../services/dictionaryService';
import { useTranslation } from '../contexts/AppContext';

interface DictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  showConfirmModal: (state: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'primary' | 'warning';
    confirmLabel?: string;
    cancelLabel?: string;
  }) => void;
  saveFileToDirectory?: (fileName: string, content: string) => Promise<boolean>;
  directoryName?: string;
  isConfirmModalOpen?: boolean;
}

export const DictionaryModal = React.memo<DictionaryModalProps>(({ 
  isOpen, 
  onClose,
  settings,
  updateSettings,
  showConfirmModal,
  saveFileToDirectory,
  directoryName,
  isConfirmModalOpen = false,
}) => {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<DictionaryConfig[]>([]);
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<DictionaryCategory>('person');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingConfigId, setRenamingConfigId] = useState<string | null>(null);
  const [isAddingConfig, setIsAddingConfig] = useState(false);
  const [newConfigName, setNewConfigName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isConfigMenuOpen, setIsConfigMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeAction, setSwipeAction] = useState<'select' | 'deselect' | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'new_config'>('merge');
  const [newEntryIds, setNewEntryIds] = useState<Set<string>>(new Set());
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<Map<string, { source: string; target: string; note: string }>>(new Map());

  const activeConfigId = settings.activeDictionaryId || 'default';

  useEffect(() => {
    if (isOpen) {
      loadConfigs();
      loadDictionary(activeConfigId);
    }
  }, [isOpen, activeConfigId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { if (isOpen) setActiveTab('person'); }, [isOpen]);

  useEffect(() => {
    if (editingId) {
      sourceRef.current?.focus();
    }
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    const draft = draftRef.current.get(editingId);
    if (draft) {
      if (sourceRef.current && sourceRef.current.value !== draft.source) sourceRef.current.value = draft.source;
      if (targetRef.current && targetRef.current.value !== draft.target) targetRef.current.value = draft.target;
      if (noteRef.current && noteRef.current.value !== draft.note) noteRef.current.value = draft.note;
    }
    if (!document.activeElement || document.activeElement === document.body) {
      sourceRef.current?.focus();
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If confirm modal is open, it has higher priority
        if (isConfirmModalOpen) return;

        if (isConfigMenuOpen) {
          setIsConfigMenuOpen(false);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (isExportMenuOpen) {
          setIsExportMenuOpen(false);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        // If no popover is open, close the modal itself
        onClose();
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown, { capture: true });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen, isConfigMenuOpen, isExportMenuOpen, isConfirmModalOpen, onClose]);

  const loadConfigs = async () => {
    const data = await dictionaryService.getConfigs();
    const sanitizedData = data.map(c => ({ ...c, enabled: c.enabled ?? true, name: c.name, id: c.id }));
    setConfigs(sanitizedData);
  };

  const loadDictionary = async (configId: string) => {
    const data = await dictionaryService.getDictionary(configId);
    setEntries(data);
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  };

  const updateConfig = async (id: string, updates: Partial<Omit<DictionaryConfig, 'id'>>) => {
    const allConfigs = await dictionaryService.getConfigs();
    const updatedConfigs = allConfigs.map(c => 
      c.id === id ? { ...c, ...updates } : c
    );
    await dictionaryService.saveConfigs(updatedConfigs);
  };

  const handleStartAddConfig = () => {
    setIsAddingConfig(true);
    setNewConfigName('');
    setIsConfigMenuOpen(false);
    setRenamingConfigId(null);
  };

  const handleCancelAddConfig = () => {
    setIsAddingConfig(false);
    setNewConfigName('');
  };

  const handleConfirmAddConfig = async () => {
    exitEditingMode();
    if (!newConfigName.trim()) {
      handleCancelAddConfig();
      return;
    }
    if (configs.some(c => c.name === newConfigName.trim())) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: t('config_name_exists'), variant: 'alarm' } }));
      return;
    }

    const newConfig = await dictionaryService.addConfig(newConfigName.trim());
    await loadConfigs();
    updateSettings({ 
      activeDictionaryId: newConfig.id,
      enableFuzzyMatch: newConfig.enableFuzzyMatch ?? true
    });
    handleCancelAddConfig();
    window.dispatchEvent(new CustomEvent('app-toast', { detail: t('config_added') }));
  };

  const handleDeleteConfig = async (id: string) => {
    if (configs.length <= 1) return;
    const configToDelete = configs.find(c => c.id === id);
    if (!configToDelete) return;

    showConfirmModal({
        isOpen: true,
        title: t('delete_config'),
        message: t('confirm_delete_config_message', { name: configToDelete.name }),
        variant: 'danger',
        onConfirm: async () => {
            exitEditingMode();
            await dictionaryService.deleteConfig(id);
            const remaining = configs.filter(c => c.id !== id);
            setConfigs(remaining);
            // If we deleted the active config, switch to another one
            if (settings.activeDictionaryId === id) {
                const nextConfig = remaining[0];
                updateSettings({ 
                  activeDictionaryId: nextConfig?.id || 'default',
                  enableFuzzyMatch: nextConfig?.enableFuzzyMatch ?? true
                });
            } else {
                // otherwise just reload the list of configs
                loadConfigs();
            }
            window.dispatchEvent(new CustomEvent('app-toast', { detail: t('config_deleted') }));
        }
    });
  };

  const handleClearDictionary = async () => {
    showConfirmModal({
      isOpen: true,
      title: t('clear_dictionary'),
      message: t('confirm_clear_dictionary'),
      variant: 'danger',
      onConfirm: async () => {
        exitEditingMode();
        await dictionaryService.saveDictionary('default', []);
        await loadDictionary('default');
        window.dispatchEvent(new CustomEvent('app-toast', { detail: t('dictionary_cleared') }));
      }
    });
  };

  const handleStartRename = (config: DictionaryConfig) => {
    setRenamingConfigId(config.id);
    setRenameValue(config.name);
    setIsConfigMenuOpen(false);
    setIsAddingConfig(false);
  };

  const handleCancelRename = () => {
    setRenamingConfigId(null);
    setRenameValue('');
  };

  const handleConfirmRename = async () => {
    if (!renamingConfigId || !renameValue.trim()) {
      handleCancelRename();
      return;
    }

    if (configs.some(c => c.name === renameValue.trim() && c.id !== renamingConfigId)) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: t('config_name_exists'), variant: 'alarm' } }));
      return;
    }

    await updateConfig(renamingConfigId, { name: renameValue.trim() });
    handleCancelRename();
    loadConfigs();
    window.dispatchEvent(new CustomEvent('app-toast', { detail: t('config_renamed') }));
  };

  const handleToggleConfigEnabled = async (config: DictionaryConfig) => {
    const newEnabledState = !config.enabled;
    setConfigs(configs.map(c => c.id === config.id ? { ...c, enabled: newEnabledState } : c));
    await updateConfig(config.id, { enabled: newEnabledState });
  };

  const handleAddEntry = () => {
    const newEntry: DictionaryEntry = {
      id: crypto.randomUUID(),
      source: '',
      target: '',
      category: activeTab,
      note: ''
    };
    setEntries([newEntry, ...entries]);
    setEditingId(newEntry.id);
    setNewEntryIds(prev => new Set(prev).add(newEntry.id));
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  };

  const handleSaveEntry = async (id: string) => {
    const source = sourceRef.current?.value ?? '';
    const target = targetRef.current?.value ?? '';
    const note = noteRef.current?.value ?? '';
    if (!source.trim() || !target.trim()) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: t('entry_fill_required_fields'), variant: 'alarm' } }));
      return;
    }
    if (source.length > 500 || target.length > 500) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: '源文或译文过长（最多 500 字符）', variant: 'alarm' } }));
      return;
    }
    const duplicate = entries.find(e =>
      e.source.toLowerCase() === source.trim().toLowerCase() &&
      e.category === activeTab &&
      e.id !== id
    );
    if (duplicate) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: '该分类下已存在相同的源文', variant: 'alarm' } }));
      return;
    }

    const isNew = newEntryIds.has(id);

    const updatedEntries = entries.map(e => e.id === id ? { ...e, source: source.trim(), target: target.trim(), note: note.trim() } as DictionaryEntry : e);
    setEntries(updatedEntries);
    await dictionaryService.saveDictionary(activeConfigId, updatedEntries);
    draftRef.current.delete(id);
    setEditingId(null);
    if (isNew) setNewEntryIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: isNew ? t('entry_add_success') : t('entry_save_success')} }));
  };

  const exitEditingMode = () => {
    if (!editingId) return;
    draftRef.current.delete(editingId);
    if (newEntryIds.has(editingId)) {
      setEntries(prev => prev.filter(e => e.id !== editingId));
      setNewEntryIds(prev => { const next = new Set(prev); next.delete(editingId); return next; });
    }
    setEditingId(null);
  };

  const handleDeleteEntry = (entry: DictionaryEntry) => {
    const isEditingExisting = editingId === entry.id && !newEntryIds.has(entry.id);
    const isNewAndEmpty = newEntryIds.has(entry.id) || (!entry.source && !entry.target && editingId === entry.id);

    showConfirmModal({
      isOpen: true,
      title: isEditingExisting ? t('discard_changes_title') : (isNewAndEmpty ? t('discard_new_entry_title') : t('delete_entry_title')),
      message: isEditingExisting ? t('discard_changes_message', { source: entry.source }) : (isNewAndEmpty ? t('discard_new_entry_message') : t('delete_entry_message', { source: entry.source })),
      variant: 'danger',
      onConfirm: async () => {
        if (isEditingExisting) {
          setEditingId(null);
          draftRef.current.delete(entry.id);
          window.dispatchEvent(new CustomEvent('app-toast', { detail: t('changes_discarded') }));
        } else {
          const updatedEntries = entries.filter(e => e.id !== entry.id);
          setEntries(updatedEntries);
          await dictionaryService.saveDictionary(activeConfigId, updatedEntries);
          setNewEntryIds(prev => { const next = new Set(prev); next.delete(entry.id); return next; });
          setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(entry.id);
            return next;
          });
          if (editingId === entry.id) {
            setEditingId(null);
            draftRef.current.delete(entry.id);
          }
          window.dispatchEvent(new CustomEvent('app-toast', { detail: t('entry_deleted') }));
        }
      },
    });
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    exitEditingMode();
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const format = file.name.endsWith('.csv') ? 'csv' : 'txt';
      const newEntries = dictionaryService.parseDictionaryFile(content, format);

      if (newEntries.length === 0) {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: t('import_error'), variant: 'alarm' } }));
        return;
      }

      if (importMode === 'merge') {
        const { entries: merged, added, updated } = dictionaryService.upsertEntries(entries, newEntries);
        setEntries(merged);
        await dictionaryService.saveDictionary(activeConfigId, merged);
        
        window.dispatchEvent(new CustomEvent('app-toast', { 
          detail: t('import_success_detailed', { added: added.toString(), updated: updated.toString() }) 
        }));
      } else { // 'new_config'
        const configName = file.name.replace(/\.(csv|txt)$/i, '');
        const allConfigs = await dictionaryService.getConfigs();
        const existingConfig = allConfigs.find(c => c.name.toLowerCase() === configName.toLowerCase());

        if (existingConfig) {
          // Merge into existing config
          const existingEntries = await dictionaryService.getDictionary(existingConfig.id);
          const { entries: merged, added, updated } = dictionaryService.upsertEntries(existingEntries, newEntries);
          await dictionaryService.saveDictionary(existingConfig.id, merged);
          
          if (activeConfigId !== existingConfig.id) {
              updateSettings({ 
                activeDictionaryId: existingConfig.id,
                enableFuzzyMatch: existingConfig.enableFuzzyMatch ?? true
              });
          } else {
              setEntries(merged);
          }

          window.dispatchEvent(new CustomEvent('app-toast', { 
              detail: t('import_merged_success', { added: added.toString(), updated: updated.toString(), configName: existingConfig.name }) 
          }));
        } else {
          // Create new config
          const newConfig = await dictionaryService.addConfig(configName);
          await dictionaryService.saveDictionary(newConfig.id, newEntries);
          
          await loadConfigs(); // Reload configs to include the new one
          updateSettings({ 
            activeDictionaryId: newConfig.id,
            enableFuzzyMatch: newConfig.enableFuzzyMatch ?? true
          });
          
          window.dispatchEvent(new CustomEvent('app-toast', { 
              detail: t('import_new_config_success', { count: newEntries.length.toString(), configName: newConfig.name }) 
          }));
        }
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: t('import_error'), variant: 'alarm' } }));
    } finally {
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  const handleExport = async (format: 'csv' | 'txt') => {
    const content = format === 'csv' ? dictionaryService.exportToCSV(entries) : dictionaryService.exportToTXT(entries);
    const configName = configs.find(c => c.id === activeConfigId)?.name || 'dictionary';
    const fileName = `${configName}.${format}`;

    let success = false;
    if (saveFileToDirectory) {
      try {
        success = await saveFileToDirectory(fileName, content);
      } catch (err) {
        console.error("Failed to save directly:", err);
        success = false;
      }
    }

    if (!success) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: t('export_success') }));
    } else {
      window.dispatchEvent(new CustomEvent('app-toast', { 
        detail: t('export_to_folder_success', { folder: directoryName || 'current folder' }) 
      }));
    }
  };

  // Selection Logic
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => e.category === activeTab).filter(e => 
      e.source.toLowerCase().includes(debouncedSearch.toLowerCase()) || 
      e.target.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      e.note?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
    if (editingId && debouncedSearch.trim() !== '') {
      const editingEntry = entries.find(e => e.id === editingId && e.category === activeTab);
      if (editingEntry) {
        const matchesSearch =
          editingEntry.source.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          editingEntry.target.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          editingEntry.note?.toLowerCase().includes(debouncedSearch.toLowerCase());
        if (!matchesSearch) {
          result.unshift(editingEntry);
        }
      }
    }
    return result;
  }, [entries, activeTab, debouncedSearch, editingId]);

  const clearSelectionIfOutsideTable = (e: React.MouseEvent, skipIfEditing?: boolean) => {
    if (skipIfEditing && (renamingConfigId || isAddingConfig)) return;
    if ((e.target as HTMLElement).closest('table')) return;
    if ((e.target as HTMLElement).closest('.batch-action-bar')) return;
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
    }
  };

  const handleCheckboxMouseDown = (id: string, index: number) => {
    const isSelected = selectedIds.has(id);
    const action = isSelected ? 'deselect' : 'select';
    setSwipeAction(action);
    setIsSwiping(true);
    
    const newSelected = new Set(selectedIds);
    if (action === 'select') newSelected.add(id);
    else newSelected.delete(id);
    
    setSelectedIds(newSelected);
    setLastSelectedIndex(index);
  };

  const handleCheckboxMouseEnter = (id: string, index: number) => {
    if (!isSwiping || !swipeAction) return;
    
    const newSelected = new Set(selectedIds);
    if (swipeAction === 'select') newSelected.add(id);
    else newSelected.delete(id);
    
    setSelectedIds(newSelected);
    setLastSelectedIndex(index);
  };

  useEffect(() => {
    const handleMouseUp = () => {
      setIsSwiping(false);
      setSwipeAction(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleBatchMove = async (newCat: DictionaryCategory) => {
    const updatedEntries = entries.map(e => 
      selectedIds.has(e.id) ? { ...e, category: newCat } : e
    );
    setEntries(updatedEntries);
    await dictionaryService.saveDictionary(activeConfigId, updatedEntries);
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    showConfirmModal({
        isOpen: true,
        title: t('batch_delete_title'),
        message: t('batch_delete_message', { count: selectedIds.size.toString() }),
        variant: 'danger',
        onConfirm: async () => {
            const updatedEntries = entries.filter(e => !selectedIds.has(e.id));
            setEntries(updatedEntries);
            await dictionaryService.saveDictionary(activeConfigId, updatedEntries);
            setNewEntryIds(prev => { const next = new Set(prev); selectedIds.forEach(id => next.delete(id)); return next; });
            setSelectedIds(new Set());
            setLastSelectedIndex(null);
            window.dispatchEvent(new CustomEvent('app-toast', { detail: t('entries_deleted') }));
        }
    });
  };

  const categories: { id: DictionaryCategory; label: string }[] = [
    { id: 'person', label: t('cat_person') },
    { id: 'location', label: t('cat_location') },
    { id: 'term', label: t('cat_term') },
    { id: 'uncategorized', label: t('cat_uncategorized') },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => clearSelectionIfOutsideTable(e)}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-800">
                  <Globe className="w-5 h-5 text-blue-600" />
                  <h2 className="font-semibold text-lg">{t('dictionary_title')}</h2>
                </div>
                
                {/* Config Switcher */}
                <div className="relative">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsConfigMenuOpen(!isConfigMenuOpen); }}
                    className="flex items-center justify-between w-36 gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    <span className="truncate">
                      {(() => {
                        const config = configs.find(c => c.id === activeConfigId);
                        return config?.isDefault ? t('default_dictionary_name') : config?.name;
                      })()}
                    </span>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isConfigMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {isConfigMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsConfigMenuOpen(false)} />
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute left-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-2"
                        >
                          <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('config_management')}</div>
                          {configs.map(config => (
                            <div key={config.id} className="group flex items-center justify-between px-2 py-1 hover:bg-gray-50">
                              <button
                                onClick={() => { 
                                  updateSettings({ 
                                    activeDictionaryId: config.id,
                                    enableFuzzyMatch: config.enableFuzzyMatch ?? true
                                  }); 
                                  setIsConfigMenuOpen(false); 
                                }}
                                className={`flex-1 text-left px-2 py-1.5 text-sm rounded-lg ${config.id === activeConfigId ? 'text-blue-600 font-semibold bg-blue-50' : 'text-gray-700'}`}
                              >
                                {config.isDefault ? t('default_dictionary_name') : config.name}
                              </button>
                              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleStartRename(config); }}
                                  disabled={config.isDefault}
                                  className={`p-1.5 ${config.isDefault ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600'}`}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (config.isDefault) handleClearDictionary();
                                    else handleDeleteConfig(config.id); 
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-red-500"
                                  title={config.isDefault ? t('clear_dictionary') : t('delete_config')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                          <div className="h-px bg-gray-100 my-1" />
                          <button 
                            onClick={() => {
                              setImportMode('new_config');
                              setIsConfigMenuOpen(false);
                              importFileInputRef.current?.click();
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Upload className="w-4 h-4" />
                            <span>{t('import_config')}</span>
                          </button>
                          <button 
                            onClick={handleStartAddConfig}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            <span>{t('new_config')}</span>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {/* Enable/Disable Toggle */}
                {(() => {
                  const activeConfig = configs.find(c => c.id === activeConfigId);
                  if (!activeConfig) return null;
                  return (
                    <div className="flex items-center gap-2 pl-4">
                      <Switch
                        checked={activeConfig.enabled}
                        onChange={() => handleToggleConfigEnabled(activeConfig)}
                      />
                      <span className="text-sm font-medium text-gray-600 select-none">{t('toggle_dictionary')}</span>
                    </div>
                  );
                })()}

                <div className="h-6 w-px bg-gray-200" />

                <button
                  onClick={() => {
                    setImportMode('new_config');
                    importFileInputRef.current?.click();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t('import_config')}</span>
                </button>

                <button
                  onClick={handleStartAddConfig}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('new_config')}</span>
                </button>

                {(() => {
                  const activeConfig = configs.find(c => c.id === activeConfigId);
                  if (!activeConfig) return null;
                  return (
                    <>
                      <button
                        onClick={() => handleStartRename(activeConfig)}
                        disabled={activeConfig.isDefault}
                        className={`flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium transition-colors ${activeConfig.isDefault ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-50'}`}
                        title={activeConfig.isDefault ? undefined : t('rename_config')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => activeConfig.isDefault ? handleClearDictionary() : handleDeleteConfig(activeConfig.id)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                        title={activeConfig.isDefault ? t('clear_dictionary') : t('delete_config')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  );
                })()}
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(renamingConfigId || isAddingConfig) && (
              <div className="px-6 py-3 border-b border-gray-100 bg-blue-50 flex items-center justify-between animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  {isAddingConfig ? <Plus className="w-4 h-4 text-blue-600" /> : <Edit2 className="w-4 h-4 text-blue-600" />}
                  <span className="text-sm font-semibold text-blue-800">
                    {isAddingConfig ? t('new_config') : t('rename_config')}
                  </span>
                  <input
                    autoFocus
                    value={isAddingConfig ? newConfigName : renameValue}
                    onChange={e => isAddingConfig ? setNewConfigName(e.target.value) : setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') isAddingConfig ? handleConfirmAddConfig() : handleConfirmRename();
                      if (e.key === 'Escape') isAddingConfig ? handleCancelAddConfig() : handleCancelRename();
                    }}
                    placeholder={isAddingConfig ? t('config_name') : ''}
                    className="w-64 px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={isAddingConfig ? handleConfirmAddConfig : handleConfirmRename} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg"><Check className="w-4 h-4" /></button>
                  <button onClick={isAddingConfig ? handleCancelAddConfig : handleCancelRename} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            {/* Tabs & Toolbar */}
            <div className="flex flex-col bg-white border-b border-gray-100">
              <div className="flex items-center justify-between px-6 pt-2">
                <div className="flex gap-1">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setActiveTab(cat.id); setSelectedIds(new Set()); setLastSelectedIndex(null); }}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                        activeTab === cat.id 
                          ? 'border-blue-600 text-blue-600' 
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                
                {/* Fuzzy Match Checkbox */}
                <label className="flex items-center gap-2 cursor-pointer px-4" title={t('fuzzy_match_desc')}>
                  <input
                    type="checkbox"
                    checked={settings.enableFuzzyMatch ?? true}
                    onChange={(e) => {
                      const val = e.target.checked;
                      updateSettings({ enableFuzzyMatch: val });
                      if (activeConfigId) {
                        updateConfig(activeConfigId, { enableFuzzyMatch: val });
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600 select-none">{t('fuzzy_match')}</span>
                </label>
                
                <div className="flex items-center gap-3 pb-2">
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder={t('search_dictionary')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-8 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  
                  <button
                    onClick={handleAddEntry}
                    disabled={editingId !== null}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 ${editingId !== null ? 'bg-blue-400 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('add_entry')}</span>
                  </button>
                  
                  <div className="h-6 w-px bg-gray-200 mx-1" />
                  
                  <button
                    onClick={() => {
                      setImportMode('merge');
                      importFileInputRef.current?.click();
                    }}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 transition-all"
                    title={t('merge_update_current')}
                  >
                    <Upload className="w-5 h-5" />
                  </button>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsExportMenuOpen(!isExportMenuOpen); }}
                      className={`p-2 rounded-xl transition-all ${isExportMenuOpen ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
                      title={t('export_dictionary')}
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <AnimatePresence>
                      {isExportMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setIsExportMenuOpen(false)} />
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-30 py-1 min-w-[110px]"
                          >
                            <button 
                              onClick={() => { handleExport('csv'); setIsExportMenuOpen(false); }} 
                              className="w-full text-center px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                            >
                              {t('save_as_csv')}
                            </button>
                            <button 
                              onClick={() => { handleExport('txt'); setIsExportMenuOpen(false); }} 
                              className="w-full text-center px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                            >
                              {t('save_as_txt')}
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white z-10 shadow-sm border-b border-gray-100">
              <table className="w-full border-collapse table-fixed">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="pl-6 pr-4 py-3 w-[48px]">
                      <input 
                        type="checkbox" 
                        checked={filteredEntries.length > 0 && filteredEntries.every(e => selectedIds.has(e.id))}
                        disabled={editingId !== null}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set([...selectedIds, ...filteredEntries.map(e => e.id)]));
                          } else {
                            const next = new Set(selectedIds);
                            filteredEntries.forEach(e => next.delete(e.id));
                            setSelectedIds(next);
                          }
                        }}
                        className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${editingId !== null ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      />
                    </th>
                    <th className="px-4 py-3 w-[25%]">{t('source_text')}</th>
                    <th className="px-4 py-3 w-[25%]">{t('target_text')}</th>
                    <th className="px-4 py-3">{t('notes')}</th>
                    <th className="pr-6 pl-4 py-3 w-[100px] text-left">{t('actions')}</th>
                  </tr>
                </thead>
              </table>
            </div>

            <div className="flex-1 relative" onClick={(e) => clearSelectionIfOutsideTable(e, true)}>
                <TableVirtuoso
                  key={activeTab}
                  data={filteredEntries}
                  overscan={50}
                  style={{ height: '100%' }}
                  components={{
                    Table: ({ children, ...props }) => (
                      <table {...props} className="w-full border-separate border-spacing-0 table-fixed">
                        <colgroup>
                          <col className="w-[48px]" />
                          <col className="w-[25%]" />
                          <col className="w-[25%]" />
                          <col />
                          <col className="w-[100px]" />
                        </colgroup>
                        {children}
                      </table>
                    ),
                    TableBody: React.forwardRef<HTMLTableSectionElement, any>((props, ref) => (
                      <tbody {...props} ref={ref} className="divide-y divide-gray-50" />
                    )),
                    TableRow: (props) => {
                      const entry = props.item as DictionaryEntry;
                      return (
                        <tr 
                          {...props} 
                          className={`group transition-colors ${selectedIds.has(entry.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'}`}
                        />
                      );
                    }
                  }}
                  itemContent={(index, entry) => (
                    <>
                      <td className="pl-6 pr-4 py-3">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.has(entry.id)}
                          disabled={editingId !== null}
                          onMouseDown={() => handleCheckboxMouseDown(entry.id, index)}
                          onMouseEnter={() => handleCheckboxMouseEnter(entry.id, index)}
                          onChange={() => {}}
                          className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${editingId !== null ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {editingId === entry.id ? (
                          <input
                            ref={sourceRef}
                            key={entry.id}
                            className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                            defaultValue={draftRef.current.get(entry.id)?.source ?? entry.source}
                            onChange={e => {
                              const prev = draftRef.current.get(entry.id) ?? { source: entry.source, target: entry.target, note: entry.note };
                              draftRef.current.set(entry.id, { ...prev, source: e.target.value });
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                targetRef.current?.focus();
                                targetRef.current?.setSelectionRange(targetRef.current.value.length, targetRef.current.value.length);
                              } else if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault();
                                targetRef.current?.focus();
                                targetRef.current?.setSelectionRange(targetRef.current.value.length, targetRef.current.value.length);
                              } else if (e.key === 'Tab' && e.shiftKey) {
                                e.preventDefault();
                                noteRef.current?.focus();
                                noteRef.current?.setSelectionRange(noteRef.current.value.length, noteRef.current.value.length);
                              }
                            }}
                          />
                        ) : (
                          <span className="text-sm text-gray-700 font-medium">{entry.source}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === entry.id ? (
                          <input
                            ref={targetRef}
                            key={entry.id}
                            className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                            defaultValue={draftRef.current.get(entry.id)?.target ?? entry.target}
                            onChange={e => {
                              const prev = draftRef.current.get(entry.id) ?? { source: entry.source, target: entry.target, note: entry.note };
                              draftRef.current.set(entry.id, { ...prev, target: e.target.value });
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                noteRef.current?.focus();
                                noteRef.current?.setSelectionRange(noteRef.current.value.length, noteRef.current.value.length);
                              } else if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault();
                                noteRef.current?.focus();
                                noteRef.current?.setSelectionRange(noteRef.current.value.length, noteRef.current.value.length);
                              } else if (e.key === 'Tab' && e.shiftKey) {
                                e.preventDefault();
                                sourceRef.current?.focus();
                                sourceRef.current?.setSelectionRange(sourceRef.current.value.length, sourceRef.current.value.length);
                              }
                            }}
                          />
                        ) : (
                          <span className="text-sm text-gray-600">{entry.target}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === entry.id ? (
                          <input
                            ref={noteRef}
                            key={entry.id}
                            className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                            defaultValue={draftRef.current.get(entry.id)?.note ?? entry.note}
                            onChange={e => {
                              const prev = draftRef.current.get(entry.id) ?? { source: entry.source, target: entry.target, note: entry.note };
                              draftRef.current.set(entry.id, { ...prev, note: e.target.value });
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEntry(entry.id);
                              } else if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault();
                                sourceRef.current?.focus();
                                sourceRef.current?.setSelectionRange(sourceRef.current.value.length, sourceRef.current.value.length);
                              } else if (e.key === 'Tab' && e.shiftKey) {
                                e.preventDefault();
                                targetRef.current?.focus();
                                targetRef.current?.setSelectionRange(targetRef.current.value.length, targetRef.current.value.length);
                              }
                            }}
                          />
                        ) : (
                          <span className="text-xs text-gray-400 italic">{entry.note}</span>
                        )}
                      </td>
                      <td className="pr-6 pl-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {editingId === entry.id ? (
                            <button
                              onClick={() => handleSaveEntry(entry.id)}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => { setSelectedIds(new Set()); setLastSelectedIndex(null); setEditingId(entry.id); }}
                              disabled={editingId !== null}
                              className={`p-1.5 rounded-lg transition-colors ${editingId !== null ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100'}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteEntry(entry)}
                            disabled={editingId !== null && editingId !== entry.id}
                            className={`p-1.5 rounded-lg transition-colors ${editingId !== null && editingId !== entry.id ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100'}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                />
              
              {filteredEntries.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                  <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm">{t('no_entries')}</p>
                </div>
              )}
            </div>

            {/* Batch Action Bar */}
            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="batch-action-bar absolute bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 z-50 w-[80%]"
                >
                  <div className="flex items-center gap-3 border-r border-gray-700 pr-6">
                    <span className="text-sm font-medium">{t('selected_count', { count: selectedIds.size.toString() })}</span>
                    <button 
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      {t('cancel_selection')}
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-1 overflow-hidden">
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-bold whitespace-nowrap">{t('move_to')}</span>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {categories.filter(c => c.id !== activeTab).map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => handleBatchMove(cat.id)}
                          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium transition-colors border border-gray-700 whitespace-nowrap"
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="h-6 w-px bg-gray-700" />
                  
                  <button
                    onClick={handleBatchDelete}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-200 rounded-lg text-xs font-medium transition-colors border border-red-800/50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('batch_delete')}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <span className="text-xs text-gray-400 font-medium">
                  {t('dict_stats', { current: entries.filter(e => e.category === activeTab).length.toString(), total: entries.length.toString() })}
                </span>                
              </div>

              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                {t('done')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

const Switch: React.FC<{ checked: boolean; onChange: (val: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
      checked ? 'bg-blue-600' : 'bg-gray-200'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

// Helper icon for header
const Globe = ({ className }: { className?: string }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);
