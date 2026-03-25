import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  importVideoFromSource,
  initializeDatabase,
  type DatabaseHandle,
  type VideoRow,
} from '@/src/db/database';

const COBALT_API_URL = 'https://api.cobalt.tools/api/json';
const YOUTUBE_DOWNLOAD_DIRECTORY = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}youtube-imports/`;

type CobaltPickerItem = {
  url?: string;
  type?: string;
  filename?: string;
};

type CobaltResponse = {
  status?: string;
  url?: string;
  text?: string;
  filename?: string;
  picker?: CobaltPickerItem[];
  error?: {
    code?: string;
    context?: unknown;
  };
};

function sanitizeFilename(filename: string) {
  const normalized = filename
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return `youtube-${Date.now()}.mp4`;
  }

  return /\.(mp4|m4v|mov|webm)$/i.test(normalized) ? normalized : `${normalized}.mp4`;
}

function deriveFilename(sourceUrl: string, providedFilename?: string | null) {
  if (providedFilename?.trim()) {
    return sanitizeFilename(providedFilename.trim());
  }

  try {
    const url = new URL(sourceUrl);
    const segment = url.pathname.split('/').filter(Boolean).pop();
    if (segment) {
      return sanitizeFilename(segment);
    }
  } catch {
    // Ignore malformed URL and fall back to a timestamp filename.
  }

  return `youtube-${Date.now()}.mp4`;
}

function resolveDirectVideo(payload: CobaltResponse) {
  if (payload.url) {
    return {
      url: payload.url,
      filename: deriveFilename(payload.url, payload.filename),
    };
  }

  if (Array.isArray(payload.picker) && payload.picker.length > 0) {
    const preferred =
      payload.picker.find((item) => item.type?.includes('mp4') && item.url) ??
      payload.picker.find((item) => item.url);

    if (preferred?.url) {
      return {
        url: preferred.url,
        filename: deriveFilename(preferred.url, preferred.filename ?? payload.filename),
      };
    }
  }

  const errorText =
    payload.text ||
    payload.error?.code ||
    'Cobalt не повернув пряме посилання на відео.';
  throw new Error(errorText);
}

async function requestCobaltDownload(youtubeUrl: string) {
  const response = await fetch(COBALT_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: youtubeUrl,
      vCodec: 'h264',
    }),
  });

  const payload = (await response.json()) as CobaltResponse;

  if (!response.ok || payload.status === 'error') {
    const message =
      payload.text ||
      payload.error?.code ||
      `Cobalt responded with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return resolveDirectVideo(payload);
}

export async function downloadYouTubeVideo(
  db: DatabaseHandle,
  youtubeUrl: string,
  options?: {
    playlistName?: string;
    playlistIcon?: string | null;
    onProgress?: (value: number) => void;
  }
) {
  const trimmedUrl = youtubeUrl.trim();

  if (!trimmedUrl) {
    throw new Error('Вставте коректне YouTube-посилання.');
  }

  if (Platform.OS === 'web') {
    throw new Error('YouTube download доступний тільки на iOS та Android.');
  }

  await initializeDatabase(db);

  const resolved = await requestCobaltDownload(trimmedUrl);
  await FileSystem.makeDirectoryAsync(YOUTUBE_DOWNLOAD_DIRECTORY, { intermediates: true });

  const temporaryUri = `${YOUTUBE_DOWNLOAD_DIRECTORY}${Date.now()}-${resolved.filename}`;
  const resumable = FileSystem.createDownloadResumable(
    resolved.url,
    temporaryUri,
    {},
    (progressEvent) => {
      const total = progressEvent.totalBytesExpectedToWrite || 0;
      const written = progressEvent.totalBytesWritten || 0;
      const progress = total > 0 ? written / total : 0;
      options?.onProgress?.(progress);
    }
  );

  try {
    options?.onProgress?.(0);
    const result = await resumable.downloadAsync();
    const imported = await importVideoFromSource(
      db,
      {
        uri: result?.uri ?? temporaryUri,
        name: resolved.filename,
      },
      {
        playlistName: options?.playlistName?.trim() || 'YouTube',
        playlistIcon: options?.playlistIcon?.trim() || 'logo-youtube',
      }
    );

    options?.onProgress?.(1);
    await FileSystem.deleteAsync(result?.uri ?? temporaryUri, { idempotent: true }).catch(() => undefined);
    return imported;
  } catch (error) {
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

export type YouTubeDownloadResult = VideoRow;
