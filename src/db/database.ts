import type { DocumentPickerAsset } from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { deleteWebBlob, getJson, getWebBlob, saveWebBlob, setJson } from '@/src/utils/storage';

export type PlaylistRow = {
  id: number;
  name: string;
  icon: string;
  is_pinned: number;
  videoCount: number;
  thumbnailUri: string | null;
};

export type PlaylistDetailRow = {
  id: number;
  name: string;
  icon: string;
  is_pinned: number;
};

export type VideoRow = {
  id: number;
  uri: string;
  filename: string;
  thumbnail_uri: string | null;
  playlist_id: number;
  episode_num: number | null;
  progress: number;
  duration: number;
  is_pinned: number;
  external_id: string | null;
  remote_url: string | null;
  download_status: string;
  download_progress: number;
};

export type DownloadRow = VideoRow & {
  playlist_name: string;
  playlist_icon: string;
};

export type ParsedFilename = {
  seriesTitle: string;
  episode: number;
  episodeNumber: number | null;
  cleanFilename: string;
  cleanedTitle: string;
};

export type DatabaseHandle = SQLiteDatabase | null;

type WebDatabaseState = {
  playlists: PlaylistDetailRow[];
  videos: VideoRow[];
  settings: Record<string, string>;
  lastPlaylistId: number;
  lastVideoId: number;
};

export type ImportVideoSource = {
  uri: string;
  name: string;
  file?: Blob | null;
};

const VIDEO_STORAGE_DIRECTORY = `${FileSystem.documentDirectory ?? ''}videos/`;
export const DEFAULT_PLAYLIST_ICON = 'folder-open-outline';
const LEGACY_VIDEO_COLUMNS = ['id', 'uri', 'title', 'duration', 'currentTime'];
const REQUIRED_VIDEO_COLUMNS = [
  'id',
  'uri',
  'filename',
  'thumbnail_uri',
  'playlist_id',
  'episode_num',
  'progress',
  'duration',
  'is_pinned',
  'external_id',
  'remote_url',
  'download_status',
  'download_progress',
];
const REQUIRED_PLAYLIST_COLUMNS = ['id', 'name', 'icon', 'is_pinned'];
const SETTINGS_TABLE_COLUMNS = ['key', 'value'];
const WEB_DATABASE_KEY = '@atherium-web-database-v1';
const WEB_BLOB_PREFIX = 'blob-ref:';
const webObjectUrlCache = new Map<string, string>();

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeFilename(filename: string) {
  const normalized = filename
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return `video-${Date.now()}.mp4`;
  }

  return normalized.includes('.') ? normalized : `${normalized}.mp4`;
}

function toNumber(value: unknown, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function toNullableEpisode(value: unknown) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null;
}

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toDownloadStatus(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : 'none';
}

function isWebDatabase(db: DatabaseHandle): db is null {
  return Platform.OS === 'web' || !db;
}

function normalizeWebState(raw: Partial<WebDatabaseState> | null | undefined): WebDatabaseState {
  const playlists = Array.isArray(raw?.playlists)
    ? raw.playlists
        .map((playlist) => ({
          id: toNumber(playlist.id),
          name: typeof playlist.name === 'string' && playlist.name.trim() ? playlist.name.trim() : 'Без назви',
          icon:
            typeof playlist.icon === 'string' && playlist.icon.trim()
              ? playlist.icon.trim()
              : DEFAULT_PLAYLIST_ICON,
          is_pinned: toNumber(playlist.is_pinned, 0),
        }))
        .filter((playlist) => playlist.id > 0)
    : [];

  const videos = Array.isArray(raw?.videos)
    ? raw.videos
        .map((video) => ({
          id: toNumber(video.id),
          uri: typeof video.uri === 'string' ? video.uri : '',
          filename:
            typeof video.filename === 'string' && video.filename.trim()
              ? video.filename
              : `video-${Date.now()}.mp4`,
          thumbnail_uri: toNullableString(video.thumbnail_uri),
          playlist_id: toNumber(video.playlist_id),
          episode_num: toNullableEpisode(video.episode_num),
          progress: toNumber(video.progress, 0),
          duration: toNumber(video.duration, 0),
          is_pinned: toNumber(video.is_pinned, 0),
          external_id: toNullableString(video.external_id),
          remote_url: toNullableString(video.remote_url),
          download_status: toDownloadStatus(video.download_status),
          download_progress: toNumber(video.download_progress, 0),
        }))
        .filter((video) => video.id > 0)
    : [];

  const settings =
    raw?.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)
      ? Object.fromEntries(
          Object.entries(raw.settings).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)])
        )
      : {};

  const lastPlaylistId = Math.max(
    toNumber(raw?.lastPlaylistId, 0),
    ...playlists.map((playlist) => playlist.id),
    0
  );
  const lastVideoId = Math.max(toNumber(raw?.lastVideoId, 0), ...videos.map((video) => video.id), 0);

  return {
    playlists,
    videos,
    settings,
    lastPlaylistId,
    lastVideoId,
  };
}

async function loadWebDatabaseState() {
  const raw = await getJson<Partial<WebDatabaseState> | null>(WEB_DATABASE_KEY, null);
  return normalizeWebState(raw);
}

async function saveWebDatabaseState(state: WebDatabaseState) {
  await setJson(WEB_DATABASE_KEY, state);
}

async function mutateWebDatabase<T>(mutator: (state: WebDatabaseState) => T | Promise<T>) {
  const state = await loadWebDatabaseState();
  const result = await mutator(state);
  state.lastPlaylistId = Math.max(state.lastPlaylistId, ...state.playlists.map((playlist) => playlist.id), 0);
  state.lastVideoId = Math.max(state.lastVideoId, ...state.videos.map((video) => video.id), 0);
  await saveWebDatabaseState(state);
  return result;
}

