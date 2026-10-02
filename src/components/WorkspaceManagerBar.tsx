import React, { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from '../contexts/AppContext';
import { MAX_WORKSPACES, WorkspaceManager, WorkspaceSession } from '../workspace/workspaceStore';

const INLINE_SLOTS = 3;
const PANEL_ROWS = 3;
const PANEL_COLS = 3;

interface ChipItem {
  key: string;
  ws: WorkspaceSession | null;   // null = 幽灵占位格（非交互）
  pinned: boolean;
  realIndex: number;             // 幽灵格为 -1
}

export const WorkspaceManagerBar: React.FC<{
  manager: WorkspaceManager;
  onCreate: () => void;
  onSwitch: (id: string) => void;
  onCloseRequest: (ws: WorkspaceSession) => void;
}> = ({ manager, onCreate, onSwitch, onCloseRequest }) => {
  const { t } = useTranslation();
  const [, setRegistryVersion] = useState(0);
  const [, setDotTick] = useState(0);
  const dotStateRef = useRef<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef(0);

  // 注册表变更（新建/关闭/切换/排序）驱动重渲染
  useEffect(() => manager.subscribe(() => setRegistryVersion(v => v + 1)), [manager]);

  const workspaces = manager.workspaces;

  // 圆点状态实时性：仅在圆点状态翻转时重渲染（击键零开销）
  useEffect(() => {
    const unsubs = workspaces.map(ws => ws.subscribe(() => {
      const key = `${ws.history.isDirty}-${ws.files.length > 0 && ws.currentFileIndex >= 0}`;
      if (dotStateRef.current[ws.id] !== key) {
        dotStateRef.current[ws.id] = key;
        setDotTick(v => v + 1);
      }
    }));
    return () => unsubs.forEach(u => u());
  }, [workspaces]);

  const activeId = manager.activeId;

  // 显示模型：置顶活动副本固定首位 + 全部原位置保留（含活动原件）
  const slots: ChipItem[] = [];
  if (activeId) {
    const activeWs = workspaces.find(w => w.id === activeId);
    if (activeWs) {
      slots.push({ key: `pin-${activeWs.id}`, ws: activeWs, pinned: true, realIndex: workspaces.indexOf(activeWs) });
    }
  }
  workspaces.forEach((ws, realIndex) => {
    slots.push({ key: ws.id === activeId ? `orig-${ws.id}` : ws.id, ws, pinned: false, realIndex });
  });

  // --- Pointer 自实现拖拽排序（不受 tauri dragDropEnabled 的 HTML5 DnD 拦截影响） ---
  const sortRef = useRef<{ fromReal: number; moved: boolean } | null>(null);
  const [sortOverReal, setSortOverReal] = useState<number | null>(null);

  const beginSort = (item: ChipItem) => {
    if (item.pinned) return;
    sortRef.current = { fromReal: item.realIndex, moved: false };
  };

  const chipMouseEnter = (item: ChipItem) => {
    const st = sortRef.current;
    if (!st || item.ws === null || item.pinned || st.fromReal === item.realIndex) return;
    setSortOverReal(item.realIndex);
  };

  // 实时重排 effect：悬停目标变化即移动源 chip（Trello 式），并同步拖拽起点
  useEffect(() => {
    const st = sortRef.current;
    if (!st || sortOverReal === null || st.fromReal === sortOverReal) return;
    manager.move(st.fromReal, sortOverReal);
    st.fromReal = sortOverReal;
  }, [sortOverReal, manager]);

  // 抬起结束排序；若发生过实际移动则抑制紧随的误触点击
  useEffect(() => {
    const finish = () => {
      const st = sortRef.current;
      sortRef.current = null;
      setSortOverReal(null);
      if (st?.moved) suppressClickUntilRef.current = Date.now() + 150;
    };
    document.addEventListener('mouseup', finish);
    return () => document.removeEventListener('mouseup', finish);
  }, []);

  const renderGhost = (key: React.Key) => (
    <div key={key} className="mr-1.5 h-[30px] w-[96px] rounded-full border border-dashed border-gray-200 shrink-0" aria-hidden />
  );

  const renderChip = (item: ChipItem) => {
    const { ws, pinned } = item;
    if (!ws) {
      // 幽灵占位格：预留空槽位，非交互
      return <div className="h-[30px] w-[96px] rounded-full border border-dashed border-gray-200 shrink-0" aria-hidden />;
    }    const isActive = ws.id === activeId;
    const dirty = ws.history.isDirty;
    const hasOpenFile = ws.files.length > 0 && ws.currentFileIndex >= 0;
    // 脏=琥珀 / 有打开文件=绿 / 无打开文件=灰
    const dotClass = dirty ? 'bg-amber-400' : hasOpenFile ? 'bg-emerald-400' : 'bg-gray-300';
    const isSortTarget = sortOverReal === item.realIndex && !pinned;
    return (
      <div
        onMouseDown={(e) => { if (!pinned && e.button === 0) beginSort(item); }}
        onMouseEnter={() => chipMouseEnter(item)}
        onClick={() => {
          if (Date.now() < suppressClickUntilRef.current) return;
          onSwitch(ws.id);
        }}
        title={`${ws.name}${dirty ? ' •' : ''}`}
        className={`flex items-center gap-1 pl-2 pr-1 h-[30px] w-[96px] rounded-full text-xs cursor-pointer select-none transition-colors border shrink-0 ${
          isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
            : isSortTarget ? 'bg-blue-100 border-blue-300 text-blue-700'
            : 'bg-gray-50 text-gray-600 border-transparent hover:bg-gray-200/70'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="flex-1 min-w-0 truncate font-medium">{ws.name}</span>
        {/* 删除按钮：置顶副本可见但禁用（灰化）；原位正常 */}
        <button
          disabled={pinned}
          onClick={(e) => { e.stopPropagation(); onCloseRequest(ws); }}
          className={`shrink-0 rounded-full p-0.5 transition-opacity ${pinned ? 'text-white/40 cursor-not-allowed' : isActive ? 'text-white/80 opacity-80 hover:bg-white/20 hover:opacity-100' : 'opacity-40 hover:bg-gray-300 hover:opacity-100'}`}
          title={pinned ? undefined : t('close_workspace')}
        >
          <X size={11} />
        </button>
      </div>
    );
  };

  // 展开面板：固定 3 行 × 3 列（含置顶副本共 9 格），不足处以幽灵格填充，尺寸恒定
  const panelCells: ChipItem[] = [...slots];
  while (panelCells.length < MAX_WORKSPACES + 1) panelCells.push({ key: `ghost`, ws: null, pinned: false, realIndex: -1 });

  return (
    <div
      className="fixed bottom-6 left-6 z-40 flex flex-col items-start"
      onMouseEnter={() => { if (collapseTimerRef.current) { clearTimeout(collapseTimerRef.current); collapseTimerRef.current = null; } setExpanded(true); }}
      onMouseLeave={() => {
        collapseTimerRef.current = window.setTimeout(() => setExpanded(false), 150);
      }}
    >
      {/* 向上展开面板：定尺寸 3 行 × 3 列；行首对齐占位列对准下方 [+新建] 按钮列 */}
      <div
        className={`mb-1 w-[400px] bg-white border border-gray-300 shadow-2xl rounded-xl px-3 py-2 flex flex-col gap-1.5 ${expanded ? '' : 'hidden'}`}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        {Array.from({ length: PANEL_ROWS }).map((_, r) => (
          <div key={r} className="flex items-center">
            <div className="w-7 mr-2 shrink-0" />
            {Array.from({ length: PANEL_COLS }).map((_, c) => {
              const idx = r * PANEL_COLS + c;
              const item = panelCells[idx];
              return item
                ? <div key={`${item.key}-${idx}`} className="mr-1.5">{renderChip(item)}</div>
                : renderGhost(`g-${idx}`);
            })}
          </div>
        ))}
      </div>

      {/* 折叠胶囊条：[+新建] + 前 3 槽位（不足补幽灵）+ 固定徽标位 */}
      <div
        className="w-[400px] bg-white border border-gray-300 shadow-2xl rounded-full pl-3 pr-3 py-2 flex items-center"
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <button
          onClick={() => {
            onCreate();
            // 新建导致开始折叠时自动展开一次（无需移开再挪回鼠标）
            const totalSlots = manager.workspaces.length + 1;
            if (totalSlots > INLINE_SLOTS) setExpanded(true);
          }}
          disabled={workspaces.length >= MAX_WORKSPACES}
          title={workspaces.length < MAX_WORKSPACES ? t('new_workspace') : t('workspace_limit_reached')}
          className={`shrink-0 w-7 h-7 mr-2 rounded-full flex items-center justify-center transition-colors ${workspaces.length < MAX_WORKSPACES ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`}
        >
          <Plus size={15} />
        </button>
        <div className="flex items-center">
          {slots.slice(0, INLINE_SLOTS).map((item, i) => (
            <div key={item.key} className="mr-1.5">{renderChip(item)}</div>
          ))}
          {slots.length <= INLINE_SLOTS &&
            Array.from({ length: INLINE_SLOTS - slots.length }).map((_, i) => (
              <div key={`pill-ghost-${i}`} className="mr-1.5">{renderChip({ key: `pill-ghost-${i}`, ws: null, pinned: false, realIndex: -1 })}</div>
            ))}
        </div>
        {/* 徽标固定位：有折叠显示 +N，否则空占位（宽度不变） */}
        <div className="ml-auto w-10 text-center text-xs font-medium text-blue-600 select-none">
          {slots.length > INLINE_SLOTS ? `+${slots.length - INLINE_SLOTS}` : ''}
        </div>
      </div>
    </div>
  );
};
