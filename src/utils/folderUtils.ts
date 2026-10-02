export const GLOBAL_SENTINEL = '__global__';

export const normalizePath = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();

export const isSamePath = (a: string, b: string): boolean => normalizePath(a) === normalizePath(b);

export const parentPathOf = (path: string): string => path.replace(/[/\\][^/\\]*$/, '');

export const isPathWithin = (path: string, ancestor: string): boolean => {
  if (!ancestor) return false;
  let cur = path;
  while (true) {
    if (cur === ancestor) return true;
    const next = parentPathOf(cur);
    if (!next || next === cur) return false;
    cur = next;
  }
};

export const resolveEffectiveProfileId = (
  folderProfileMap: Record<string, string> | undefined,
  dirPath: string | undefined,
  activeParserProfileId: string | undefined,
): string | undefined => {
  let cur = dirPath;
  while (cur) {
    const bound = folderProfileMap?.[cur];
    if (bound === GLOBAL_SENTINEL) return activeParserProfileId;
    if (bound) return bound;
    const next = parentPathOf(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return activeParserProfileId;
};

let confirmResolver: ((value: boolean) => void) | null = null;

export const requestUserConfirm = (
  title: string,
  message: string,
  variant: 'danger' | 'primary' | 'warning' = 'warning',
  confirmLabel?: string,
  cancelLabel?: string,
): Promise<boolean> => {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    window.dispatchEvent(new CustomEvent('app-modal-confirm', {
      detail: { title, message, variant, confirmLabel, cancelLabel },
    }));
  });
};

export const resolveUserConfirm = (value: boolean) => {
  if (confirmResolver) {
    confirmResolver(value);
    confirmResolver = null;
  }
};