function sortPlaylists(rows: PlaylistDetailRow[]) {
  return [...rows].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) {
      return right.is_pinned - left.is_pinned;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

function sortVideos(rows: VideoRow[]) {
  return [...rows].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) {
      return right.is_pinned - left.is_pinned;
    }

    const leftEpisode = left.episode_num ?? Number.MAX_SAFE_INTEGER;
    const rightEpisode = right.episode_num ?? Number.MAX_SAFE_INTEGER;

    if (leftEpisode !== rightEpisode) {
      return leftEpisode - rightEpisode;
    }

    return left.filename.localeCompare(right.filename, undefined, { sensitivity: 'base' });
  });
}

function isWebBlobRef(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(WEB_BLOB_PREFIX);
}

function buildWebBlobRef(type: 'video' | 'thumbnail', id: number) {
  return `${WEB_BLOB_PREFIX}${type}:${id}`;
}

function extractWebBlobKey(value: string) {
  return value.startsWith(WEB_BLOB_PREFIX) ? value.slice(WEB_BLOB_PREFIX.length) : value;
}

function revokeCachedWebBlobUrl(reference: string | null | undefined) {
  if (!isWebBlobRef(reference)) {
    return;
  }

  const blobKey = extractWebBlobKey(reference as string);
  const cached = webObjectUrlCache.get(blobKey);
  if (cached) {
    URL.revokeObjectURL(cached);
    webObjectUrlCache.delete(blobKey);
  }
}

async function resolveWebBlobUrl(reference: string | null | undefined) {
  if (!isWebBlobRef(reference)) {
    return reference ?? null;
  }

  const blobKey = extractWebBlobKey(reference as string);
  const cached = webObjectUrlCache.get(blobKey);
  if (cached) {
    return cached;
  }

  const blob = await getWebBlob(blobKey);
  if (!blob) {
    return null;
  }

  const objectUrl = URL.createObjectURL(blob);
  webObjectUrlCache.set(blobKey, objectUrl);
  return objectUrl;
}

async function hydrateWebVideo(video: VideoRow): Promise<VideoRow> {
  const [uri, thumbnailUri] = await Promise.all([
    resolveWebBlobUrl(video.uri),
    resolveWebBlobUrl(video.thumbnail_uri),
  ]);

  return {
    ...video,
    uri: uri ?? '',
    thumbnail_uri: thumbnailUri,
  };
}

async function webGetOrCreatePlaylistId(state: WebDatabaseState, name: string, icon = DEFAULT_PLAYLIST_ICON) {
  const trimmedName = name.trim() || 'Без назви';
  const existing = state.playlists.find((playlist) => playlist.name === trimmedName);

  if (existing) {
    return existing.id;
  }

  state.lastPlaylistId += 1;
  state.playlists.push({
    id: state.lastPlaylistId,
    name: trimmedName,
    icon: icon.trim() || DEFAULT_PLAYLIST_ICON,
    is_pinned: 0,
  });

  return state.lastPlaylistId;
}

export function parseImportedFilename(filename: string): ParsedFilename {
  let clean = filename.replace(/\.[^/.]+$/, '');
  let episode = 0;

  let match = clean.match(/\[0*(\d+)\]/);

  if (!match) {
    match = clean.match(/_0*(\d{1,4})_(?:720p|1080p|480p|x264)/i);
  }

  if (!match) {
    match = clean.match(/_0*(\d{1,4})_/);
  }

  if (!match) {
    match = clean.match(/(?:Ep|Episode|E| - )0*(\d+)\b/i);
  }

  if (match) {
    episode = parseInt(match[1], 10);
  }

  let seriesTitle = clean.replace(/\[.*?\]|\(.*?\)/g, '');
  seriesTitle = seriesTitle.replace(/(720p|1080p|480p|x264|h264|x265|aac|mvo)/gi, '');
  seriesTitle = seriesTitle.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  const epRegex = new RegExp(`\\b0*${episode}\\b`, 'g');
  seriesTitle = seriesTitle.replace(epRegex, '').replace(/\s+/g, ' ').trim();

  if (!seriesTitle) {
    seriesTitle = 'Unknown Series';
  }

  const cleanFilename = normalizeSpaces(clean.replace(/_/g, ' '));

  return {
    seriesTitle,
    episode,
    episodeNumber: episode > 0 ? episode : null,
    cleanFilename,
    cleanedTitle: cleanFilename,
  };
}

async function tableExists(db: SQLiteDatabase, tableName: string) {
  const result = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName
  );

  return Boolean(result?.name);
}

async function getTableColumnNames(db: SQLiteDatabase, tableName: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return new Set(columns.map((column) => column.name));
}

async function createPlaylistsTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      icon TEXT NOT NULL DEFAULT '${DEFAULT_PLAYLIST_ICON}',
      is_pinned BOOLEAN DEFAULT 0
    );
  `);
}

async function createVideosTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uri TEXT,
      filename TEXT,
      thumbnail_uri TEXT,
      playlist_id INTEGER,
      episode_num INTEGER,
      progress REAL,
      duration REAL,
      is_pinned BOOLEAN DEFAULT 0,
      external_id TEXT,
      remote_url TEXT,
      download_status TEXT NOT NULL DEFAULT 'none',
      download_progress REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(playlist_id) REFERENCES playlists(id)
    );
  `);
}

async function createSettingsTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

async function createDownloadsCompatibilityTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY NOT NULL,
      remote_url TEXT NOT NULL,
      local_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      cleaned_title TEXT NOT NULL,
      watched_progress REAL NOT NULL DEFAULT 0
    );
  `);
}

async function getOrCreatePlaylistId(db: SQLiteDatabase, name: string, icon = DEFAULT_PLAYLIST_ICON) {
  const trimmedName = name.trim() || 'Без назви';
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM playlists WHERE name = ?',
    trimmedName
  );

  if (existing?.id) {
    return existing.id;
  }

  const result = await db.runAsync(
    'INSERT INTO playlists (name, icon, is_pinned) VALUES (?, ?, ?)',
    trimmedName,
    icon,
    0
  );
  return result.lastInsertRowId;
}

async function migrateLegacyVideosRows(
  db: SQLiteDatabase,
  rows: Record<string, unknown>[]
) {
  for (const row of rows) {
    const uri = typeof row.uri === 'string' ? row.uri : '';
    if (!uri) {
      continue;
    }

    const filename =
      typeof row.filename === 'string'
        ? row.filename
        : typeof row.title === 'string'
          ? row.title
          : `video-${Date.now()}.mp4`;
    const parsed = parseImportedFilename(filename);
    const playlistId = await getOrCreatePlaylistId(db, parsed.seriesTitle);

    await db.runAsync(
      `
        INSERT INTO videos (
          uri,
          filename,
          thumbnail_uri,
          playlist_id,
          episode_num,
          progress,
          duration,
          is_pinned,
          external_id,
          remote_url,
          download_status,
          download_progress
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      uri,
      filename,
      toNullableString(row.thumbnail_uri),
      playlistId,
      parsed.episodeNumber,
      toNumber(row.progress ?? row.currentTime, 0),
      toNumber(row.duration, 0),
      toNumber(row.is_pinned, 0),
      toNullableString(row.external_id),
      toNullableString(row.remote_url),
      toDownloadStatus(row.download_status),
      toNumber(row.download_progress, 0)
    );
  }
}

async function migrateVideosTable(db: SQLiteDatabase) {
  const exists = await tableExists(db, 'videos');
  if (!exists) {
    await createVideosTable(db);
    return;
  }

  const columnNames = await getTableColumnNames(db, 'videos');
  const isLegacyShape = LEGACY_VIDEO_COLUMNS.every((column) => columnNames.has(column));
  const isCurrentShape = REQUIRED_VIDEO_COLUMNS.every((column) => columnNames.has(column));

  if (isCurrentShape) {
    return;
  }

  if (!isLegacyShape && columnNames.has('filename') && columnNames.has('uri')) {
    if (!columnNames.has('thumbnail_uri')) {
      await db.execAsync('ALTER TABLE videos ADD COLUMN thumbnail_uri TEXT;');
    }

    if (!columnNames.has('is_pinned')) {
      await db.execAsync('ALTER TABLE videos ADD COLUMN is_pinned BOOLEAN DEFAULT 0;');
    }

    if (!columnNames.has('external_id')) {
      await db.execAsync('ALTER TABLE videos ADD COLUMN external_id TEXT;');
    }

    if (!columnNames.has('remote_url')) {
      await db.execAsync('ALTER TABLE videos ADD COLUMN remote_url TEXT;');
    }

    if (!columnNames.has('download_status')) {
      await db.execAsync("ALTER TABLE videos ADD COLUMN download_status TEXT NOT NULL DEFAULT 'none';");
    }

    if (!columnNames.has('download_progress')) {
      await db.execAsync('ALTER TABLE videos ADD COLUMN download_progress REAL NOT NULL DEFAULT 0;');
    }

    return;
  }

  await db.execAsync('DROP TABLE IF EXISTS videos_legacy;');
  await db.execAsync('ALTER TABLE videos RENAME TO videos_legacy;');
  await createVideosTable(db);

  if (isLegacyShape || columnNames.has('filename') || columnNames.has('uri')) {
    const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM videos_legacy');
    await migrateLegacyVideosRows(db, rows);
  }

  await db.execAsync('DROP TABLE IF EXISTS videos_legacy;');
}

async function migratePlaylistsTable(db: SQLiteDatabase) {
  const exists = await tableExists(db, 'playlists');
  if (!exists) {
    await createPlaylistsTable(db);
    return;
  }

  const columnNames = await getTableColumnNames(db, 'playlists');
  const isCurrentShape = REQUIRED_PLAYLIST_COLUMNS.every((column) => columnNames.has(column));

  if (isCurrentShape) {
    return;
  }

  if (!columnNames.has('icon')) {
    await db.execAsync(
      `ALTER TABLE playlists ADD COLUMN icon TEXT NOT NULL DEFAULT '${DEFAULT_PLAYLIST_ICON}';`
    );
  }

  if (!columnNames.has('is_pinned')) {
    await db.execAsync('ALTER TABLE playlists ADD COLUMN is_pinned BOOLEAN DEFAULT 0;');
  }
}

async function migrateSettingsTable(db: SQLiteDatabase) {
  const exists = await tableExists(db, 'settings');
  if (!exists) {
    await createSettingsTable(db);
    return;
  }

  const columnNames = await getTableColumnNames(db, 'settings');
  const isCurrentShape = SETTINGS_TABLE_COLUMNS.every((column) => columnNames.has(column));

  if (isCurrentShape) {
    return;
  }

  await db.execAsync('DROP TABLE IF EXISTS settings;');
  await createSettingsTable(db);
}

