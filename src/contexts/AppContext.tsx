import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations, TranslationKey, Language } from '../i18n/translations';
import { AppSettings, ParserProfile } from '../types';
import { passthroughProfile, dc3Profile } from '../utils/parser';
import { GLOBAL_SENTINEL } from '../utils/folderUtils';

interface AppContextType {
  // Settings
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  
  // Translation
  language: Language;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const SETTINGS_KEY = 'himeno_settings';

const defaultSettings: AppSettings = {
  enableSourceEdit: false,
  enableHalfWidthHighlight: true,
  enableSpaceHighlight: true,
  enableFuzzyMatch: false,
  language: 'en-US',
  activeDictionaryId: 'default',
  partners: ['default', null, null],
  activeParserProfileId: 'default',
  parserProfiles: [passthroughProfile, dc3Profile],
  folderProfileMap: {},
  // 默认「关闭到托盘」；老用户已持久化的 false 会通过 { ...defaultSettings, ...parsed } 压过此默认值，
  // 故无需迁移标记：新用户自动获得新行为，老用户沿用旧值（需手动打开开关）。
  closeToTray: true,
};

const migrateProfile = (p: any): ParserProfile => {
  if (p.lineRegex) return p as ParserProfile;
  console.warn(`Profile "${p.id}" (${p.name}) uses old format, reset to default`);
  return passthroughProfile;
};

const ensureBuiltinProfiles = (profiles: ParserProfile[]): ParserProfile[] => {
  // 'dc5' 保留在过滤列表：旧持久化数据中的已删除内置配置被永久滤除，不复活
  const filtered = profiles.filter(p => p.id !== 'default' && p.id !== 'dc3' && p.id !== 'dc5');
  return [passthroughProfile, dc3Profile, ...filtered];
};

const getInitialSettings = (): AppSettings => {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.parserProfiles?.length) {
        parsed.parserProfiles = parsed.parserProfiles.map(migrateProfile);
      }
      const merged = { ...defaultSettings, ...parsed };
      merged.parserProfiles = ensureBuiltinProfiles(merged.parserProfiles || []);
      // 通用迁移：清理所有绑定到"当前不存在的配置"的条目，active 回退到第一个配置
      const validProfileIds = new Set((merged.parserProfiles || []).map(p => p.id));
      validProfileIds.add(GLOBAL_SENTINEL);
      for (const key of Object.keys(merged.folderProfileMap || {})) {
        if (!validProfileIds.has(merged.folderProfileMap[key])) {
          delete merged.folderProfileMap[key];
        }
      }
      if (!validProfileIds.has(merged.activeParserProfileId ?? '')) {
        merged.activeParserProfileId = merged.parserProfiles?.[0]?.id ?? 'default';
      }
      return merged;
    } catch (e) {
      console.error('Failed to parse settings', e);
    }
  }
  
  // Browser language detection
  const browserLang = navigator.language;
  const initialLang = browserLang.startsWith('zh') ? 'zh-CN' : 'en-US';
  
  return { ...defaultSettings, language: initialLang as Language };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(getInitialSettings);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => {
      // Deep compare check to prevent unnecessary updates
      const updated = { ...prev, ...newSettings };
      if (JSON.stringify(prev) === JSON.stringify(updated)) return prev;
      return updated;
    });
  }, []);

  const t = useCallback((key: TranslationKey, params?: Record<string, string>): string => {
    // language 来自 localStorage 且未校验，非法值时回退英文表，避免 undefined[key] 抛错崩渲染
    const table = translations[settings.language] || translations['en-US'];
    let text = table[key] || translations['en-US'][key] || key;
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    
    return text;
  }, [settings.language]);

  const value: AppContextType = useMemo(() => ({
    settings,
    updateSettings,
    language: settings.language,
    t,
  }), [settings, updateSettings, t]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

// Compatibility wrapper to avoid breaking existing components
export const useTranslation = () => {
  const { settings, updateSettings, language, t } = useApp();
  // 使用 useMemo 确保返回的对象引用在数据未变时不发生变化
  return useMemo(() => ({ 
    settings, 
    updateSettings, 
    language, 
    t, 
    setLanguage: () => {} 
  }), [settings, updateSettings, language, t]);
};
