import type { DocumentPickerAsset } from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { getTheme } from '@/src/theme/tokens';
import {
  DownloadRecord,
  LibraryFolder,
  LibraryVideo,
} from '@/src/types/media';
import { parseMediaFilename } from '@/src/utils/parser';

type AppContextValue = {
  theme: ReturnType<typeof getTheme>;
  libraryFolders: LibraryFolder[];
  downloads: DownloadRecord[];
  libraryLoading: boolean;
  downloadsLoading: boolean;
  downloadSubmitting: boolean;
  libraryError: string | null;
  downloadsError: string | null;
  refreshLibrary: () => Promise<void>;
  refreshDownloads: () => Promise<void>;
  addDownload: (pickedAsset: DocumentPickerAsset) => Promise<boolean>;
  getLibraryFolder: (folderKey: string) => LibraryFolder | undefined;
  getLibraryVideo: (id: string) => LibraryVideo | undefined;
  getDownloadById: (id: string) => DownloadRecord | undefined;
  updateDownloadProgress: (id: string, watchedProgress: number) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
const IMPORTS_DIRECTORY = `${FileSystem.documentDirectory ?? ''}imports/`;
const IMPORT_MISC_FOLDER_TITLE = '📁 Інші імпортовані файли';
const DEFAULT_THEME = getTheme('blue');

type DownloadRow = {
  rowid: number;
  id: string;
  remote_url: string;
  local_path: string;
  filename: string;
  cleaned_title: string;
  watched_progress: number;
};

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashTitle(title: string) {
  let hash = 0;

  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function createFolderKey(title: string) {
  if (title === IMPORT_MISC_FOLDER_TITLE) {
    return 'folder-import-misc';
  }

  return `folder-${hashTitle(title)}`;
}

function sortLibraryVideos(videos: LibraryVideo[], kind: LibraryFolder['kind']) {
  return [...videos].sort((left, right) => {
    if (kind === 'camera') {
      return right.createdAt - left.createdAt;
    }

    if ((left.episodeNumber ?? 9999) !== (right.episodeNumber ?? 9999)) {
      return (left.episodeNumber ?? 9999) - (right.episodeNumber ?? 9999);
    }

    return left.cleanedTitle.localeCompare(right.cleanedTitle);
  });
}

function sortFolders(folders: LibraryFolder[]) {
  return [...folders].sort((left, right) => {
    if (left.kind === 'camera' && right.kind !== 'camera') {
      return -1;
    }

    if (right.kind === 'camera' && left.kind !== 'camera') {
      return 1;
    }

    return left.title.localeCompare(right.title);
  });
}

function sanitizeFilename(filename: string) {
  const safeName = filename
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!safeName) {
    return `import-${Date.now()}.mp4`;
  }

  return safeName.includes('.') ? safeName : `${safeName}.mp4`;
}

async function ensureImportsDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('Файлова директорія недоступна.');
  }

  await FileSystem.makeDirectoryAsync(IMPORTS_DIRECTORY, { intermediates: true });
}

function mapRowToDownloadRecord(row: DownloadRow): DownloadRecord {
  return {
    id: row.id,
    remoteUrl: row.remote_url,
    localPath: row.local_path,
    filename: row.filename,
    cleanedTitle: row.cleaned_title,
    watchedProgress: row.watched_progress,
  };
}