async function ensureDatabaseIndexes(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_playlists_pinned_name
      ON playlists (is_pinned, name);
    CREATE INDEX IF NOT EXISTS idx_videos_playlist_sort
      ON videos (playlist_id, is_pinned, episode_num, filename);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_external_id
      ON videos (external_id)
      WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_videos_download_status
      ON videos (download_status, download_progress);
  `);
}

export async function initializeDatabase(db: DatabaseHandle) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async () => undefined);
    return;
  }

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  await createPlaylistsTable(db);
  await createVideosTable(db);
  await createSettingsTable(db);
  await createDownloadsCompatibilityTable(db);
  await migratePlaylistsTable(db);
  await migrateVideosTable(db);
  await migrateSettingsTable(db);
  await ensureDatabaseIndexes(db);
}

export async function ensureVideoStorageDirectory() {
  if (Platform.OS === 'web') {
    return;
  }

  if (!FileSystem.documentDirectory) {
    throw new Error('Локальна директорія недоступна.');
  }

  await FileSystem.makeDirectoryAsync(VIDEO_STORAGE_DIRECTORY, { intermediates: true });
}

async function generateThumbnailUri(videoUri: string, safeFilename: string) {
  void videoUri;
  void safeFilename;
  return null;
}

export async function importVideoFromSource(
  db: DatabaseHandle,
  source: ImportVideoSource,
  options?: {
    playlistId?: number | null;
    playlistName?: string | null;
    playlistIcon?: string | null;
  }
) {
  if (isWebDatabase(db)) {
    return mutateWebDatabase(async (state) => {
      const originalFilename = source.name || `video-${Date.now()}.mp4`;
      const parsed = parseImportedFilename(originalFilename);
      const resolvedPlaylistId =
        options?.playlistId && Number.isFinite(options.playlistId) && options.playlistId > 0
          ? options.playlistId
          : await webGetOrCreatePlaylistId(
              state,
              options?.playlistName?.trim() || parsed.seriesTitle,
              options?.playlistIcon?.trim() || DEFAULT_PLAYLIST_ICON
            );

      state.lastVideoId += 1;
      let webUri = source.uri;
      const blobRef = buildWebBlobRef('video', state.lastVideoId);

      if (source.file instanceof Blob) {
        await saveWebBlob(extractWebBlobKey(blobRef), source.file);
        webUri = blobRef;
      } else if (source.uri) {
        try {
          const response = await fetch(source.uri);
          const blob = await response.blob();
          await saveWebBlob(extractWebBlobKey(blobRef), blob);
          webUri = blobRef;
        } catch {
          webUri = source.uri;
        }
      }

      const video: VideoRow = {
        id: state.lastVideoId,
        uri: webUri,
        filename: originalFilename,
        thumbnail_uri: null,
        playlist_id: resolvedPlaylistId,
        episode_num: parsed.episodeNumber,
        progress: 0,
        duration: 0,
        is_pinned: 0,
        external_id: null,
        remote_url: null,
        download_status: 'none',
        download_progress: 0,
      };

      state.videos.push(video);
      return hydrateWebVideo(video);
    });
  }

  await ensureVideoStorageDirectory();

  const originalFilename = source.name || `video-${Date.now()}.mp4`;
  const safeFilename = sanitizeFilename(originalFilename);
  const targetUri = `${VIDEO_STORAGE_DIRECTORY}${Date.now()}-${safeFilename}`;
  const parsed = parseImportedFilename(originalFilename);

  await FileSystem.copyAsync({
    from: source.uri,
    to: targetUri,
  });

  const thumbnailUri = await generateThumbnailUri(targetUri, safeFilename);

  await db.withTransactionAsync(async () => {
    const resolvedPlaylistId =
      options?.playlistId && Number.isFinite(options.playlistId) && options.playlistId > 0
        ? options.playlistId
        : await getOrCreatePlaylistId(
            db,
            options?.playlistName?.trim() || parsed.seriesTitle,
            options?.playlistIcon?.trim() || DEFAULT_PLAYLIST_ICON
          );

    await db.runAsync(
      `
        INSERT INTO videos (
          uri,
          filename,
          thumbnail_uri,
          playlist_id,
          episode_num,
          progress,
          duration,
          is_pinned,
          external_id,
          remote_url,
          download_status,
          download_progress
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      targetUri,
      originalFilename,
      thumbnailUri,
      resolvedPlaylistId,
      parsed.episodeNumber,
      0,
      0,
      0,
      null,
      null,
      'downloaded',
      1
    );
  });
}

export async function importVideoFromDocument(
  db: DatabaseHandle,
  pickedAsset: DocumentPickerAsset,
  options?: {
    playlistId?: number | null;
    playlistName?: string | null;
    playlistIcon?: string | null;
  }
) {
  return importVideoFromSource(
    db,
    {
      uri: pickedAsset.uri,
      name: pickedAsset.name || `video-${Date.now()}.mp4`,
    },
    options
  );
}

export async function createCustomPlaylist(
  db: DatabaseHandle,
  name: string,
  icon = DEFAULT_PLAYLIST_ICON
) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Назва плейлиста не може бути порожньою.');
  }

  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      if (state.playlists.some((playlist) => playlist.name === trimmedName)) {
        throw new Error('UNIQUE constraint failed: playlists.name');
      }

      await webGetOrCreatePlaylistId(state, trimmedName, icon);
    });
    return;
  }

  await db.runAsync(
    'INSERT INTO playlists (name, icon, is_pinned) VALUES (?, ?, ?)',
    trimmedName,
    icon,
    0
  );
}

export async function getPlaylistsWithCounts(db: DatabaseHandle) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    const rows = sortPlaylists(state.playlists)
      .map((playlist) => {
        const localVideos = state.videos.filter(
          (video) => video.playlist_id === playlist.id && video.uri.trim().length > 0
        );

        return {
          ...playlist,
          videoCount: localVideos.length,
          thumbnailUri: localVideos.find((video) => video.thumbnail_uri)?.thumbnail_uri ?? null,
        };
      })
      .filter((playlist) => playlist.videoCount > 0 || !state.videos.some((video) => video.playlist_id === playlist.id));

    return await Promise.all(
      rows.map(async (playlist) => ({
        ...playlist,
        thumbnailUri: await resolveWebBlobUrl(playlist.thumbnailUri),
      }))
    );
  }

  const rows = await db.getAllAsync<PlaylistRow>(`
    SELECT
      p.id,
      p.name,
      p.icon,
      p.is_pinned,
      SUM(CASE WHEN COALESCE(v.uri, '') != '' THEN 1 ELSE 0 END) AS videoCount,
      MAX(CASE WHEN COALESCE(v.uri, '') != '' THEN v.thumbnail_uri ELSE NULL END) AS thumbnailUri
    FROM playlists p
    LEFT JOIN videos v ON v.playlist_id = p.id
    GROUP BY p.id, p.name, p.icon, p.is_pinned
    HAVING SUM(CASE WHEN COALESCE(v.uri, '') != '' THEN 1 ELSE 0 END) > 0 OR COUNT(v.id) = 0
    ORDER BY p.is_pinned DESC, p.name COLLATE NOCASE ASC
  `);

  return rows.map((row) => ({
    ...row,
    is_pinned: toNumber(row.is_pinned, 0),
    videoCount: toNumber(row.videoCount, 0),
    thumbnailUri: toNullableString(row.thumbnailUri),
  }));
}

