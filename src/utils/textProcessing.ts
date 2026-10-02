import { DictionaryEntry } from '../types';

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// 模糊匹配的"清洗"规则：剔除空白与字面量 \r \n（与分隔符正则语义一致）
const CLEAN_SEPARATOR_RE = /(?:\s|\\r|\\n)+/g;

interface Token {
  text: string;
  type: 'searchMatch' | 'fullWidthSpace' | 'halfWidth' | 'normal' | 'dictionaryMatch' | 'formatHint';
  translation?: string;
}

const tokenizeTextBasic = (text: string): Token[] => {
  const tokens: Token[] = [];
  // Pattern 1: @ followed by 1-3 alphanumeric characters
  // Pattern 2: Full-width formatting characters
  // Pattern 3: Half-width characters (excluding those matched by Pattern 1)
  // Pattern 4: Everything else
  const regex = /(@[a-zA-Z0-9]{1,3})|([\u3000「」『』〇])|([\x20-\x7E])|([^\x20-\x7E\u3000「」『』〇@]+|@)/g;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      tokens.push({ text: match[1], type: 'formatHint' });
    } else if (match[2]) {
      tokens.push({ text: match[2], type: 'fullWidthSpace' });
    } else if (match[3]) {
      tokens.push({ text: match[3], type: 'halfWidth' });
    } else if (match[4]) {
      tokens.push({ text: match[4], type: 'normal' });
    }
  }
  return tokens;
};

// --- 词典匹配机器缓存：按词典引用+模糊开关缓存排序结果/清洗映射/编译正则，避免每次调用全量重建 ---
interface DictMatcherCache {
  dictRef: DictionaryEntry[];
  fuzzy: boolean;
  searchPart: string | null;
  sortedDict: DictionaryEntry[];
  cleanWordMap: Map<string, DictionaryEntry>;
  regex: RegExp | null;
}

let dictMatcherCache: DictMatcherCache | null = null;

const getDictMatcherCache = (
  dictionary: DictionaryEntry[],
  enableFuzzyMatch: boolean,
  searchPart: string | null,
): DictMatcherCache => {
  if (
    dictMatcherCache &&
    dictMatcherCache.dictRef === dictionary &&
    dictMatcherCache.fuzzy === enableFuzzyMatch &&
    dictMatcherCache.searchPart === searchPart
  ) {
    return dictMatcherCache;
  }

  // Sort dictionary by length descending to match longest first
  const sortedDict = [...dictionary].sort((a, b) => b.source.length - a.source.length);

  let dictPatterns: string[] = [];
  if (enableFuzzyMatch) {
    // 构造分隔符正则：兼容 Windows \r\n 与 Mac/Linux \n（字面量）以及真实空白字符
    // 使用双反斜杠确保 new RegExp 接收到的是 \s, \\r, \\n
    const separator = '(?:(?:\\s|\\\\r|\\n)+)?';
    dictPatterns = sortedDict.map(d => Array.from(d.source).map(c => escapeRegExp(c)).join(separator)).filter(Boolean);
  } else {
    // 精确匹配模式：直接转义源文本
    dictPatterns = sortedDict.map(d => escapeRegExp(d.source)).filter(Boolean);
  }

  // 清洗映射：按排序顺序写入（首个优先），语义与原 sortedDict.find 完全一致
  const cleanWordMap = new Map<string, DictionaryEntry>();
  for (const d of sortedDict) {
    const key = enableFuzzyMatch ? d.source.replace(CLEAN_SEPARATOR_RE, '') : d.source;
    if (!cleanWordMap.has(key)) cleanWordMap.set(key, d);
  }

  const patterns: string[] = [];
  if (searchPart) patterns.push(String.raw`(?<search>${searchPart})`);
  if (dictPatterns.length > 0) patterns.push(String.raw`(?<dict>${dictPatterns.join('|')})`);

  dictMatcherCache = {
    dictRef: dictionary,
    fuzzy: enableFuzzyMatch,
    searchPart,
    sortedDict,
    cleanWordMap,
    regex: patterns.length > 0 ? new RegExp(patterns.join('|'), 'g') : null,
  };
  return dictMatcherCache;
};