function buildLibraryFolders(rows: DownloadRow[]) {
  const folders = new Map<string, LibraryFolder>();

  for (const row of rows) {
    const parsed = parseMediaFilename(row.filename);
    const folderTitle = parsed.seriesTitle || IMPORT_MISC_FOLDER_TITLE;
    const folderKey = createFolderKey(folderTitle);
    const kind: LibraryFolder['kind'] =
      folderTitle === IMPORT_MISC_FOLDER_TITLE ? 'misc' : 'series';
    const video: LibraryVideo = {
      id: row.id,
      assetId: row.id,
      uri: row.local_path,
      filename: row.filename,
      displayTitle: parsed.episode ? `Епізод ${parsed.episode}` : parsed.cleanedTitle,
      cleanedTitle: row.cleaned_title || parsed.cleanedTitle,
      seriesTitle: folderTitle,
      episode: parsed.episode,
      episodeNumber: parsed.episodeNumber,
      albumTitle: 'Файли',
      durationSeconds: 0,
      createdAt: row.rowid,
      folderKey,
      watchedProgress: row.watched_progress,
    };

    const existingFolder = folders.get(folderKey) ?? {
      key: folderKey,
      title: folderTitle,
      kind,
      videos: [],
    };

    existingFolder.videos.push(video);
    folders.set(folderKey, existingFolder);
  }

  return sortFolders(
    [...folders.values()].map((folder) => ({
      ...folder,
      videos: sortLibraryVideos(folder.videos, folder.kind),
    }))
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>([]);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [downloadsLoading, setDownloadsLoading] = useState(true);
  const [downloadSubmitting, setDownloadSubmitting] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [downloadsError, setDownloadsError] = useState<string | null>(null);

  const refreshImportedFiles = useCallback(async () => {
    setLibraryLoading(true);
    setDownloadsLoading(true);
    setLibraryError(null);
    setDownloadsError(null);

    try {
      const rows = await db.getAllAsync<DownloadRow>(
        'SELECT rowid, id, remote_url, local_path, filename, cleaned_title, watched_progress FROM downloads ORDER BY rowid DESC'
      );

      setDownloads(rows.map(mapRowToDownloadRecord));
      setLibraryFolders(buildLibraryFolders(rows));
    } catch {
      setDownloads([]);
      setLibraryFolders([]);
      setLibraryError('Не вдалося завантажити імпортовану бібліотеку.');
      setDownloadsError('Не вдалося завантажити список завантажень.');
    } finally {
      setLibraryLoading(false);
      setDownloadsLoading(false);
    }
  }, [db]);

  const refreshLibrary = useCallback(async () => {
    await refreshImportedFiles();
  }, [refreshImportedFiles]);

  const refreshDownloads = useCallback(async () => {
    await refreshImportedFiles();
  }, [refreshImportedFiles]);

  const addDownload = useCallback(
    async (pickedAsset: DocumentPickerAsset) => {
      setDownloadSubmitting(true);
      setDownloadsError(null);

      try {
        await ensureImportsDirectory();
        const filename = sanitizeFilename(pickedAsset.name);
        const localPath = `${IMPORTS_DIRECTORY}${Date.now()}-${filename}`;
        await FileSystem.copyAsync({
          from: pickedAsset.uri,
          to: localPath,
        });
        const parsed = parseMediaFilename(filename);

        await db.runAsync(
          'INSERT INTO downloads (id, remote_url, local_path, filename, cleaned_title, watched_progress) VALUES (?, ?, ?, ?, ?, ?)',
          createId(),
          pickedAsset.uri,
          localPath,
          filename,
          parsed.cleanedTitle,
          0
        );

        await refreshImportedFiles();
        return true;
      } catch {
        setDownloadsError('Не вдалося імпортувати вибраний файл.');
        return false;
      } finally {
        setDownloadSubmitting(false);
      }
    },
    [db, refreshImportedFiles]
  );

  const updateDownloadProgress = useCallback(
    async (id: string, watchedProgress: number) => {
      await db.runAsync(
        'UPDATE downloads SET watched_progress = ? WHERE id = ?',
        watchedProgress,
        id
      );

      setDownloads((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                watchedProgress,
              }
            : item
        )
      );
    },
    [db]
  );

  useEffect(() => {
    void refreshImportedFiles();
  }, [refreshImportedFiles]);

  const libraryFolderMap = useMemo(
    () => new Map(libraryFolders.map((folder) => [folder.key, folder])),
    [libraryFolders]
  );
  const libraryVideoMap = useMemo(
    () =>
      new Map(
        libraryFolders.flatMap((folder) => folder.videos.map((video) => [video.id, video] as const))
      ),
    [libraryFolders]
  );
  const downloadMap = useMemo(
    () => new Map(downloads.map((item) => [item.id, item])),
    [downloads]
  );

  return (
    <AppContext.Provider
      value={{
        theme: DEFAULT_THEME,
        libraryFolders,
        downloads,
        libraryLoading,
        downloadsLoading,
        downloadSubmitting,
        libraryError,
        downloadsError,
        refreshLibrary,
        refreshDownloads,
        addDownload,
        getLibraryFolder: (folderKey) => libraryFolderMap.get(folderKey),
        getLibraryVideo: (id) => libraryVideoMap.get(id),
        getDownloadById: (id) => downloadMap.get(id),
        updateDownloadProgress,
      }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside AppProvider.');
  }

  return context;
}
