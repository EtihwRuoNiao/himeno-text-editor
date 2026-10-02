import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings, Globe, Edit3, Type, Space, BookOpen, ChevronRight, ChevronDown, Monitor, Power, Plus, Trash2, Code, Info } from 'lucide-react';
import { AppSettings, ParserProfile } from '../types';
import { useTranslation } from '../contexts/AppContext';
import { defaultProfile } from '../utils/parser';
import { translations } from '../i18n/translations';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { useSystemFonts } from '../hooks/useSystemFonts';
import { AboutPanel } from './AboutPanel';
import { useAssistants } from '../hooks/useAssistants';
import { pickQuote } from '../services/assetService';
import { applyAppIcon, type AppIconStatus } from '../services/appIconService';
import type { AssistantAsset } from '../types/assistant';
import { openPath } from '@tauri-apps/plugin-opener';

// Safe wrapper for Tauri window API
const getAppWindow = () => {
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      return getCurrentWindow();
    }
  } catch (e) {
    console.warn('Tauri API not available', e);
  }
  return null;
};

const appWindow = getAppWindow();

const MAX_PARTNER_SLOTS = 3;

interface FontDropdownProps {
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

// 字体下拉：Portal + fixed 定位——可越出设置弹窗范围，且始终钳制在程序窗体内；恒定高度内部滚动
const FontDropdown: React.FC<FontDropdownProps> = ({ value, onChange, open, onToggle, onClose }) => {
  const { t } = useTranslation();
  const systemFonts = useSystemFonts();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({ left: 0, width: 0, maxHeight: 320 });

  // 打开时计算 fixed 坐标：默认向下展开；下方空间不足则向上翻转；均钳制于程序视口内
  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const SPACE_NEEDED = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < SPACE_NEEDED && rect.top > SPACE_NEEDED;
    const maxHeight = Math.max(180, Math.min(320, (flip ? rect.top : spaceBelow) - 12));
    setStyle({
      top: flip ? undefined : rect.bottom + 4,
      bottom: flip ? window.innerHeight - rect.top + 4 : undefined,
      left: Math.max(4, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      maxHeight,
    });
  }, [open]);

