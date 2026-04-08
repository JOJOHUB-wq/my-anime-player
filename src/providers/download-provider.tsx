import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DEFAULT_PLAYLIST_ICON,
  getVideoById,
  initializeDatabase,
  upsertRemoteEpisode,
  updateVideoDownloadState,
  type VideoRow,
} from '@/src/db/database';
import { useDatabaseContext } from '@/src/db/db-context';
import i18n from '@/src/i18n';

type DownloadState = {
  videoId: number;
  status: string;
  progress: number;
};

type DownloadRequest = {
  externalId: string;
  remoteUrl: string;
  headers?: Record<string, string>;
  seriesTitle: string;
  filename: string;
  episodeNumber?: number | null;
  thumbnailUri?: string | null;
  playlistIcon?: string | null;
};

type DownloadContextValue = {
  activeDownloads: Record<string, DownloadState>;
  downloadEpisode: (request: DownloadRequest) => Promise<VideoRow>;
  getDownloadState: (key: string) => DownloadState | null;
};

const DownloadContext = createContext<DownloadContextValue | null>(null);
const DOWNLOAD_DIRECTORY = `${FileSystem.documentDirectory ?? ''}downloads/`;

function sanitizeSegment(value: string) {
  const normalized = value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `episode-${Date.now()}.mp4`;
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const db = useDatabaseContext();
  const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadState>>({});
  const lastPersistRef = useRef<Record<string, number>>({});

  const getDownloadState = useCallback((key: string) => activeDownloads[key] ?? null, [activeDownloads]);

  const downloadEpisode = useCallback(async (request: DownloadRequest) => {
    await initializeDatabase(db);

    const video = await upsertRemoteEpisode(db, {
      externalId: request.externalId,
      remoteUrl: request.remoteUrl,
      seriesTitle: request.seriesTitle,
      filename: request.filename,
      episodeNumber: request.episodeNumber ?? null,
      thumbnailUri: request.thumbnailUri ?? null,
      playlistIcon: request.playlistIcon?.trim() || DEFAULT_PLAYLIST_ICON,
    });

    if (video.download_status === 'downloaded' && video.uri) {
      return video;
    }

    if (Platform.OS === 'web') {
      throw new Error(i18n.t('downloads.webUnavailable'));
    }

    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIRECTORY, { intermediates: true });

    // Ensure we are getting the actual media URL from the Kodik/iframe proxy, instead of downloading an iframe HTML response.
    const extractUrl = process.env.EXPO_PUBLIC_MEDIA_BACKEND_URL
      ? `${process.env.EXPO_PUBLIC_MEDIA_BACKEND_URL.replace(/\/+$/, '')}/extract`
      : 'https://217-60-245-84.sslip.io/api/media/extract';

    let directUrl = request.remoteUrl;
    try {
       const res = await fetch(extractUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: request.remoteUrl }),
       });
       if (res.ok) {
          const json = await res.json();
          if (json?.url) {
             directUrl = json.url;
          }
       }
    } catch {
       // Proceed with the raw URL if extraction fails
    }

    const isHls = directUrl.includes('.m3u8');
    const safeFilename = sanitizeSegment(request.filename).replace(/\.[^.]+$/, isHls ? '.m3u8' : '.mp4');
    const targetUri = `${DOWNLOAD_DIRECTORY}${Date.now()}-${safeFilename}`;

    await updateVideoDownloadState(db, video.id, {
      downloadStatus: 'queued',
      downloadProgress: 0,
      remoteUrl: directUrl,
    });

    setActiveDownloads((current) => ({
      ...current,
      [request.externalId]: {
        videoId: video.id,
        status: 'queued',
        progress: 0,
      },
    }));

    const resumable = FileSystem.createDownloadResumable(
      directUrl,
      targetUri,
      {
        headers: request.headers,
      },
      (progressEvent) => {
        const total = progressEvent.totalBytesExpectedToWrite || 0;
        const written = progressEvent.totalBytesWritten || 0;
        const progress = total > 0 ? written / total : 0;

        setActiveDownloads((current) => ({
          ...current,
          [request.externalId]: {
            videoId: video.id,
            status: 'downloading',
            progress,
          },
        }));

        const now = Date.now();
        if (!lastPersistRef.current[request.externalId] || now - lastPersistRef.current[request.externalId] >= 700) {
          lastPersistRef.current[request.externalId] = now;
          void updateVideoDownloadState(db, video.id, {
            downloadStatus: 'downloading',
            downloadProgress: progress,
            remoteUrl: request.remoteUrl,
          });
        }
      }
    );

    try {
      const result = await resumable.downloadAsync();
      const localUri = result?.uri ?? targetUri;

      await updateVideoDownloadState(db, video.id, {
        uri: localUri,
        remoteUrl: request.remoteUrl,
        downloadStatus: 'downloaded',
        downloadProgress: 1,
      });

      setActiveDownloads((current) => ({
        ...current,
        [request.externalId]: {
          videoId: video.id,
          status: 'downloaded',
          progress: 1,
        },
      }));
    } catch (error) {
      await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => undefined);
      await updateVideoDownloadState(db, video.id, {
        remoteUrl: request.remoteUrl,
        downloadStatus: 'failed',
        downloadProgress: 0,
      });

      setActiveDownloads((current) => ({
        ...current,
        [request.externalId]: {
          videoId: video.id,
          status: 'failed',
          progress: 0,
        },
      }));

      throw error;
    }

    return (await getVideoById(db, video.id)) as VideoRow;
  }, [db]);

  const value = useMemo<DownloadContextValue>(() => ({
    activeDownloads,
    downloadEpisode,
    getDownloadState,
  }), [activeDownloads, downloadEpisode, getDownloadState]);

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownloads() {
  const context = useContext(DownloadContext);

  if (!context) {
    throw new Error('useDownloads must be used inside DownloadProvider.');
  }

  return context;
}
