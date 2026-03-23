import type { DocumentPickerAsset } from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

export type PlaylistRow = {
  id: number;
  name: string;
  icon: string;
  is_pinned: number;
  videoCount: number;
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
  playlist_id: number;
  episode_num: number | null;
  progress: number;
  duration: number;
  is_pinned: number;
};

export type ParsedFilename = {
  seriesTitle: string;
  episodeNumber: number | null;
  cleanedTitle: string;
};

export type ImportVideoSource = {
  uri: string;
  name: string;
};

const VIDEO_STORAGE_DIRECTORY = `${FileSystem.documentDirectory ?? ''}videos/`;
export const DEFAULT_PLAYLIST_ICON = 'folder-open-outline';
const LEGACY_VIDEO_COLUMNS = ['id', 'uri', 'title', 'duration', 'currentTime'];
const REQUIRED_VIDEO_COLUMNS = [
  'id',
  'uri',
  'filename',
  'playlist_id',
  'episode_num',
  'progress',
  'duration',
  'is_pinned',
];
const REQUIRED_PLAYLIST_COLUMNS = ['id', 'name', 'icon', 'is_pinned'];
const SETTINGS_TABLE_COLUMNS = ['key', 'value'];
const EPISODE_NOISE_VALUES = new Set([240, 360, 480, 540, 576, 720, 900, 1080, 1440, 2160, 264, 265]);
const TITLE_NOISE_RE =
  /\b(?:x264|x265|h264|h265|hevc|aac|ac3|mvo|multi|sub|dub|anidub|webrip|web-dl|bluray|bdrip|remux|10bit|8bit)\b/gi;

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

export function parseImportedFilename(filename: string): ParsedFilename {
  const clean = filename.replace(/\.[^/.]+$/, '');
  const explicitEpisodeMatches = [...clean.matchAll(/\b(?:episode|ep|e)\s*0*(\d{1,3})\b/gi)];
  const bracketedEpisodeMatches = [...clean.matchAll(/\[(\d{1,4})\]/g)]
    .map((match) => toNumber(match[1], 0))
    .filter((value) => value > 0 && value < 500 && !EPISODE_NOISE_VALUES.has(value));
  const trailingEpisodeMatches = [...clean.matchAll(/(?:^|[_\s-])0*(\d{1,3})(?=(?:[_\s-]|$))/g)]
    .map((match) => toNumber(match[1], 0))
    .filter((value) => value > 0 && value < 500 && !EPISODE_NOISE_VALUES.has(value));

  const episodeNumber =
    explicitEpisodeMatches.length > 0
      ? toNumber(explicitEpisodeMatches[explicitEpisodeMatches.length - 1]?.[1], 0)
      : bracketedEpisodeMatches.length > 0
        ? bracketedEpisodeMatches[bracketedEpisodeMatches.length - 1]
        : trailingEpisodeMatches.length > 0
          ? trailingEpisodeMatches[trailingEpisodeMatches.length - 1]
          : 0;

  let title = clean
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/[_.]+/g, ' ')
    .replace(TITLE_NOISE_RE, ' ')
    .replace(/\b(?:episode|ep|e)\s*0*\d{1,3}\b/gi, ' ')
    .replace(/\s+-\s*0*\d{1,3}(?=\s*(?:-|$))/g, ' ');

  if (episodeNumber > 0) {
    title = title
      .replace(new RegExp(`(?:^|\\s|-)0*${episodeNumber}(?=\\s|$)`, 'g'), ' ')
      .replace(/\s+\d{1,3}[a-zA-Z]?$/, ' ');
  }

  title = normalizeSpaces(title).replace(/\s+-\s+-/g, ' - ').replace(/^\s*-\s*|\s*-\s*$/g, '');

  if (!title) {
    title = 'Unknown Series';
  }

  return {
    seriesTitle: title,
    episodeNumber: episodeNumber > 0 ? episodeNumber : null,
    cleanedTitle:
      episodeNumber > 0
        ? `${title} - Епізод ${String(episodeNumber).padStart(2, '0')}`
        : title,
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
      playlist_id INTEGER,
      episode_num INTEGER,
      progress REAL,
      duration REAL,
      is_pinned BOOLEAN DEFAULT 0,
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
          playlist_id,
          episode_num,
          progress,
          duration,
          is_pinned
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      uri,
      filename,
      playlistId,
      parsed.episodeNumber,
      toNumber(row.progress ?? row.currentTime, 0),
      toNumber(row.duration, 0),
      toNumber(row.is_pinned, 0)
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
          playlist_id,
          episode_num,
          progress,
          duration,
          is_pinned
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      targetUri,
      originalFilename,
      resolvedPlaylistId,
      parsed.episodeNumber,
      0,
      0,
      0
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
      COUNT(v.id) AS videoCount
    FROM playlists p
    LEFT JOIN videos v ON v.playlist_id = p.id
    GROUP BY p.id, p.name, p.icon, p.is_pinned
    ORDER BY p.is_pinned DESC, p.name COLLATE NOCASE ASC
  `);

  return rows.map((row) => ({
    ...row,
    is_pinned: toNumber(row.is_pinned, 0),
    videoCount: toNumber(row.videoCount, 0),
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
      SELECT id, uri, filename, playlist_id, episode_num, progress, duration, is_pinned
      FROM videos
      WHERE playlist_id = ?
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
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
  }));
}

export async function getAllVideos(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<VideoRow>(`
    SELECT id, uri, filename, playlist_id, episode_num, progress, duration, is_pinned
    FROM videos
    ORDER BY
      is_pinned DESC,
      CASE WHEN episode_num IS NULL THEN 1 ELSE 0 END,
      episode_num ASC,
      filename COLLATE NOCASE ASC
  `);

  return rows.map((row) => ({
    ...row,
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
  }));
}

export async function getVideoById(db: SQLiteDatabase, videoId: number) {
  const row = await db.getFirstAsync<VideoRow>(
    `
      SELECT id, uri, filename, playlist_id, episode_num, progress, duration, is_pinned
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
    playlist_id: toNumber(row.playlist_id),
    episode_num: toNullableEpisode(row.episode_num),
    progress: toNumber(row.progress, 0),
    duration: toNumber(row.duration, 0),
    is_pinned: toNumber(row.is_pinned, 0),
  };
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
      continue;
    }

    const info = await FileSystem.getInfoAsync(video.uri);
    if (info.exists) {
      await FileSystem.deleteAsync(video.uri, { idempotent: true });
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
