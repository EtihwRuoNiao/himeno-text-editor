import { useEffect, useState } from 'react';
import { FileData } from '../types';
import { createHistoryStore, HistoryStore } from '../hooks/useHistory';
import { normalizePath } from '../utils/folderUtils';

export const MAX_WORKSPACES = 8;

export interface ActiveFieldState {
  rowId: string;
  field: 'sourceText' | 'targetText' | 'readonly';
  selectionStart: number;
}

// update() 内部是 Object.assign(this, patch) 的部分更新，因此这里必须是 Partial
export type SessionPatch = Partial<Omit<WorkspaceSession, 'id' | 'history' | 'update' | 'subscribe'>>;

// 工作区会话：一个编辑工作区的完整状态容器（背景工作区为纯内存对象，零渲染）
export interface WorkspaceSession {
  id: string;
  seq: number;
  name: string;
  directoryPath: string | null;
  directoryName: string;
  singleFilePath: string | null;
  isRestorable: boolean;
  files: FileData[];
  currentFileIndex: number;
  blankLinesBefore: number[];
  trailingBlankLines: number;
  lastFocusedIndex: number;
  activeField: ActiveFieldState | null;
  autoSelectIndex: number | null;
  history: HistoryStore;
  update: (patch: SessionPatch) => void;
  subscribe: (listener: () => void) => () => void;
}

let wsSeq = 0;
const genId = () => `ws_${Date.now().toString(36)}_${(wsSeq++).toString(36)}`;

export const createWorkspaceSession = (overrides: Partial<WorkspaceSession> = {}): WorkspaceSession => {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };

  const session: WorkspaceSession = {
    id: genId(),
    seq: 0,
    name: '工作区',
    directoryPath: null,
    directoryName: '',
    singleFilePath: null,
    isRestorable: false,
    files: [],
    currentFileIndex: -1,
    blankLinesBefore: [],
    trailingBlankLines: 0,
    lastFocusedIndex: 1,
    activeField: null,
    autoSelectIndex: null,
    history: createHistoryStore([]),
    update(patch) {
      Object.assign(this, patch);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    ...overrides,
  };

  // 合并 history 通知：历史变更同样驱动 session 订阅者（镜像只订阅 session 一处）
  session.history.subscribe(() => notify());

  return session;
};

export interface WorkspaceManager {
  workspaces: WorkspaceSession[];
  activeId: string;
  active: () => WorkspaceSession;
  createBlank: () => WorkspaceSession | null;
  close: (id: string) => boolean;
  switchTo: (id: string) => boolean;
  move: (from: number, to: number) => boolean;
  hydrate: (sessions: WorkspaceSession[], activeId: string) => void;
  subscribe: (listener: () => void) => () => void;
}