export async function getPlaylistById(db: DatabaseHandle, playlistId: number) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    return state.playlists.find((playlist) => playlist.id === playlistId) ?? null;
  }

  const row = await db.getFirstAsync<PlaylistDetailRow>(
    'SELECT id, name, icon, is_pinned FROM playlists WHERE id = ?',
    playlistId
  );

  if (!row) {
    return null;
  }

  return {
    ...row,
    is_pinned: toNumber(row.is_pinned, 0),
  };
}

export async function reparseStoredVideos(db: DatabaseHandle) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      for (const video of state.videos) {
        const parsed = parseImportedFilename(video.filename);
        video.playlist_id = await webGetOrCreatePlaylistId(state, parsed.seriesTitle);
        video.episode_num = parsed.episodeNumber;
      }

      const usedPlaylistIds = new Set(state.videos.map((video) => video.playlist_id));
      state.playlists = state.playlists.filter((playlist) => usedPlaylistIds.has(playlist.id));
    });
    return;
  }

  const videos = await db.getAllAsync<Pick<VideoRow, 'id' | 'filename'>>(
    'SELECT id, filename FROM videos ORDER BY id ASC'
  );

  await db.withTransactionAsync(async () => {
    for (const video of videos) {
      const parsed = parseImportedFilename(video.filename);
      const playlistId = await getOrCreatePlaylistId(db, parsed.seriesTitle);

      await db.runAsync(
        'UPDATE videos SET playlist_id = ?, episode_num = ? WHERE id = ?',
        playlistId,
        parsed.episodeNumber,
        video.id
      );
    }
  });

  await db.runAsync(
    'DELETE FROM playlists WHERE id NOT IN (SELECT DISTINCT playlist_id FROM videos WHERE playlist_id IS NOT NULL)'
  );
}

export async function getAllPlaylists(db: DatabaseHandle) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    return sortPlaylists(state.playlists);
  }

  const rows = await db.getAllAsync<PlaylistDetailRow>(
    'SELECT id, name, icon, is_pinned FROM playlists ORDER BY is_pinned DESC, name COLLATE NOCASE ASC'
  );

  return rows.map((row) => ({
    ...row,
    is_pinned: toNumber(row.is_pinned, 0),
  }));
}

export async function getVideosByPlaylist(db: DatabaseHandle, playlistId: number) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    return await Promise.all(
      sortVideos(
        state.videos.filter((video) => video.playlist_id === playlistId && video.uri.trim().length > 0)
      ).map(hydrateWebVideo)
    );
  }

  const rows = await db.getAllAsync<VideoRow>(
    `
      SELECT
        id,
        uri,
        filename,
        thumbnail_uri,
        playlist_id,
        episode_num,
        progress,
        duration,
        is_pinned,
        external_id,
        remote_url,
        download_status,
        download_progress
      FROM videos
      WHERE playlist_id = ?
        AND COALESCE(uri, '') != ''
      ORDER BY
        is_pinned DESC,
        CASE WHEN episode_num IS NULL THEN 1 ELSE 0 END,
        episode_num ASC,
        filename COLLATE NOCASE ASC
    `,
    playlistId
  );

  return rows.map((row) => ({
    ...row,
    thumbnail_uri: toNullableString(row.thumbnail_uri),
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
    external_id: toNullableString(row.external_id),
    remote_url: toNullableString(row.remote_url),
    download_status: toDownloadStatus(row.download_status),
    download_progress: toNumber(row.download_progress, 0),
  }));
}

export async function getAllVideos(db: DatabaseHandle) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    return await Promise.all(
      sortVideos(state.videos.filter((video) => video.uri.trim().length > 0)).map(hydrateWebVideo)
    );
  }

  const rows = await db.getAllAsync<VideoRow>(`
    SELECT
      id,
      uri,
      filename,
      thumbnail_uri,
      playlist_id,
      episode_num,
      progress,
      duration,
      is_pinned,
      external_id,
      remote_url,
      download_status,
      download_progress
    FROM videos
    WHERE COALESCE(uri, '') != ''
    ORDER BY
      is_pinned DESC,
      CASE WHEN episode_num IS NULL THEN 1 ELSE 0 END,
      episode_num ASC,
      filename COLLATE NOCASE ASC
  `);

  return rows.map((row) => ({
    ...row,
    thumbnail_uri: toNullableString(row.thumbnail_uri),
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
    external_id: toNullableString(row.external_id),
    remote_url: toNullableString(row.remote_url),
    download_status: toDownloadStatus(row.download_status),
    download_progress: toNumber(row.download_progress, 0),
  }));
}

export async function getVideoById(db: DatabaseHandle, videoId: number) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    const row = state.videos.find((video) => video.id === videoId) ?? null;
    return row ? hydrateWebVideo(row) : null;
  }

  const row = await db.getFirstAsync<VideoRow>(
    `
      SELECT
        id,
        uri,
        filename,
        thumbnail_uri,
        playlist_id,
        episode_num,
        progress,
        duration,
        is_pinned,
        external_id,
        remote_url,
        download_status,
        download_progress
      FROM videos
      WHERE id = ?
    `,
    videoId
  );

  if (!row) {
    return null;
  }

  return {
    ...row,
    thumbnail_uri: toNullableString(row.thumbnail_uri),
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
    external_id: toNullableString(row.external_id),
    remote_url: toNullableString(row.remote_url),
    download_status: toDownloadStatus(row.download_status),
    download_progress: toNumber(row.download_progress, 0),
  };
}

