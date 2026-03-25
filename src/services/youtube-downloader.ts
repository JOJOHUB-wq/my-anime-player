import * as FileSystem from 'expo-file-system/legacy';

import {
  importVideoFromSource,
  initializeDatabase,
  type DatabaseHandle,
  type VideoRow,
} from '@/src/db/database';
import i18n from '@/src/i18n';

const YOUTUBE_DOWNLOAD_DIRECTORY = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}youtube-imports/`;
const MEDIA_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_MEDIA_BACKEND_URL || 'http://217.60.245.84:3000/api';

type DownloadSource = {
  url: string;
  filename: string;
};

type YouTubeExtractResponse = {
  ok?: boolean;
  title?: string;
  url?: string;
  filename?: string;
  error?: string;
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
    // Ignore malformed URL and fall back to a generated filename.
  }

  return `youtube-${Date.now()}.mp4`;
}

async function requestBackendExtraction(youtubeUrl: string): Promise<DownloadSource> {
  const response = await fetch(`${MEDIA_BACKEND_BASE_URL}/youtube/extract`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: youtubeUrl }),
  });

  const payload = (await response.json()) as YouTubeExtractResponse;

  if (!response.ok || !payload.url) {
    throw new Error(payload.error || i18n.t('local.youtubeError'));
  }

  return {
    url: payload.url,
    filename: deriveFilename(payload.url, payload.filename || payload.title),
  };
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
    throw new Error(i18n.t('local.youtubeEmptyUrl'));
  }

  await initializeDatabase(db);
  await FileSystem.makeDirectoryAsync(YOUTUBE_DOWNLOAD_DIRECTORY, { intermediates: true });

  const resolved = await requestBackendExtraction(trimmedUrl);

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
    console.warn('YouTube download failed:', error);
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
    throw error instanceof Error ? error : new Error(i18n.t('local.youtubeError'));
  }
}

export type YouTubeDownloadResult = VideoRow;