export const createWorkspaceManager = (): WorkspaceManager => {
  // 命名规则：当前存在工作区的最大序号 + 1（随删除动态回收序号）
  const initial = createWorkspaceSession({ name: '工作区1', seq: 1 });
  let workspaces: WorkspaceSession[] = [initial];
  let activeId = initial.id;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of listeners) l();
  };

  return {
    get workspaces() { return workspaces; },
    get activeId() { return activeId; },

    active() {
      return workspaces.find(w => w.id === activeId) ?? workspaces[0];
    },

    createBlank() {
      if (workspaces.length >= MAX_WORKSPACES) return null;
      // 命名：当前存在工作区的最大序号 + 1；超过 99 时改取未被占用的最小序号（控制名称显示宽度）
      let n = workspaces.reduce((m, w) => Math.max(m, w.seq || 0), 0) + 1;
      if (n > 99) {
        const used = new Set(workspaces.map(w => w.seq || 0));
        for (let c = 1; c <= 99; c++) {
          if (!used.has(c)) { n = c; break; }
        }
      }
      const ws = createWorkspaceSession({ name: `工作区${n}`, seq: n });
      workspaces = [...workspaces, ws];
      activeId = ws.id;
      notify();
      return ws;
    },

    close(id) {
      const idx = workspaces.findIndex(w => w.id === id);
      if (idx === -1) return false;
      let next = workspaces.filter(w => w.id !== id);
      if (next.length === 0) {
        // 关闭最后一个工作区：重置语义（清空重来，仍为"工作区1"）
        next = [createWorkspaceSession({ name: '工作区1', seq: 1 })];
      }
      workspaces = next;
      if (activeId === id) {
        activeId = workspaces[Math.min(idx, workspaces.length - 1)].id;
      }
      notify();
      return true;
    },

    switchTo(id) {
      if (!workspaces.some(w => w.id === id)) return false;
      activeId = id;
      notify();
      return true;
    },

    move(from, to) {
      if (from < 0 || from >= workspaces.length || to < 0 || to >= workspaces.length || from === to) {
        return false;
      }
      const arr = [...workspaces];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      workspaces = arr;
      notify();
      return true;
    },

    // 启动恢复：用持久化快照重建的会话整体替换初始会话
    hydrate(sessions, targetActiveId) {
      workspaces = sessions.length > 0 ? [...sessions] : [createWorkspaceSession()];
      activeId = sessions.some(w => w.id === targetActiveId)
        ? targetActiveId
        : workspaces[0].id;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
};

// 会话快照：浅引用拷贝（数组不复制），用于镜像渲染
const snapshotOf = (s: WorkspaceSession) => ({
  blocks: s.history.blocks,
  isDirty: s.history.isDirty,
  canUndo: s.history.canUndo,
  canRedo: s.history.canRedo,
  files: s.files,
  currentFileIndex: s.currentFileIndex,
  blankLinesBefore: s.blankLinesBefore,
  trailingBlankLines: s.trailingBlankLines,
  lastFocusedIndex: s.lastFocusedIndex,
  directoryPath: s.directoryPath,
  directoryName: s.directoryName,
  isRestorable: s.isRestorable,
  autoSelectIndex: s.autoSelectIndex,
});

export type SessionSnapshot = ReturnType<typeof snapshotOf>;

// --- 工作区注册表持久化：元数据入 himeno_workspaces；脏内容复用 draft_<文件名> ---
const WORKSPACE_REGISTRY_KEY = 'himeno_workspaces';
const REGISTRY_VERSION = 1;

export interface WorkspaceSnapshot {
  id: string;
  seq: number;
  name: string;
  directoryPath: string | null;
  directoryName: string;
  singleFilePath: string | null;
  currentFileName: string | null;
  lastFocusedIndex: number;
  blankLinesBefore: number[];
  trailingBlankLines: number;
}

export interface WorkspaceRegistry {
  version: number;
  activeId: string;
  items: WorkspaceSnapshot[];
}

export const buildWorkspaceRegistry = (manager: WorkspaceManager): WorkspaceRegistry => ({
  version: REGISTRY_VERSION,
  activeId: manager.activeId,
  items: manager.workspaces.map(ws => {
    const currentFile = ws.files[ws.currentFileIndex];
    return {
      id: ws.id,
      seq: ws.seq,
      name: ws.name,
      directoryPath: ws.directoryPath,
      directoryName: ws.directoryName,
      singleFilePath: ws.singleFilePath,
      currentFileName: currentFile?.name ?? null,
      lastFocusedIndex: ws.lastFocusedIndex,
      blankLinesBefore: [...ws.blankLinesBefore],
      trailingBlankLines: ws.trailingBlankLines,
    };
  }),
});

export const saveWorkspaceRegistry = (manager: WorkspaceManager): boolean => {
  try {
    localStorage.setItem(WORKSPACE_REGISTRY_KEY, JSON.stringify(buildWorkspaceRegistry(manager)));
    return true;
  } catch (err) {
    console.error('[workspace-registry] save failed:', err);
    return false;
  }
};

export const loadWorkspaceRegistry = (): WorkspaceRegistry | null => {
  try {
    const raw = localStorage.getItem(WORKSPACE_REGISTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== REGISTRY_VERSION || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return null;
    }
    return parsed as WorkspaceRegistry;
  } catch (err) {
    console.error('[workspace-registry] load failed:', err);
    return null;
  }
};

// 切换离开时 flush 当前文件的未保存内容到草稿（重启后按确认状态恢复的兜底）
export const flushSessionDraft = (ws: WorkspaceSession): void => {
  if (!ws.history.isDirty) return;
  const file = ws.files[ws.currentFileIndex];
  if (!file) return;
  try {
    localStorage.setItem(sessionDraftKey(ws, file.name), JSON.stringify({
      fileName: file.name,
      blocks: ws.history.blocks,
      blankLinesBefore: ws.blankLinesBefore,
      trailingBlankLines: ws.trailingBlankLines,
      timestamp: Date.now(),
    }));
  } catch (err) {
    console.error('[workspace-registry] flush draft failed:', err);
  }
};

// --- 会话作用域键：草稿/编辑位置按 工作区+文件名 隔离，杜绝跨工作区同名文件碰撞 ---
export const sessionDraftKey = (ws: WorkspaceSession, fileName: string): string => `draft_${ws.id}_${fileName}`;
export const sessionPosKey = (ws: WorkspaceSession, fileName: string): string => `editor_pos_${ws.id}_${fileName}`;

// 跨工作区重复打开检查：仅比对各会话【当前聚焦文件】的规范化 fullPath
// （files[] 为目录全量列表，成员≠"被打开"；持有语义 = currentFileIndex 指向的文件）
export const findWorkspaceHoldingFile = (
  manager: WorkspaceManager,
  fullPath: string,
  excludeId?: string,
): WorkspaceSession | null => {
  const norm = normalizePath(fullPath || '');
  if (!norm) return null;
  for (const ws of manager.workspaces) {
    if (ws.id === excludeId) continue;
    const f = ws.files[ws.currentFileIndex];
    if (!f) continue;
    const fp = (f as any).fullPath;
    if (fp && normalizePath(fp) === norm) return ws;
  }
  return null;
};

// 浅比较：镜像恢复 React setState 的 bail-out 语义（值未变则不重渲染）
const shallowEqual = (a: SessionSnapshot, b: SessionSnapshot): boolean =>
  a.blocks === b.blocks &&
  a.isDirty === b.isDirty &&
  a.canUndo === b.canUndo &&
  a.canRedo === b.canRedo &&
  a.files === b.files &&
  a.currentFileIndex === b.currentFileIndex &&
  a.blankLinesBefore === b.blankLinesBefore &&
  a.trailingBlankLines === b.trailingBlankLines &&
  a.lastFocusedIndex === b.lastFocusedIndex &&
  a.directoryPath === b.directoryPath &&
  a.directoryName === b.directoryName &&
  a.isRestorable === b.isRestorable &&
  a.autoSelectIndex === b.autoSelectIndex;

// 镜像 hook：订阅活动会话，同步为 React state（切换工作区 = 换订阅对象，一次渲染）
export const useSessionMirror = (session: WorkspaceSession): SessionSnapshot => {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => snapshotOf(session));

  useEffect(() => {
    const sync = () => {
      const next = snapshotOf(session);
      setSnapshot(prev => (shallowEqual(prev, next) ? prev : next));
    };
    sync();
    return session.subscribe(sync);
  }, [session]);

  return snapshot;
};