export async function getVideoByExternalId(db: DatabaseHandle, externalId: string) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    const row = state.videos.find((video) => video.external_id === externalId) ?? null;
    return row ? hydrateWebVideo(row) : null;
  }

  const row = await db.getFirstAsync<VideoRow>(
    `
      SELECT
        id,
        uri,
        filename,
        thumbnail_uri,
        playlist_id,
        episode_num,
        progress,
        duration,
        is_pinned,
        external_id,
        remote_url,
        download_status,
        download_progress
      FROM videos
      WHERE external_id = ?
    `,
    externalId
  );

  if (!row) {
    return null;
  }

  return {
    ...row,
    thumbnail_uri: toNullableString(row.thumbnail_uri),
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
    external_id: toNullableString(row.external_id),
    remote_url: toNullableString(row.remote_url),
    download_status: toDownloadStatus(row.download_status),
    download_progress: toNumber(row.download_progress, 0),
  };
}

export async function getVideosByExternalIds(db: DatabaseHandle, externalIds: string[]) {
  const filteredIds = [...new Set(externalIds.filter(Boolean))];
  if (filteredIds.length === 0) {
    return [] as VideoRow[];
  }

  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    return await Promise.all(
      state.videos
        .filter((video) => video.external_id && filteredIds.includes(video.external_id))
        .map(hydrateWebVideo)
    );
  }

  const placeholders = filteredIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<VideoRow>(
    `
      SELECT
        id,
        uri,
        filename,
        thumbnail_uri,
        playlist_id,
        episode_num,
        progress,
        duration,
        is_pinned,
        external_id,
        remote_url,
        download_status,
        download_progress
      FROM videos
      WHERE external_id IN (${placeholders})
    `,
    ...filteredIds
  );

  return rows.map((row) => ({
    ...row,
    thumbnail_uri: toNullableString(row.thumbnail_uri),
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
    external_id: toNullableString(row.external_id),
    remote_url: toNullableString(row.remote_url),
    download_status: toDownloadStatus(row.download_status),
    download_progress: toNumber(row.download_progress, 0),
  }));
}

export async function updateVideoProgress(
  db: DatabaseHandle,
  videoId: number,
  progress: number,
  duration: number
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (!video) {
        return;
      }

      video.progress = progress;
      video.duration = duration;
    });
    return;
  }

  await db.runAsync(
    'UPDATE videos SET progress = ?, duration = ? WHERE id = ?',
    progress,
    duration,
    videoId
  );
}