const tokenizeText = (
  text: string, 
  searchQuery: string, 
  isSearchPanelVisible: boolean,
  enableFuzzyMatch: boolean,
  dictionary: DictionaryEntry[] = []
): Token[] => {
  const tokens: Token[] = [];
  
  const searchPart = isSearchPanelVisible && searchQuery ? escapeRegExp(searchQuery) : null;
  const matcher = getDictMatcherCache(dictionary, enableFuzzyMatch, searchPart);
  
  if (matcher.regex) {
    const regex = matcher.regex;
    regex.lastIndex = 0;   // 复用编译实例：每次执行前重置
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      // Add text before match
      const before = text.substring(lastIndex, match.index);
      if (before) tokens.push(...tokenizeTextBasic(before));
      
      const matchedText = match[0];
      const groups = match.groups || {};
      
      // Determine if it's a search match or dictionary match
      if (groups.search && matchedText === searchQuery) {
        tokens.push({ text: matchedText, type: 'searchMatch' });
      } else if (groups.dict) {
        let dictEntry: DictionaryEntry | undefined;

        if (enableFuzzyMatch) {
          // 还原干净的单词：剔除匹配文本中的分隔符后查预构建映射
          const cleanWord = matchedText.replace(CLEAN_SEPARATOR_RE, '');
          dictEntry = matcher.cleanWordMap.get(cleanWord);
        } else {
          // 精确匹配直接查映射
          dictEntry = matcher.cleanWordMap.get(matchedText);
        }
        
        if (dictEntry) {
          tokens.push({ 
            text: matchedText, 
            type: 'dictionaryMatch', 
            translation: dictEntry.target 
          });
        } else {
          tokens.push(...tokenizeTextBasic(matchedText));
        }
      } else {
        tokens.push(...tokenizeTextBasic(matchedText));
      }
      
      lastIndex = regex.lastIndex;
    }
    
    // Add remaining text
    const remaining = text.substring(lastIndex);
    if (remaining) tokens.push(...tokenizeTextBasic(remaining));
  } else {
    tokens.push(...tokenizeTextBasic(text));
  }
  
  return tokens;
};

// Generate HTML for the highlight overlay using tokenizer

const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- highlight 结果缓存（有界 FIFO）：行重挂载/滚动回看/恢复未变行直接命中，避免重复生成 ---
const HIGHLIGHT_CACHE_MAX = 600;
const highlightCache = new Map<string, string>();
const dictIdMap = new WeakMap<DictionaryEntry[], number>();
let nextDictId = 1;
// 词典引用 → 代次 id：空数组规范化为 0（避免默认参数新建 [] 导致缓存键抖动）
const getDictGenerationId = (d?: DictionaryEntry[]): number => {
  if (!d || d.length === 0) return 0;
  let id = dictIdMap.get(d);
  if (id === undefined) {
    id = nextDictId++;
    dictIdMap.set(d, id);
  }
  return id;
};

export const generateHighlightHtml = (
  text: string, 
  enableHalfWidthHighlight: boolean, 
  enableSpaceHighlight: boolean,
  enableFuzzyMatch: boolean,
  enableDictionaryHints: boolean,
  targetText: string = '',
  searchQuery: string = '',
  isSearchPanelVisible: boolean = false,
  dictionary: DictionaryEntry[] = []
): string => {
  const cacheKey =
    `${getDictGenerationId(dictionary)}\u0000${enableHalfWidthHighlight ? 1 : 0}${enableSpaceHighlight ? 1 : 0}${enableFuzzyMatch ? 1 : 0}${enableDictionaryHints ? 1 : 0}${isSearchPanelVisible ? 1 : 0}\u0000${targetText}\u0000${searchQuery}\u0000${text}`;
  const cached = highlightCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const html = (() => {
    // Always generate HTML to drive height consistently
    if (!enableHalfWidthHighlight && !enableSpaceHighlight && !(isSearchPanelVisible && searchQuery) && (!enableDictionaryHints || dictionary.length === 0)) {
      return escapeHtml(text);
    }

    const tokens = tokenizeText(text, searchQuery, isSearchPanelVisible, enableFuzzyMatch, dictionary);
    let html = '';

    for (const token of tokens) {
      const escapedText = escapeHtml(token.text);
      switch (token.type) {
        case 'searchMatch':
          html += `<span class="bg-yellow-300/60 text-black font-bold">${escapedText}</span>`;
          break;
        case 'dictionaryMatch':
          const escapedTranslation = escapeHtml(token.translation || '');
          // Only highlight if hints are enabled AND target text doesn't contain the translation
          const shouldHighlight = enableDictionaryHints && token.translation && !targetText.includes(token.translation);
          
          if (shouldHighlight) {
            html += `<span class="dictionary-match border-b-2 border-blue-400/50 bg-blue-50/30 text-blue-900 cursor-pointer relative group" data-translation="${escapedTranslation}">${escapedText}</span>`;
          } else {
            html += escapedText;
          }
          break;
        case 'fullWidthSpace':
          if (enableSpaceHighlight) {
            html += `<span class="bg-emerald-300/50 border-b border-emerald-400/50 text-transparent">${escapedText}</span>`;
          } else {
            html += escapedText;
          }
          break;
        case 'formatHint':
          if (enableSpaceHighlight) {
             // Controlled by full-width switch but uses half-width style (red)
             html += `<span class="bg-red-300/50 text-transparent border-b-2 border-red-400">${escapedText}</span>`;
          } else {
            html += escapedText;
          }
          break;
        case 'halfWidth':
          if (enableHalfWidthHighlight) {
             html += `<span class="bg-red-300/50 text-transparent border-b-2 border-red-400">${escapedText}</span>`;
          } else {
            html += escapedText;
          }
          break;
        case 'normal':
        default:
          html += escapedText;
          break;
      }
    }

    return html;
  })();

  if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
    const oldest = highlightCache.keys().next().value;
    if (oldest !== undefined) highlightCache.delete(oldest);
  }
  highlightCache.set(cacheKey, html);

  // Add a trailing break to ensure height matches textarea if it ends with newline
  return html + (text.endsWith('\n') ? '<br/>' : '');
};