  // 窗口尺寸变化 → 关闭（点击外部的关闭由 SettingsModal 统一裁决器处理）
  useEffect(() => {
    if (!open) return;
    const handleResize = () => onClose();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open, onClose]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-font-trigger
        onClick={onToggle}
        className="w-full px-2 py-1 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between gap-2"
      >
        <span className="truncate" style={{ fontFamily: value || undefined }}>{value || t('default_font')}</span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          data-font-panel
          style={style}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed overflow-y-auto scrollbar-thin bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[300]"
        >
          <button
            type="button"
            onClick={() => { onChange(''); onClose(); }}
            className={`w-full px-3 py-1.5 text-sm text-left transition-colors ${value === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}
          >
            {t('default_font')}
          </button>
          {systemFonts.map(f => (
            <button
              type="button"
              key={f}
              onClick={() => { onChange(f); onClose(); }}
              style={{ fontFamily: f }}
              title={f}
              className={`w-full px-3 py-1.5 text-sm text-left truncate transition-colors ${value === f ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}
            >
              {f}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDictionary: () => void;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  showConfirmModal: (state: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'primary' | 'warning';
    confirmLabel?: string;
    cancelLabel?: string;
  }) => void;
  isConfirmModalOpen?: boolean;
  onQuit?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenDictionary,
  settings,
  updateSettings,
  showConfirmModal,
  isConfirmModalOpen = false,
  onQuit,
}) => {
  const { t } = useTranslation();
  const [isPartnerSettingOpen, setIsPartnerSettingOpen] = useState(false);
  const [isWindowSettingOpen, setIsWindowSettingOpen] = useState(false);
  const [isFontSettingOpen, setIsFontSettingOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [uiFontListOpen, setUiFontListOpen] = useState(false);
  const [wsFontListOpen, setWsFontListOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string>(settings.activeParserProfileId || 'default');
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const partnerSettingRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const windowSettingRef = useRef<HTMLDivElement>(null);
  const fontSettingRef = useRef<HTMLDivElement>(null);
  const settingsRootRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const systemFonts = useSystemFonts();

  // 助手资源：面板打开时扫描 <exe>/assets/assistants，关闭时回收头像 objectURL
  const {
    assistants, avatarUrls, status: assetStatus, root: assetRoot,
    error: assetError, loading: assetsLoading, refresh: refreshAssistants,
  } = useAssistants(isOpen);

  // 程序图标：打开"窗口设置"时实际应用一次，并把真实结果（含失败原因）显示出来
  const [iconStatus, setIconStatus] = useState<AppIconStatus | null>(null);
  useEffect(() => {
    if (!isWindowSettingOpen) return;
    let disposed = false;
    void applyAppIcon(settings.customIconDisabled ?? false).then(st => {
      if (!disposed) setIconStatus(st);
    });
    return () => { disposed = true; };
  }, [isWindowSettingOpen, settings.customIconDisabled]);

  // 图标状态文案：过长时单行省略（悬浮显示全文），避免换行把容器撑高
  const iconStatusText = assetStatus === 'unsupported'
    ? t('assets_desktop_only')
    : iconStatus?.error
      ? `${t('assets_error')}: ${iconStatus.error}`
      : iconStatus?.mode === 'custom'
        ? t('icon_custom_active', { name: iconStatus.fileName ?? '' })
        : t('icon_custom_missing');

  const assistantLabel = (a: AssistantAsset) => (a.builtin ? t('default_assistant') : a.displayName);

  // 台词优先取磁盘上的 quotes.*.txt，回退到内置翻译键
  const assistantQuote = (a: AssistantAsset): string | null => {
    const fromAsset = pickQuote(a, settings.language);
    if (fromAsset) return fromAsset;
    const allKeys = Object.keys(translations[settings.language] || translations['en-US']);
    const quoteKeys = allKeys.filter(key => key.startsWith(`${a.id}_quote_`));
    if (!quoteKeys.length) return null;
    return t(quoteKeys[Math.floor(Math.random() * quoteKeys.length)] as any);
  };

  // 字体层（popover/下拉列表）的统一外部点击裁决：
  // - 点击字体下拉面板内：交给面板自身（选项选择 / 空白区域点击关闭列表）
  // - 点击字体下拉触发按钮：交给按钮自身 onToggle（互斥开合）
  // - 点击 popover 内其它空白：仅关闭已打开的列表层（逐层第一层）
  // - 点击 popover 外：级联关闭全部已开字体层
  useEffect(() => {
    if (!(isFontSettingOpen || uiFontListOpen || wsFontListOpen)) return;
    const handleArbiterMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-font-panel]')) return;      // 面板内：选项交互 / 空白关闭由面板自身处理
      if (target.closest('[data-font-trigger]')) return;    // 触发按钮：交给自身 onToggle（互斥开合）

      if (uiFontListOpen || wsFontListOpen) {
        setUiFontListOpen(false);
        setWsFontListOpen(false);
        return;
      }
      if (isFontSettingOpen && !fontSettingRef.current?.contains(target)) {
        setIsFontSettingOpen(false);   // 列表未开：关 popover
      }
    };
    document.addEventListener('mousedown', handleArbiterMouseDown);
    return () => document.removeEventListener('mousedown', handleArbiterMouseDown);
  }, [isFontSettingOpen, uiFontListOpen, wsFontListOpen]);

  // 「关于」悬浮层的外部点击关闭
  useEffect(() => {
    if (!isAboutOpen) return;
    const handle = (event: MouseEvent) => {
      if (aboutRef.current && !aboutRef.current.contains(event.target as Node)) setIsAboutOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isAboutOpen]);

  // Initialize partners if not present
  const currentPartners = settings.partners || ['himeno', null, null];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (partnerSettingRef.current && !partnerSettingRef.current.contains(event.target as Node)) {
        setIsPartnerSettingOpen(false);
      }
    };
    const handleClickOutsideWindow = (event: MouseEvent) => {
      if (windowSettingRef.current && !windowSettingRef.current.contains(event.target as Node)) {
        setIsWindowSettingOpen(false);
      }
    };

    if (isPartnerSettingOpen) document.addEventListener('mousedown', handleClickOutside);
    if (isWindowSettingOpen) document.addEventListener('mousedown', handleClickOutsideWindow);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('mousedown', handleClickOutsideWindow);
    };
  }, [isPartnerSettingOpen, isWindowSettingOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    if (isProfileDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileDropdownOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If confirm modal is open, it has higher priority
        if (isConfirmModalOpen) return;

        if (isPartnerSettingOpen) {
          setIsPartnerSettingOpen(false);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (isWindowSettingOpen) {
          setIsWindowSettingOpen(false);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (isProfileDropdownOpen) {
          setIsProfileDropdownOpen(false);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        // 字体下拉列表优先于字体 popover 关闭
        if (uiFontListOpen || wsFontListOpen) {
          setUiFontListOpen(false);
          setWsFontListOpen(false);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (isFontSettingOpen) {
          setIsFontSettingOpen(false);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (isAboutOpen) {
          setIsAboutOpen(false);
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
  }, [isOpen, isPartnerSettingOpen, isWindowSettingOpen, isFontSettingOpen, uiFontListOpen, wsFontListOpen, isProfileDropdownOpen, isConfirmModalOpen, isAboutOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          />

          {/* Modal Container */}
          <div
            ref={settingsRootRef}
            className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden pointer-events-auto"
              >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-2 text-gray-800">
                    <Settings className="w-5 h-5" />
                    <h2 className="font-semibold text-lg">{t('settings')}</h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 grid grid-cols-3 gap-6">

                  {/* Column 1: Language & Editor Settings */}
                  <div className="space-y-0">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-500 uppercase tracking-wider">
                        <Globe className="w-4 h-4" />
                        <span>{t('language')}</span>
                      </div>
                      <select
                        value={settings.language}
                        onChange={(e) => updateSettings({ language: e.target.value as any })}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="en-US">English (US)</option>
                        <option value="zh-CN">简体中文 (Chinese)</option>
                      </select>
                    </div>

                    <div className="space-y-4 flex flex-col justify-between">
                      <div className="space-y-4"></div>

                        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 uppercase tracking-wider">
                          <Edit3 className="w-4 h-4" />
                          <span>{t('editor_settings')}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                             <Edit3 className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-800">{t('edit_source')}</div>
                              <div className="text-xs text-gray-500">{t('edit_source_desc')}</div>
                            </div>
                          </div>
                          <Switch
                            checked={settings.enableSourceEdit}
                            onChange={(val) => updateSettings({ enableSourceEdit: val })}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                            <Type className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-800">{t('highlight_half')}</div>
                            <div className="text-xs text-gray-500">{t('highlight_half_desc')}</div>
                          </div>
                        </div>
                        <Switch
                          checked={settings.enableHalfWidthHighlight}
                          onChange={(val) => updateSettings({ enableHalfWidthHighlight: val })}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Space className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-800">{t('highlight_full')}</div>
                            <div className="text-xs text-gray-500">{t('highlight_full_desc')}</div>
                          </div>
                        </div>
                        <Switch
                          checked={settings.enableSpaceHighlight}
                          onChange={(val) => updateSettings({ enableSpaceHighlight: val })}
                        />
                      </div>
                  </div>
                  </div>

                  {/* Column 2: Dictionary & Partners */}
                  <div className="space-y-6 flex flex-col justify-between">
                    <div className="space-y-4">

                    {/* Dictionary */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-500 uppercase tracking-wider">
                        <BookOpen className="w-4 h-4" />
                        <span>{t('manage_dictionary')}</span>
                      </div>
                      
                      <button
                        onClick={onOpenDictionary}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium text-gray-800">{t('dictionary_title')}</div>
                            <div className="text-xs text-gray-400 whitespace-pre-line">{t('description_dictionary')}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                      </button>
                    </div>

                    <div className="h-px bg-gray-100" />

                      {/* Partners Area */}
                      <div className="flex flex-row justify-center items-center gap-4 opacity-90 hover:opacity-100 transition-opacity">
                        {currentPartners.map((partnerId, index) => {
                          if (!partnerId) return null;
                          const partner = assistants.find(p => p.id === partnerId);
                          if (!partner) return null;
                          const avatarUrl = avatarUrls[partnerId];

                          return (
                            <div
                              key={`${partnerId}-${index}`}
                              title={assistantLabel(partner)}
                              className="h-27.5 w-20 bg-white rounded-xl shadow-sm border border-pink-100 p-1 flex items-center justify-center overflow-hidden cursor-pointer transition-transform hover:scale-120"
                              onClick={() => {
                                const message = assistantQuote(partner);
                                if (!message) return;
                                window.dispatchEvent(new CustomEvent('app-toast', {
                                  detail: { message: `${partner.symbol}${message}${partner.symbol}`, variant: partner.variant, durationMs: partner.durationMs },
                                }));
                              }}
                            >
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={assistantLabel(partner)}
                                  className={`w-full h-full ${partner.fit === 'contain' ? 'object-contain' : 'object-cover'}`}
                                />
                              ) : (
                                <span className="text-2xl text-gray-300 select-none">?</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Format Configuration */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-500 uppercase tracking-wider shrink-0">
                        <Code className="w-4 h-4" />
                        <span>{t('parser_format' as any)}</span>
                      </div>
                      <span
                        className="text-xs text-blue-600/70 font-medium text-nowrap overflow-hidden text-ellipsis min-w-0"
                        title={(() => {
                          const n = settings.parserProfiles?.find(p => p.id === settings.activeParserProfileId)?.name || defaultProfile.name;
                          return `${t('default_profile')}: ${n}`;
                        })()}
                      >
                        {t('default_profile')}: {settings.parserProfiles?.find(p => p.id === settings.activeParserProfileId)?.name || defaultProfile.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div ref={profileDropdownRef} data-dropdown className="relative">
                        <button
                          onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                          className="w-44 truncate text-xs text-left bg-white border border-gray-200 rounded px-3 py-2 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 flex items-center gap-1"
                          title={settings.parserProfiles?.find(p => p.id === editingProfileId)?.name || defaultProfile.name}
                        >
                          <span className="flex-1 truncate">
                            {settings.parserProfiles?.find(p => p.id === editingProfileId)?.name || defaultProfile.name}
                          </span>
                          <ChevronDown size={12} className="shrink-0 text-gray-400" />
                        </button>
                        {isProfileDropdownOpen && (
                          <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-48 overflow-y-auto">
                            {settings.parserProfiles?.map(p => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setEditingProfileId(p.id);
                                  updateSettings({ activeParserProfileId: p.id });
                                  setIsProfileDropdownOpen(false);
                                }}
                                className={`w-full truncate text-left px-3 py-1.5 text-xs ${
                                  p.id === editingProfileId
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'hover:bg-gray-50 text-gray-700'
                                }`}
                                title={p.name}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const newId = `profile_${Date.now()}`;
                          const newProfile: ParserProfile = {
                            id: newId,
                            name: `Profile ${(settings.parserProfiles?.length || 0) + 1}`,
                            lineRegex: '^(?<prefix>.*?)(?<text>.*)$',
                          };
                          const updated = [...(settings.parserProfiles || []), newProfile];
                          updateSettings({ parserProfiles: updated, activeParserProfileId: newId });
                          setEditingProfileId(newId);
                        }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors shrink-0 whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t('add_profile' as any)}</span>
                      </button>
                    </div>

                    {(() => {
                      const p = settings.parserProfiles?.find(pp => pp.id === editingProfileId);
                      if (!p) return null;
                      const isBuiltIn = p.id === 'default' || p.id === 'dc3';
                      return (
                        <div key={p.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <input
                              value={p.name}
                              readOnly={isBuiltIn}
                              onChange={(e) => {
                                const updated = settings.parserProfiles?.map(pp =>
                                  pp.id === p.id ? { ...pp, name: e.target.value } : pp
                                );
                                if (updated) updateSettings({ parserProfiles: updated });
                              }}
                              className="text-sm font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 flex-1"
                              placeholder="Profile Name"
                            />
                            <button
                              disabled={isBuiltIn}
                              onClick={() => {
                                showConfirmModal({
                                  isOpen: true,
                                  title: t('delete_profile_title' as any),
                                  message: t('delete_profile_message' as any, { name: p.name }),
                                  variant: 'danger',
                                  onConfirm: () => {
                                    const profiles = settings.parserProfiles || [];
                                    const deletedIndex = profiles.findIndex(pp => pp.id === p.id);
                                    const updated = profiles.filter(pp => pp.id !== p.id);
                                    // 即时清理：删除该配置在 folderProfileMap 中的全部绑定
                                    const newMap = { ...(settings.folderProfileMap || {}) };
                                    for (const key of Object.keys(newMap)) {
                                      if (newMap[key] === p.id) delete newMap[key];
                                    }
                                    if (updated.length) {
                                      const fallbackIndex = deletedIndex > 0 ? deletedIndex - 1 : 0;
                                      const safeIndex = Math.min(fallbackIndex, updated.length - 1);
                                      const fallbackId = updated[safeIndex].id;
                                      updateSettings({ parserProfiles: updated, activeParserProfileId: fallbackId, folderProfileMap: newMap });
                                      setEditingProfileId(fallbackId);
                                    } else {
                                      updateSettings({ parserProfiles: updated, folderProfileMap: newMap });
                                    }
                                    showConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
                                  },
                                });
                              }}
                              title={t('delete_profile' as any)}
                              className={`p-1 shrink-0 rounded transition-colors ${
                                isBuiltIn
                                  ? 'text-gray-300 cursor-not-allowed'
                                  : 'text-gray-400 hover:text-red-500'
                              }`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">{t('regex_line' as any)}</label>
                              {isBuiltIn ? (
                                <div
                                  className="w-full h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded text-gray-600 overflow-hidden text-nowrap leading-7 cursor-pointer hover:border-blue-300 transition-colors"
                                  title={p.lineRegex}
                                  onClick={() => {
                                    navigator.clipboard.writeText(p.lineRegex);
                                    window.dispatchEvent(new CustomEvent('app-toast', { detail: t('regex_copied' as any) }));
                                  }}
                                >
                                  {p.lineRegex}
                                </div>
                              ) : (
                                <input
                                  value={p.lineRegex}
                                  onChange={(e) => {
                                    const updated = settings.parserProfiles?.map(pp =>
                                      pp.id === p.id ? { ...pp, lineRegex: e.target.value } : pp
                                    );
                                    if (updated) updateSettings({ parserProfiles: updated });
                                  }}
                                  className="w-full h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 overflow-hidden text-nowrap"
                                  title={p.lineRegex}
                                />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-500">{t('regex_id' as any)}</label>
                                <Switch
                                  checked={p.idRegexDisabled ? false : !!p.idRegex}
                                  disabled={isBuiltIn}
                                  onChange={(val) => {
                                    const updated = settings.parserProfiles?.map(pp =>
                                      pp.id === p.id
                                        ? {
                                            ...pp,
                                            idRegexDisabled: !val,
                                            idRegex: val && !pp.idRegex ? '^(?<id>#\\S+)$' : pp.idRegex,
                                          }
                                        : pp
                                    );
                                    if (updated) updateSettings({ parserProfiles: updated });
                                  }}
                                />
                              </div>
                              {isBuiltIn ? (
                                p.idRegex ? (
                                  <div
                                    className="w-full h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded text-gray-600 overflow-hidden text-nowrap leading-7 cursor-pointer hover:border-blue-300 transition-colors"
                                    title={p.idRegex}
                                    onClick={() => {
                                      navigator.clipboard.writeText(p.idRegex!);
                                      window.dispatchEvent(new CustomEvent('app-toast', { detail: t('regex_copied' as any) }));
                                    }}
                                  >
                                    {p.idRegex}
                                  </div>
                                ) : (
                                  <div className="w-full h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded text-gray-400 overflow-hidden text-nowrap leading-7">
                                    (Disabled)
                                  </div>
                                )
                              ) : (
                                <input
                                  value={p.idRegex || ''}
                                  readOnly={p.idRegexDisabled}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = settings.parserProfiles?.map(pp =>
                                      pp.id === p.id ? { ...pp, idRegex: val || undefined } : pp
                                    );
                                    if (updated) updateSettings({ parserProfiles: updated });
                                  }}
                                  className="w-full h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 overflow-hidden text-nowrap read-only:text-gray-400 read-only:cursor-default"
                                  title={p.idRegex || (p.idRegexDisabled ? '(Disabled)' : '')}
                                  placeholder={p.idRegexDisabled ? '(Disabled)' : ''}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center gap-4 relative">
                  <div className="flex items-center gap-2">
                    {/* Partner Setting Button & Popover */}
                    {(settings.enablePartnerSettings ?? true) && (
                      <div ref={partnerSettingRef} className="relative">
                        <button
                          onClick={() => setIsPartnerSettingOpen(!isPartnerSettingOpen)}
                          className="p-2 text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-lg transition-colors"
                          title={t('partner_settings')}
                        >
                          <span className="w-5 h-5">♥</span>
                        </button>

                        <AnimatePresence>
                          {isPartnerSettingOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50"
                            >
                              <h3 className="text-sm font-medium text-gray-800 mb-3">{t('partner_settings')}</h3>
                              <div className="space-y-3">
                                {Array.from({ length: MAX_PARTNER_SLOTS }).map((_, index) => (
                                  <div key={index} className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-gray-500 w-12">{t('slot')} {index + 1}</span>
                                    <select
                                      value={currentPartners[index] || ''}
                                      onChange={(e) => {
                                        const newPartners = [...currentPartners];
                                        newPartners[index] = e.target.value || null;
                                        updateSettings({ partners: newPartners });
                                      }}
                                      className="flex-1 text-sm border-gray-200 rounded-md shadow-sm focus:border-pink-300 focus:ring focus:ring-pink-200 focus:ring-opacity-50"
                                    >
                                      <option value="">{t('none_hidden')}</option>
                                      {assistants.map(a => (
                                        <option key={a.id} value={a.id}>{a.symbol}{assistantLabel(a)}</option>
                                      ))}
                                    </select>
                                  </div>
                                ))}

                                {/* 资源目录状态与操作 */}
                                <div className="pt-2 mt-1 border-t border-gray-100 space-y-2">
                                  <div className="text-[11px] leading-snug text-gray-400 break-all">
                                    {assetsLoading
                                      ? '…'
                                      : assetStatus === 'unsupported'
                                        ? t('assets_desktop_only')
                                        : assetError
                                          ? `${t('assets_error')}: ${assetError}`
                                          : t('assets_found', { count: String(assistants.filter(a => !a.builtin).length) })}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={assetStatus !== 'ok'}
                                      onClick={() => void refreshAssistants()}
                                      className="flex-1 px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {t('rescan_assets')}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!assetRoot}
                                      onClick={() => { if (assetRoot) void openPath(assetRoot); }}
                                      className="flex-1 px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {t('open_asset_folder')}
                                    </button>
                                  </div>
                                  {!assetsLoading && assetStatus === 'ok' && assistants.filter(a => !a.builtin).length === 0 && (
                                    <div className="text-[11px] leading-snug text-gray-400">{t('assets_empty_hint')}</div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Window Settings Button & Popover */}
                    <div ref={windowSettingRef} className="relative">
                      <button
                        onClick={() => setIsWindowSettingOpen(!isWindowSettingOpen)}
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title={t('window_settings')}
                      >
                        <Monitor className="w-6 h-6" />
                      </button>

                      <AnimatePresence>
                        {isWindowSettingOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full left-0 mb-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 p-3 z-50"
                          >
                            <h3 className="text-sm font-medium text-gray-800 mb-3">{t('window_settings')}</h3>
                            <div className="space-y-3">
                              {/* Resolution Dropdown */}
                              <div>
                                <label className="text-xs text-gray-500 mb-2 block">{t('resolution')}</label>
                                <select
                                  value={
                                    settings.windowWidth === 1920 && settings.windowHeight === 1080 ? '1080p' :
                                    settings.windowWidth === 1280 && settings.windowHeight === 720 ? '720p' : 'custom'
                                  }
                                  onChange={async (e) => {
                                    const val = e.target.value;
                                    if (val === 'custom') return;
                                    
                                    const width = val === '1080p' ? 1920 : 1280;
                                    const height = val === '1080p' ? 1080 : 720;
                                    
                                    updateSettings({ windowWidth: width, windowHeight: height });
                                    
                                    // Only apply size if not maximized or fullscreen
                                    if (appWindow && !settings.startMaximized && !settings.startFullscreen) {
                                      await appWindow.setSize(new LogicalSize(width, height));
                                      await appWindow.center();
                                    }
                                    window.dispatchEvent(new CustomEvent('app-toast', { detail: t('window_settings_updated') }));
                                  }}
                                  className="w-full px-2 py-1 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="720p">1280 x 720</option>
                                  <option value="1080p">1920 x 1080</option>
                                  {!( (settings.windowWidth === 1920 && settings.windowHeight === 1080) || (settings.windowWidth === 1280 && settings.windowHeight === 720) ) && (
                                    <option value="custom">{t('custom')} ({settings.windowWidth} x {settings.windowHeight})</option>
                                  )}
                                </select>
                              </div>
                              
                              {/* 关闭到托盘（仅桌面版有系统托盘） */}
                              {appWindow && (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-gray-700">{t('close_to_tray')}</span>
                                  <Switch
                                    checked={settings.closeToTray ?? false}
                                    onChange={(val) => {
                                      updateSettings({ closeToTray: val });
                                      window.dispatchEvent(new CustomEvent('app-toast', { detail: t('window_settings_updated') }));
                                    }}
                                  />
                                </div>
                              )}

                              {/* Fullscreen Switch */}
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-700">{t('fullscreen')}</span>
                                <Switch 
                                  checked={settings.startFullscreen ?? false} 
                                  onChange={async (val) => {
                                    if (val) {
                                      if (settings.startMaximized) updateSettings({ startMaximized: false });
                                      updateSettings({ startFullscreen: true });
                                      if (appWindow) await appWindow.setFullscreen(true);
                                    } else {
                                      updateSettings({ startFullscreen: false });
                                      if (appWindow) await appWindow.setFullscreen(false);
                                    }
                                    window.dispatchEvent(new CustomEvent('app-toast', { detail: t('window_settings_updated') }));
                                  }} 
                                />
                              </div>

                              {/* Maximize Switch */}
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-700">{t('start_maximized')}</span>
                                <Switch 
                                  checked={settings.startMaximized ?? false} 
                                  onChange={async (val) => {
                                    if (val) {
                                      if (settings.startFullscreen) {
                                        updateSettings({ startFullscreen: false });
                                        if (appWindow) await appWindow.setFullscreen(false);
                                      }
                                      updateSettings({ startMaximized: true });
                                      if (appWindow) await appWindow.maximize();
                                    } else {
                                      updateSettings({ startMaximized: false });
                                      if (appWindow) await appWindow.unmaximize();
                                    }
                                    window.dispatchEvent(new CustomEvent('app-toast', { detail: t('window_settings_updated') }));
                                  }} 
                                />
                              </div>
                             </div>
                              {/* 自定义程序图标 */}
                              <div className="pt-2 mt-1 border-t border-gray-100 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-gray-700">{t('custom_app_icon')}</span>
                                  <Switch
                                    checked={!(settings.customIconDisabled ?? false)}
                                    onChange={(val) => updateSettings({ customIconDisabled: !val })}
                                  />
                                </div>
                                <div className="text-[11px] leading-snug text-gray-400 truncate" title={iconStatusText}>
                                  {iconStatusText}
                                </div>
                              </div>
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </div>

                     {/* Font Settings Button & Popover */}
                     <div ref={fontSettingRef} className="relative">
                       <button
                         onClick={() => setIsFontSettingOpen(!isFontSettingOpen)}
                         className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                         title={t('font_settings')}
                       >
                         <Type className="w-6 h-6" />
                       </button>

                       <AnimatePresence>
                         {isFontSettingOpen && (
                           <motion.div
                             initial={{ opacity: 0, y: 10, scale: 0.95 }}
                             animate={{ opacity: 1, y: 0, scale: 1 }}
                             exit={{ opacity: 0, y: 10, scale: 0.95 }}
                             transition={{ duration: 0.15 }}
                             className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-3 z-50"
                           >
                              <h3 className="text-sm font-medium text-gray-800 mb-3">{t('font_settings')}</h3>
                              <div className="space-y-3">
                                {/* UI Font */}
                                <div>
                                  <label className="text-xs text-gray-500 mb-2 block">{t('ui_font')}</label>
                                  <FontDropdown
                                    value={settings.uiFontFamily || ''}
                                    open={uiFontListOpen}
                                    onToggle={() => { setUiFontListOpen(v => !v); setWsFontListOpen(false); }}
                                    onClose={() => setUiFontListOpen(false)}
                                    onChange={(v) => {
                                      updateSettings({ uiFontFamily: v || undefined });
                                      window.dispatchEvent(new CustomEvent('app-toast', { detail: t('font_settings_updated') }));
                                    }}
                                  />
                                </div>
                                {/* Workspace Font */}
                                <div>
                                  <label className="text-xs text-gray-500 mb-2 block">{t('workspace_font')}</label>
                                  <FontDropdown
                                    value={settings.workspaceFontFamily || ''}
                                    open={wsFontListOpen}
                                    onToggle={() => { setWsFontListOpen(v => !v); setUiFontListOpen(false); }}
                                    onClose={() => setWsFontListOpen(false)}
                                    onChange={(v) => {
                                      updateSettings({ workspaceFontFamily: v || undefined });
                                      window.dispatchEvent(new CustomEvent('app-toast', { detail: t('font_settings_updated') }));
                                    }}
                                  />
                                </div>
                              </div>
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </div>
                     {/* About Button & Popover */}
                     <div ref={aboutRef} className="relative">
                       <button
                         onClick={() => setIsAboutOpen(!isAboutOpen)}
                         className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                         title={t('about')}
                       >
                         <Info className="w-5 h-5" />
                       </button>

                       <AnimatePresence>
                         {isAboutOpen && (
                           <motion.div
                             initial={{ opacity: 0, y: 10, scale: 0.95 }}
                             animate={{ opacity: 1, y: 0, scale: 1 }}
                             exit={{ opacity: 0, y: 10, scale: 0.95 }}
                             transition={{ duration: 0.15 }}
                             className="absolute bottom-full left-0 mb-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50"
                           >
                             <h3 className="text-sm font-medium text-gray-800 mb-3">{t('about')}</h3>
                             <AboutPanel showUpdateCheck />
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </div>
                   </div>

                  {onQuit && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={onQuit}
                        className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Power className="w-5 h-5" />
                        <span>{t('quit_app')}</span>
                      </button>

                      <button
                        onClick={onClose}
                        className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        {t('done')}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

const Switch: React.FC<{ checked: boolean; onChange: (val: boolean) => void; disabled?: boolean }> = ({
  checked,
  onChange,
  disabled,
}) => (
  <button
    onClick={() => { if (!disabled) onChange(!checked); }}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
    } ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);
