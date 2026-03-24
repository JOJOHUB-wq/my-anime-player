import type { DocumentPickerAsset } from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as VideoThumbnails from 'expo-video-thumbnails';

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

export type ImportVideoSource = {
  uri: string;
  name: string;
};

const VIDEO_STORAGE_DIRECTORY = `${FileSystem.documentDirectory ?? ''}videos/`;
const THUMBNAIL_STORAGE_DIRECTORY = `${FileSystem.documentDirectory ?? ''}thumbnails/`;
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

export async function initializeDatabase(db: SQLiteDatabase) {
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
  if (!FileSystem.documentDirectory) {
    throw new Error('Локальна директорія недоступна.');
  }

  await FileSystem.makeDirectoryAsync(VIDEO_STORAGE_DIRECTORY, { intermediates: true });
}

async function ensureThumbnailStorageDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('Локальна директорія недоступна.');
  }

  await FileSystem.makeDirectoryAsync(THUMBNAIL_STORAGE_DIRECTORY, { intermediates: true });
}

async function generateThumbnailUri(videoUri: string, safeFilename: string) {
  await ensureThumbnailStorageDirectory();

  try {
    const thumbnail = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 5000 });
    const thumbnailBaseName = safeFilename.replace(/\.[^.]+$/i, '') || `thumbnail-${Date.now()}`;
    const targetUri = `${THUMBNAIL_STORAGE_DIRECTORY}${Date.now()}-${thumbnailBaseName}.jpg`;

    await FileSystem.copyAsync({
      from: thumbnail.uri,
      to: targetUri,
    });

    await FileSystem.deleteAsync(thumbnail.uri, { idempotent: true }).catch(() => undefined);

    return targetUri;
  } catch {
    return null;
  }
}

export async function importVideoFromSource(
  db: SQLiteDatabase,
  source: ImportVideoSource,
  options?: {
    playlistId?: number | null;
    playlistName?: string | null;
    playlistIcon?: string | null;
  }
) {
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
  db: SQLiteDatabase,
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
  db: SQLiteDatabase,
  name: string,
  icon = DEFAULT_PLAYLIST_ICON
) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Назва плейлиста не може бути порожньою.');
  }

  await db.runAsync(
    'INSERT INTO playlists (name, icon, is_pinned) VALUES (?, ?, ?)',
    trimmedName,
    icon,
    0
  );
}

export async function getPlaylistsWithCounts(db: SQLiteDatabase) {
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

export async function getPlaylistById(db: SQLiteDatabase, playlistId: number) {
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

export async function reparseStoredVideos(db: SQLiteDatabase) {
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

export async function getAllPlaylists(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<PlaylistDetailRow>(
    'SELECT id, name, icon, is_pinned FROM playlists ORDER BY is_pinned DESC, name COLLATE NOCASE ASC'
  );

  return rows.map((row) => ({
    ...row,
    is_pinned: toNumber(row.is_pinned, 0),
  }));
}

export async function getVideosByPlaylist(db: SQLiteDatabase, playlistId: number) {
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

export async function getAllVideos(db: SQLiteDatabase) {
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

export async function getVideoById(db: SQLiteDatabase, videoId: number) {
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

export async function getVideoByExternalId(db: SQLiteDatabase, externalId: string) {
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

export async function getVideosByExternalIds(db: SQLiteDatabase, externalIds: string[]) {
  const filteredIds = [...new Set(externalIds.filter(Boolean))];
  if (filteredIds.length === 0) {
    return [] as VideoRow[];
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
  db: SQLiteDatabase,
  videoId: number,
  progress: number,
  duration: number
) {
  await db.runAsync(
    'UPDATE videos SET progress = ?, duration = ? WHERE id = ?',
    progress,
    duration,
    videoId
  );
}

export async function upsertRemoteEpisode(
  db: SQLiteDatabase,
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
  db: SQLiteDatabase,
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

export async function getDownloadRows(db: SQLiteDatabase) {
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
  db: SQLiteDatabase,
  playlistId: number,
  name: string
) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Назва плейлиста не може бути порожньою.');
  }

  await db.runAsync('UPDATE playlists SET name = ? WHERE id = ?', trimmedName, playlistId);
}

export async function updatePlaylistIcon(
  db: SQLiteDatabase,
  playlistId: number,
  icon: string
) {
  const trimmedIcon = icon.trim() || DEFAULT_PLAYLIST_ICON;
  await db.runAsync('UPDATE playlists SET icon = ? WHERE id = ?', trimmedIcon, playlistId);
}

export async function renameVideo(
  db: SQLiteDatabase,
  videoId: number,
  filename: string
) {
  const trimmedFilename = filename.trim();
  if (!trimmedFilename) {
    throw new Error('Назва відео не може бути порожньою.');
  }

  await db.runAsync('UPDATE videos SET filename = ? WHERE id = ?', trimmedFilename, videoId);
}

export async function setPlaylistPinned(
  db: SQLiteDatabase,
  playlistId: number,
  isPinned: boolean
) {
  await db.runAsync(
    'UPDATE playlists SET is_pinned = ? WHERE id = ?',
    isPinned ? 1 : 0,
    playlistId
  );
}

export async function setVideoPinned(
  db: SQLiteDatabase,
  videoId: number,
  isPinned: boolean
) {
  await db.runAsync(
    'UPDATE videos SET is_pinned = ? WHERE id = ?',
    isPinned ? 1 : 0,
    videoId
  );
}

export async function moveVideoToPlaylist(
  db: SQLiteDatabase,
  videoId: number,
  playlistId: number
) {
  await db.runAsync(
    'UPDATE videos SET playlist_id = ? WHERE id = ?',
    playlistId,
    videoId
  );
}

export async function deleteVideoById(
  db: SQLiteDatabase,
  videoId: number
) {
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
  db: SQLiteDatabase,
  playlistId: number
) {
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
  db: SQLiteDatabase,
  key: string,
  fallback: boolean
) {
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
  db: SQLiteDatabase,
  key: string,
  value: boolean
) {
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
  db: SQLiteDatabase,
  key: string,
  fallback: string
) {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );

  return row?.value ?? fallback;
}

export async function setSettingString(
  db: SQLiteDatabase,
  key: string,
  value: string
) {
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
