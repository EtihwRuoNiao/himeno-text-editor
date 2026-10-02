import { useCallback, useEffect, useRef, useState } from 'react';
import { readAvatarBlob, scanAssistants } from '../services/assetService';
import type { AssistantAsset, AssetRootStatus } from '../types/assistant';
import builtinAvatarUrl from '../assets/customization/files/_template/avatar.png?url';

/** 内置兜底助手 id：磁盘上若存在同名助手，则以磁盘版本为准 */
export const BUILTIN_ASSISTANT_ID = 'default';

/**
 * 内置助手：保证「一个助手资源都没有」时界面不空、功能可发现。
 * 它不写入磁盘，也不可被删除；磁盘上有同 id 目录时会被磁盘版本覆盖。
 */
const BUILTIN_ASSISTANT: AssistantAsset = {
  id: BUILTIN_ASSISTANT_ID,
  dir: '',
  displayName: 'Assistant',
  symbol: '',
  variant: 'gray',
  durationMs: 3000,
  fit: 'cover',
  files: [],
  quotes: {},
  builtin: true,
  builtinAvatar: builtinAvatarUrl,
};

export interface UseAssistantsResult {
  status: AssetRootStatus;
  root?: string;
  error?: string;
  loading: boolean;
  /** 内置助手 + 磁盘助手（按 id 去重，磁盘优先） */
  assistants: AssistantAsset[];
  /** id → objectURL（内置助手指向随包资源） */
  avatarUrls: Record<string, string>;
  /** 重新扫描磁盘并重建头像 URL */
  refresh: () => Promise<void>;
}

/**
 * 扫描 <exe>/assets/assistants 并管理头像 objectURL 的生命周期。
 * active 由 false → true 时重新扫描（对应"重新打开设置面板"）。
 */
export function useAssistants(active: boolean): UseAssistantsResult {
  const [state, setState] = useState<Omit<UseAssistantsResult, 'refresh'>>({
    status: 'ok',
    loading: false,
    assistants: [BUILTIN_ASSISTANT],
    avatarUrls: { [BUILTIN_ASSISTANT_ID]: builtinAvatarUrl },
  });
  const urlsRef = useRef<string[]>([]);
  const aliveRef = useRef(false);
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setState(s => ({ ...s, loading: true }));

    const res = await scanAssistants();

    const avatarUrls: Record<string, string> = { [BUILTIN_ASSISTANT_ID]: builtinAvatarUrl };
    const created: string[] = [];
    for (const a of res.assistants) {
      const blob = await readAvatarBlob(a);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      avatarUrls[a.id] = url;
      created.push(url);
    }

    // 面板已关闭，或已被更新的扫描取代：丢弃本次结果并立即回收
    if (!aliveRef.current || reqId !== reqIdRef.current) {
      created.forEach(URL.revokeObjectURL);
      return;
    }

    urlsRef.current.forEach(URL.revokeObjectURL);
    urlsRef.current = created;

    const byId = new Map<string, AssistantAsset>();
    byId.set(BUILTIN_ASSISTANT_ID, BUILTIN_ASSISTANT);
    for (const a of res.assistants) byId.set(a.id, a);

    setState({
      status: res.status,
      root: res.root,
      error: res.error,
      loading: false,
      assistants: [...byId.values()],
      avatarUrls,
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    aliveRef.current = true;
    void refresh();
    return () => {
      aliveRef.current = false;
      reqIdRef.current++;   // 使仍在飞行的扫描结果失效
      urlsRef.current.forEach(URL.revokeObjectURL);
      urlsRef.current = [];
    };
  }, [active, refresh]);

  return { ...state, refresh };
}
