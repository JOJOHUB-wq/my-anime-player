import Constants from 'expo-constants';

const DEFAULT_BACKEND_URL = 'http://217.60.245.84:4010';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
};

function resolveBackendBaseUrl() {
  const envUrl =
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    Constants.expoConfig?.extra?.backendUrl ||
    Constants.expoConfig?.hostUri;

  if (typeof envUrl === 'string' && envUrl.startsWith('http')) {
    return envUrl.replace(/\/+$/, '');
  }

  return DEFAULT_BACKEND_URL;
}

export const BACKEND_BASE_URL = resolveBackendBaseUrl();

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const rawText = await response.text();
  let payload: unknown = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const payloadError =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : null;
    const message =
      payloadError ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
