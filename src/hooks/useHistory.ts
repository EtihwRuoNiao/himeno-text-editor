import { TextBlock } from '../types';

// Simple history stack implementation
interface HistoryState {
  blocks: TextBlock[];
  focusedRowId: string | null;
  focusedField: 'source' | 'target' | null;
  selectionStart: number | null;
}

export interface HistoryTransition {
  targetState: HistoryState;
  fromState: HistoryState;
}

// 纯对象历史存储：每个工作区持有独立实例，背景工作区零 React 渲染
export interface HistoryStore {
  blocks: TextBlock[];
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  pushState: (
    newBlocks: TextBlock[],
    focusedRowId?: string | null,
    focusedField?: 'source' | 'target' | null,
    selectionStart?: number | null,
  ) => void;
  updateDraftState: (newBlocks: TextBlock[]) => void;
  undo: () => HistoryTransition | null;
  redo: () => HistoryTransition | null;
  markClean: () => void;
  markDirty: () => void;
  resetHistory: (blocks: TextBlock[]) => void;
  subscribe: (listener: () => void) => () => void;
}

export const createHistoryStore = (initialBlocks: TextBlock[]): HistoryStore => {
  let blocks: TextBlock[] = initialBlocks;
  let history: HistoryState[] = [{
    blocks: initialBlocks,
    focusedRowId: null,
    focusedField: null,
    selectionStart: null,
  }];
  let currentIndex = 0;
  let cleanIndex = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of listeners) l();
  };

  const getCanUndo = () => currentIndex > 0 || blocks !== history[currentIndex].blocks;
  const getCanRedo = () => currentIndex < history.length - 1;
  const getIsDirty = () => currentIndex !== cleanIndex || blocks !== history[currentIndex].blocks;

  const store: HistoryStore = {
    get blocks() { return blocks; },
    get isDirty() { return getIsDirty(); },
    get canUndo() { return getCanUndo(); },
    get canRedo() { return getCanRedo(); },

    pushState(newBlocks, focusedRowId = null, focusedField = null, selectionStart = null) {
      blocks = newBlocks;
      history = [...history.slice(0, currentIndex + 1), {
        blocks: newBlocks,
        focusedRowId,
        focusedField,
        selectionStart,
      }];
      currentIndex += 1;
      notify();
    },

    updateDraftState(newBlocks) {
      blocks = newBlocks;
      notify();
    },

    undo() {
      // 若有未入历史的草稿态，首次撤销仅回退到最新历史帧
      if (blocks !== history[currentIndex].blocks) {
        const targetState = history[currentIndex];
        const fromState = { blocks, focusedRowId: null, focusedField: null, selectionStart: null };
        blocks = targetState.blocks;
        notify();
        return { targetState, fromState };
      }
      if (currentIndex > 0) {
        const targetState = history[currentIndex - 1];
        const fromState = history[currentIndex];
        currentIndex -= 1;
        blocks = targetState.blocks;
        notify();
        return { targetState, fromState };
      }
      return null;
    },

    redo() {
      if (currentIndex < history.length - 1) {
        const targetState = history[currentIndex + 1];
        const fromState = history[currentIndex];
        currentIndex += 1;
        blocks = targetState.blocks;
        notify();
        return { targetState, fromState };
      }
      return null;
    },

    markClean() {
      cleanIndex = currentIndex;
      notify();
    },

    // 强制脏标记（如启动时静默采用草稿内容后）：cleanIndex 置为 -1，任何 currentIndex 下均为脏
    markDirty() {
      cleanIndex = -1;
      notify();
    },

    resetHistory(newBlocks) {
      blocks = newBlocks;
      history = [{
        blocks: newBlocks,
        focusedRowId: null,
        focusedField: null,
        selectionStart: null,
      }];
      currentIndex = 0;
      cleanIndex = 0;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };

  return store;
};
