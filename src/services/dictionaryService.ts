import { get, set, del } from 'idb-keyval';
import { DictionaryEntry, DictionaryConfig, DictionaryCategory } from '../types';

const DICTIONARY_CONFIGS_KEY = 'dictionary_configs';
const DICTIONARY_DATA_PREFIX = 'dict_data_';

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export const dictionaryService = {
  // Config Management
  async getConfigs(): Promise<DictionaryConfig[]> {
    try {
      const configs = await get<DictionaryConfig[]>(DICTIONARY_CONFIGS_KEY);
      if (!configs || configs.length === 0) {
        const defaultConfigs: DictionaryConfig[] = [
          { id: 'default', name: 'Default Dictionary', isDefault: true, enabled: true, enableFuzzyMatch: true }
        ];
        await set(DICTIONARY_CONFIGS_KEY, defaultConfigs);
        return defaultConfigs;
      }
      return configs.map(c => ({ ...c, enableFuzzyMatch: c.enableFuzzyMatch ?? true }));
    } catch (err) {
      console.error('Failed to load dictionary configs:', err);
      return [{ id: 'default', name: 'Default Dictionary', isDefault: true, enabled: true, enableFuzzyMatch: true }];
    }
  },

  async saveConfigs(configs: DictionaryConfig[]): Promise<void> {
    try {
      await set(DICTIONARY_CONFIGS_KEY, configs);
    } catch (err) {
      console.error('Failed to save dictionary configs:', err);
      throw err;
    }
  },

  async addConfig(name: string): Promise<DictionaryConfig> {
    const configs = await this.getConfigs();
    const newConfig: DictionaryConfig = {
      id: crypto.randomUUID(),
      name,
      enabled: true,
      enableFuzzyMatch: true
    };
    configs.push(newConfig);
    await this.saveConfigs(configs);
    return newConfig;
  },

  async deleteConfig(id: string): Promise<void> {
    const configs = await this.getConfigs();
    const filtered = configs.filter(c => c.id !== id);
    await this.saveConfigs(filtered);
    try {
      await del(`${DICTIONARY_DATA_PREFIX}${id}`);
    } catch (err) {
      console.error('Failed to delete dictionary data:', err);
    }
  },

  // Entry Management
  async getDictionary(configId: string): Promise<DictionaryEntry[]> {
    try {
      const data = await get<DictionaryEntry[]>(`${DICTIONARY_DATA_PREFIX}${configId}`);
      return data || [];
    } catch (err) {
      console.error('Failed to load dictionary entries:', err);
      return [];
    }
  },

  async saveDictionary(configId: string, entries: DictionaryEntry[]): Promise<void> {
    try {
      await set(`${DICTIONARY_DATA_PREFIX}${configId}`, entries);
    } catch (err) {
      console.error('Failed to save dictionary entries:', err);
      throw err;
    }
  },

  // Smart Parsing
  parseDictionaryFile(content: string, format: 'csv' | 'txt'): DictionaryEntry[] {
    const entries: DictionaryEntry[] = [];
    const lines = content.split(/\r?\n/);
    
    let currentCategory: DictionaryCategory = 'uncategorized';

    // Multi-language category markers mapping
    const categoryMarkers: Record<string, DictionaryCategory> = {
      '人名': 'person', 'person': 'person', 'persons': 'person', 'names': 'person',
      '地名': 'location', 'location': 'location', 'locations': 'location', 'places': 'location',
      '专名': 'term', 'term': 'term', 'terms': 'term', 'proper': 'term',
      '未分类': 'uncategorized', 'uncategorized': 'uncategorized', 'other': 'uncategorized'
    };

    // Detect if the file uses explicit markers or empty line blocks
    const hasMarkers = lines.some(line => /^={2,}.+={2,}$/.test(line.trim()));
    const emptyLineIndices = lines.map((line, idx) => line.trim() === '' ? idx : -1).filter(idx => idx !== -1);
    
    // If no markers but has empty lines, we might be in "block mode"
    // We'll handle this during iteration
    let blockIndex = 0;
    const blockCategories: DictionaryCategory[] = ['person', 'location', 'term'];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        if (!hasMarkers && index > 0 && lines[index-1].trim() !== '') {
          // Transition to next block if we hit an empty line and no markers are used
          blockIndex++;
          if (blockIndex < blockCategories.length) {
            currentCategory = blockCategories[blockIndex];
          }
        }
        return;
      }

      // Check for explicit markers: ==== Category ====
      const markerMatch = trimmedLine.match(/^={2,}\s*(.+?)\s*={2,}$/);
      if (markerMatch) {
        const markerText = markerMatch[1].toLowerCase();
        for (const [key, cat] of Object.entries(categoryMarkers)) {
          if (markerText.includes(key.toLowerCase())) {
            currentCategory = cat;
            break;
          }
        }
        return;
      }

      let source = '';
      let target = '';
      let note = '';

      if (format === 'csv') {
        const parts = parseCSVLine(line);
        source = parts[0]?.trim() || '';
        target = parts[1]?.trim() || '';
        note = parts.slice(2).join(',').trim() || '';
      } else {
        const parts = line.split(/\t/);
        if (parts.length >= 2) {
          source = parts[0]?.trim() || '';
          target = parts[1]?.trim() || '';
          note = parts.slice(2).join('\t').trim() || '';
        } else {
          const spaceParts = trimmedLine.split(/\s+/);
          if (spaceParts.length >= 2) {
             source = spaceParts[0]?.trim() || '';
             target = spaceParts[1]?.trim() || '';
             note = spaceParts.slice(2).join(' ').trim() || '';
          }
        }
      }

      if (source && target) {
        entries.push({
          id: crypto.randomUUID(),
          source,
          target,
          category: currentCategory,
          note
        });
      }
    });

    return entries;
  },

  // Upsert logic: merge new entries into existing ones, overwriting by source+category composite key
  upsertEntries(existing: DictionaryEntry[], incoming: DictionaryEntry[]): { entries: DictionaryEntry[], added: number, updated: number } {
    const key = (e: DictionaryEntry) => `${e.source}::${e.category}`;
    const map = new Map<string, DictionaryEntry>();
    existing.forEach(e => map.set(key(e), e));
    
    let added = 0;
    let updated = 0;

    incoming.forEach(e => {
      const k = key(e);
      const existingEntry = map.get(k);
      if (existingEntry) {
        map.set(k, { ...existingEntry, ...e, id: existingEntry.id });
        updated++;
      } else {
        map.set(k, e);
        added++;
      }
    });
    return { entries: Array.from(map.values()), added, updated };
  },

  exportToCSV(entries: DictionaryEntry[]): string {
    const categories: DictionaryCategory[] = ['person', 'location', 'term', 'uncategorized'];
    const categoryLabels: Record<DictionaryCategory, string> = {
      person: 'PERSON',
      location: 'LOCATION',
      term: 'TERM',
      uncategorized: 'UNCATEGORIZED'
    };

    let output = '';
    categories.forEach(cat => {
      const catEntries = entries.filter(e => e.category === cat);
      if (catEntries.length > 0) {
        output += `==== ${categoryLabels[cat]} ====\n`;
        catEntries.forEach(e => {
          output += `${e.source},${e.target},${e.note || ''}\n`;
        });
      }
    });
    return output;
  },

  exportToTXT(entries: DictionaryEntry[]): string {
    const categories: DictionaryCategory[] = ['person', 'location', 'term', 'uncategorized'];
    const categoryLabels: Record<DictionaryCategory, string> = {
      person: 'PERSON',
      location: 'LOCATION',
      term: 'TERM',
      uncategorized: 'UNCATEGORIZED'
    };

    let output = '';
    categories.forEach(cat => {
      const catEntries = entries.filter(e => e.category === cat);
      if (catEntries.length > 0) {
        output += `==== ${categoryLabels[cat]} ====\n`;
        catEntries.forEach(e => {
          output += `${e.source}\t${e.target}\t${e.note || ''}\n`;
        });
      }
    });
    return output;
  }
};