export async function upsertRemoteEpisode(
  db: DatabaseHandle,
  payload: {
    externalId: string;
    remoteUrl: string;
    seriesTitle: string;
    filename: string;
    episodeNumber?: number | null;
    thumbnailUri?: string | null;
    playlistIcon?: string;
  }
) {
  if (isWebDatabase(db)) {
    return mutateWebDatabase(async (state) => {
      const playlistId = await webGetOrCreatePlaylistId(
        state,
        payload.seriesTitle,
        payload.playlistIcon?.trim() || DEFAULT_PLAYLIST_ICON
      );
      const existing = state.videos.find((video) => video.external_id === payload.externalId);

      if (existing) {
        existing.filename = payload.filename;
        existing.thumbnail_uri = payload.thumbnailUri ?? existing.thumbnail_uri;
        existing.playlist_id = playlistId;
        existing.episode_num = payload.episodeNumber ?? null;
        existing.remote_url = payload.remoteUrl;
        existing.download_status =
          existing.download_status === 'downloaded' ? existing.download_status : 'available';
        return existing;
      }

      state.lastVideoId += 1;
      const video: VideoRow = {
        id: state.lastVideoId,
        uri: '',
        filename: payload.filename,
        thumbnail_uri: payload.thumbnailUri ?? null,
        playlist_id: playlistId,
        episode_num: payload.episodeNumber ?? null,
        progress: 0,
        duration: 0,
        is_pinned: 0,
        external_id: payload.externalId,
        remote_url: payload.remoteUrl,
        download_status: 'available',
        download_progress: 0,
      };
      state.videos.push(video);
      return video;
    });
  }

  const existing = await getVideoByExternalId(db, payload.externalId);
  const playlistId = await getOrCreatePlaylistId(
    db,
    payload.seriesTitle,
    payload.playlistIcon?.trim() || DEFAULT_PLAYLIST_ICON
  );

  if (existing) {
    await db.runAsync(
      `
        UPDATE videos
        SET
          filename = ?,
          thumbnail_uri = COALESCE(?, thumbnail_uri),
          playlist_id = ?,
          episode_num = ?,
          remote_url = ?,
          download_status = CASE
            WHEN download_status = 'downloaded' THEN download_status
            ELSE 'available'
          END
        WHERE id = ?
      `,
      payload.filename,
      payload.thumbnailUri ?? null,
      playlistId,
      payload.episodeNumber ?? null,
      payload.remoteUrl,
      existing.id
    );

    return (await getVideoById(db, existing.id)) as VideoRow;
  }

  const result = await db.runAsync(
    `
      INSERT INTO videos (
        uri,
        filename,
        thumbnail_uri,
        playlist_id,
        episode_num,
        progress,
        duration,
        is_pinned,
        external_id,
        remote_url,
        download_status,
        download_progress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    '',
    payload.filename,
    payload.thumbnailUri ?? null,
    playlistId,
    payload.episodeNumber ?? null,
    0,
    0,
    0,
    payload.externalId,
    payload.remoteUrl,
    'available',
    0
  );

  return (await getVideoById(db, result.lastInsertRowId)) as VideoRow;
}

export async function updateVideoDownloadState(
  db: DatabaseHandle,
  videoId: number,
  values: {
    uri?: string | null;
    remoteUrl?: string | null;
    downloadStatus?: string;
    downloadProgress?: number;
    duration?: number;
    thumbnailUri?: string | null;
  }
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (!video) {
        return;
      }

      if (values.uri !== undefined && values.uri !== null) {
        video.uri = values.uri;
      }
      if (values.remoteUrl !== undefined && values.remoteUrl !== null) {
        video.remote_url = values.remoteUrl;
      }
      if (values.downloadStatus !== undefined) {
        video.download_status = values.downloadStatus;
      }
      if (values.downloadProgress !== undefined) {
        video.download_progress = values.downloadProgress;
      }
      if (values.duration !== undefined) {
        video.duration = values.duration;
      }
      if (values.thumbnailUri !== undefined && values.thumbnailUri !== null) {
        video.thumbnail_uri = values.thumbnailUri;
      }
    });
    return;
  }

  await db.runAsync(
    `
      UPDATE videos
      SET
        uri = COALESCE(?, uri),
        remote_url = COALESCE(?, remote_url),
        download_status = COALESCE(?, download_status),
        download_progress = COALESCE(?, download_progress),
        duration = COALESCE(?, duration),
        thumbnail_uri = COALESCE(?, thumbnail_uri)
      WHERE id = ?
    `,
    values.uri ?? null,
    values.remoteUrl ?? null,
    values.downloadStatus ?? null,
    values.downloadProgress ?? null,
    values.duration ?? null,
    values.thumbnailUri ?? null,
    videoId
  );
}

export async function getDownloadRows(db: DatabaseHandle) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    const downloads = state.videos.filter(
      (video) => video.remote_url !== null || video.download_status !== 'none'
    );

    return downloads
      .map((video) => {
        const playlist = state.playlists.find((entry) => entry.id === video.playlist_id);
        return {
          ...video,
          playlist_name: playlist?.name ?? 'Без назви',
          playlist_icon: playlist?.icon ?? DEFAULT_PLAYLIST_ICON,
        };
      })
      .sort((left, right) => {
        const statusOrder = (value: string) =>
          value === 'downloading' ? 0 : value === 'queued' ? 1 : value === 'downloaded' ? 2 : 3;
        const statusCompare = statusOrder(left.download_status) - statusOrder(right.download_status);

        if (statusCompare !== 0) {
          return statusCompare;
        }

        if (left.is_pinned !== right.is_pinned) {
          return right.is_pinned - left.is_pinned;
        }

        const playlistCompare = left.playlist_name.localeCompare(right.playlist_name, undefined, {
          sensitivity: 'base',
        });
        if (playlistCompare !== 0) {
          return playlistCompare;
        }

        const leftEpisode = left.episode_num ?? Number.MAX_SAFE_INTEGER;
        const rightEpisode = right.episode_num ?? Number.MAX_SAFE_INTEGER;
        if (leftEpisode !== rightEpisode) {
          return leftEpisode - rightEpisode;
        }

        return left.filename.localeCompare(right.filename, undefined, { sensitivity: 'base' });
      });
  }

  const rows = await db.getAllAsync<DownloadRow>(`
    SELECT
      v.id,
      v.uri,
      v.filename,
      v.thumbnail_uri,
      v.playlist_id,
      v.episode_num,
      v.progress,
      v.duration,
      v.is_pinned,
      v.external_id,
      v.remote_url,
      v.download_status,
      v.download_progress,
      p.name AS playlist_name,
      p.icon AS playlist_icon
    FROM videos v
    INNER JOIN playlists p ON p.id = v.playlist_id
    WHERE v.remote_url IS NOT NULL OR v.download_status != 'none'
    ORDER BY
      CASE v.download_status
        WHEN 'downloading' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'downloaded' THEN 2
        ELSE 3
      END,
      v.is_pinned DESC,
      p.name COLLATE NOCASE ASC,
      CASE WHEN v.episode_num IS NULL THEN 1 ELSE 0 END,
      v.episode_num ASC,
      v.filename COLLATE NOCASE ASC
  `);

  return rows.map((row) => ({
    ...row,
    thumbnail_uri: toNullableString(row.thumbnail_uri),
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
    external_id: toNullableString(row.external_id),
    remote_url: toNullableString(row.remote_url),
    download_status: toDownloadStatus(row.download_status),
    download_progress: toNumber(row.download_progress, 0),
    playlist_name: row.playlist_name,
    playlist_icon: row.playlist_icon,
  }));
}

export async function renamePlaylist(
  db: DatabaseHandle,
  playlistId: number,
  name: string
) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Назва плейлиста не може бути порожньою.');
  }

  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      if (state.playlists.some((playlist) => playlist.id !== playlistId && playlist.name === trimmedName)) {
        throw new Error('UNIQUE constraint failed: playlists.name');
      }

      const playlist = state.playlists.find((entry) => entry.id === playlistId);
      if (playlist) {
        playlist.name = trimmedName;
      }
    });
    return;
  }

  await db.runAsync('UPDATE playlists SET name = ? WHERE id = ?', trimmedName, playlistId);
}

export async function updatePlaylistIcon(
  db: DatabaseHandle,
  playlistId: number,
  icon: string
) {
  const trimmedIcon = icon.trim() || DEFAULT_PLAYLIST_ICON;
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const playlist = state.playlists.find((entry) => entry.id === playlistId);
      if (playlist) {
        playlist.icon = trimmedIcon;
      }
    });
    return;
  }

  await db.runAsync('UPDATE playlists SET icon = ? WHERE id = ?', trimmedIcon, playlistId);
}

export async function renameVideo(
  db: DatabaseHandle,
  videoId: number,
  filename: string
) {
  const trimmedFilename = filename.trim();
  if (!trimmedFilename) {
    throw new Error('Назва відео не може бути порожньою.');
  }

  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (video) {
        video.filename = trimmedFilename;
      }
    });
    return;
  }

  await db.runAsync('UPDATE videos SET filename = ? WHERE id = ?', trimmedFilename, videoId);
}

export async function setPlaylistPinned(
  db: DatabaseHandle,
  playlistId: number,
  isPinned: boolean
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const playlist = state.playlists.find((entry) => entry.id === playlistId);
      if (playlist) {
        playlist.is_pinned = isPinned ? 1 : 0;
      }
    });
    return;
  }

  await db.runAsync(
    'UPDATE playlists SET is_pinned = ? WHERE id = ?',
    isPinned ? 1 : 0,
    playlistId
  );
}

export async function setVideoPinned(
  db: DatabaseHandle,
  videoId: number,
  isPinned: boolean
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (video) {
        video.is_pinned = isPinned ? 1 : 0;
      }
    });
    return;
  }

  await db.runAsync(
    'UPDATE videos SET is_pinned = ? WHERE id = ?',
    isPinned ? 1 : 0,
    videoId
  );
}

export async function moveVideoToPlaylist(
  db: DatabaseHandle,
  videoId: number,
  playlistId: number
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (video) {
        video.playlist_id = playlistId;
      }
    });
    return;
  }

  await db.runAsync(
    'UPDATE videos SET playlist_id = ? WHERE id = ?',
    playlistId,
    videoId
  );
}

export async function deleteVideoById(
  db: DatabaseHandle,
  videoId: number
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (video?.uri && isWebBlobRef(video.uri)) {
        revokeCachedWebBlobUrl(video.uri);
        await deleteWebBlob(extractWebBlobKey(video.uri));
      }
      if (video?.thumbnail_uri && isWebBlobRef(video.thumbnail_uri)) {
        revokeCachedWebBlobUrl(video.thumbnail_uri);
        await deleteWebBlob(extractWebBlobKey(video.thumbnail_uri));
      }
      state.videos = state.videos.filter((video) => video.id !== videoId);
    });
    return;
  }

  const row = await getVideoById(db, videoId);
  if (!row) {
    return;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM videos WHERE id = ?', videoId);
  });

  if (row.uri) {
    const info = await FileSystem.getInfoAsync(row.uri);
    if (info.exists) {
      await FileSystem.deleteAsync(row.uri, { idempotent: true });
    }
  }

  if (row.thumbnail_uri) {
    const info = await FileSystem.getInfoAsync(row.thumbnail_uri);
    if (info.exists) {
      await FileSystem.deleteAsync(row.thumbnail_uri, { idempotent: true });
    }
  }
}

export async function deletePlaylistById(
  db: DatabaseHandle,
  playlistId: number
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      const playlistVideos = state.videos.filter((video) => video.playlist_id === playlistId);
      for (const video of playlistVideos) {
        if (video.uri && isWebBlobRef(video.uri)) {
          revokeCachedWebBlobUrl(video.uri);
          await deleteWebBlob(extractWebBlobKey(video.uri));
        }
        if (video.thumbnail_uri && isWebBlobRef(video.thumbnail_uri)) {
          revokeCachedWebBlobUrl(video.thumbnail_uri);
          await deleteWebBlob(extractWebBlobKey(video.thumbnail_uri));
        }
      }
      state.videos = state.videos.filter((video) => video.playlist_id !== playlistId);
      state.playlists = state.playlists.filter((playlist) => playlist.id !== playlistId);
    });
    return;
  }

  const videos = await getVideosByPlaylist(db, playlistId);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM videos WHERE playlist_id = ?', playlistId);
    await db.runAsync('DELETE FROM playlists WHERE id = ?', playlistId);
  });

  for (const video of videos) {
    if (!video.uri) {
      if (video.thumbnail_uri) {
        const thumbnailInfo = await FileSystem.getInfoAsync(video.thumbnail_uri);
        if (thumbnailInfo.exists) {
          await FileSystem.deleteAsync(video.thumbnail_uri, { idempotent: true });
        }
      }
      continue;
    }

    const info = await FileSystem.getInfoAsync(video.uri);
    if (info.exists) {
      await FileSystem.deleteAsync(video.uri, { idempotent: true });
    }

    if (video.thumbnail_uri) {
      const thumbnailInfo = await FileSystem.getInfoAsync(video.thumbnail_uri);
      if (thumbnailInfo.exists) {
        await FileSystem.deleteAsync(video.thumbnail_uri, { idempotent: true });
      }
    }
  }
}

export async function getSettingBoolean(
  db: DatabaseHandle,
  key: string,
  fallback: boolean
) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    if (!(key in state.settings)) {
      return fallback;
    }

    return state.settings[key] === 'true';
  }

  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );

  if (!row) {
    return fallback;
  }

  return row.value === 'true';
}

export async function setSettingBoolean(
  db: DatabaseHandle,
  key: string,
  value: boolean
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      state.settings[key] = String(value);
    });
    return;
  }

  await db.runAsync(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    key,
    String(value)
  );
}

export async function getSettingString(
  db: DatabaseHandle,
  key: string,
  fallback: string
) {
  if (isWebDatabase(db)) {
    const state = await loadWebDatabaseState();
    return state.settings[key] ?? fallback;
  }

  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );

  return row?.value ?? fallback;
}

export async function setSettingString(
  db: DatabaseHandle,
  key: string,
  value: string
) {
  if (isWebDatabase(db)) {
    await mutateWebDatabase(async (state) => {
      state.settings[key] = value;
    });
    return;
  }

  await db.runAsync(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    key,
    value
  );
}
