import { get, set } from 'idb-keyval';

const HANDLE_KEY = 'lastDirectoryHandle';
const LAST_FILE_KEY = 'lastActiveFile';

export const saveDirectoryHandle = async (handle: FileSystemDirectoryHandle) => {
  await set(HANDLE_KEY, handle);
};

export const getDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | undefined> => {
  return await get(HANDLE_KEY);
};

export const saveLastActiveFile = (fileName: string) => {
  localStorage.setItem(LAST_FILE_KEY, fileName);
};

export const getLastActiveFile = (): string | null => {
  return localStorage.getItem(LAST_FILE_KEY);
};

export const verifyPermission = async (fileHandle: FileSystemHandle, readWrite: boolean = false): Promise<boolean> => {
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  // Cast to any because standard TS types might not include File System Access API methods yet
  const handle = fileHandle as any;
  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await handle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
};
