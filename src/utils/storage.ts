import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memoryStore = new Map<string, string>();

function canUseLocalStorage() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
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
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
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

  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memoryStore.set(key, value);
  }
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

  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    memoryStore.delete(key);
  }
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
