import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memoryStore = new Map<string, string>();
const STORAGE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}atherium-storage.json`
  : null;
let fileStoreCache: Record<string, string> | null = null;
let fileStorePromise: Promise<Record<string, string>> | null = null;
const WEB_BLOB_DATABASE_NAME = 'atherium-web-assets';
const WEB_BLOB_STORE_NAME = 'files';
let webBlobDbPromise: Promise<IDBDatabase | null> | null = null;

function canUseLocalStorage() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function canUseIndexedDb() {
  return Platform.OS === 'web' && typeof indexedDB !== 'undefined';
}

async function openWebBlobDatabase() {
  if (!canUseIndexedDb()) {
    return null;
  }

  if (!webBlobDbPromise) {
    webBlobDbPromise = new Promise((resolve) => {
      const request = indexedDB.open(WEB_BLOB_DATABASE_NAME, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(WEB_BLOB_STORE_NAME)) {
          database.createObjectStore(WEB_BLOB_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  }

  return webBlobDbPromise;
}

export async function saveWebBlob(key: string, blob: Blob) {
  const database = await openWebBlobDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(WEB_BLOB_STORE_NAME, 'readwrite');
    transaction.objectStore(WEB_BLOB_STORE_NAME).put(blob, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function getWebBlob(key: string) {
  const database = await openWebBlobDatabase();
  if (!database) {
    return null;
  }

  return await new Promise<Blob | null>((resolve) => {
    const transaction = database.transaction(WEB_BLOB_STORE_NAME, 'readonly');
    const request = transaction.objectStore(WEB_BLOB_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => resolve(null);
  });
}

export async function deleteWebBlob(key: string) {
  const database = await openWebBlobDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(WEB_BLOB_STORE_NAME, 'readwrite');
    transaction.objectStore(WEB_BLOB_STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

async function readFileStore() {
  if (Platform.OS === 'web' || !STORAGE_FILE_URI) {
    return {};
  }

  if (fileStoreCache) {
    return fileStoreCache;
  }

  if (!fileStorePromise) {
    fileStorePromise = (async () => {
      try {
        const info = await FileSystem.getInfoAsync(STORAGE_FILE_URI);
        if (!info.exists) {
          fileStoreCache = {};
          return fileStoreCache;
        }

        const raw = await FileSystem.readAsStringAsync(STORAGE_FILE_URI);
        fileStoreCache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
        return fileStoreCache;
      } catch {
        fileStoreCache = {};
        return fileStoreCache;
      } finally {
        fileStorePromise = null;
      }
    })();
  }

  return fileStorePromise;
}

async function writeFileStore(nextStore: Record<string, string>) {
  if (Platform.OS === 'web' || !STORAGE_FILE_URI) {
    return;
  }

  fileStoreCache = nextStore;

  try {
    await FileSystem.writeAsStringAsync(STORAGE_FILE_URI, JSON.stringify(nextStore));
  } catch {
    Object.entries(nextStore).forEach(([key, value]) => {
      memoryStore.set(key, value);
    });
  }
}

export async function getItem(key: string) {
  if (canUseLocalStorage()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }

  try {
    const fileStore = await readFileStore();
    if (typeof fileStore[key] === 'string') {
      return fileStore[key];
    }
  } catch {
    const memoryValue = memoryStore.get(key);
    if (memoryValue !== undefined) {
      return memoryValue;
    }
  }

  try {
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue !== null) {
      return secureValue;
    }
  } catch {
    return memoryStore.get(key) ?? null;
  }

  return memoryStore.get(key) ?? null;
}

export async function setItem(key: string, value: string) {
  if (canUseLocalStorage()) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      memoryStore.set(key, value);
      return;
    }
  }

  memoryStore.set(key, value);

  const fileStore = await readFileStore();
  fileStore[key] = value;
  await writeFileStore(fileStore);

  try {
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

export async function deleteItem(key: string) {
  if (canUseLocalStorage()) {
    try {
      window.localStorage.removeItem(key);
      return;
    } catch {
      memoryStore.delete(key);
      return;
    }
  }

  memoryStore.delete(key);

  const fileStore = await readFileStore();
  delete fileStore[key];
  await writeFileStore(fileStore);

  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
}

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setJson<T>(key: string, value: T) {
  await setItem(key, JSON.stringify(value));
}
