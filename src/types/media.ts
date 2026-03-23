export type AccentName = 'blood' | 'blue' | 'steel';

export type AudioTrackInfo = {
  id: number;
  name: string;
};

export type PlaybackProgress = {
  positionMs: number;
  durationMs: number;
  finished: boolean;
  updatedAt: number;
};

export type MediaSourceKind = 'sandbox' | 'media-library';

export type MediaItem = {
  id: string;
  uri: string;
  filename: string;
  cleanTitle: string;
  seriesTitle: string;
  collectionTitle: string;
  groupKey: string;
  seasonNumber: number;
  episodeNumber: number | null;
  importedAt: number;
  sizeBytes: number | null;
  albumTitle?: string;
  thumbnailUri?: string;
  mediaAssetId?: string;
  sourceKind: MediaSourceKind;
  durationMs?: number;
  audioTracks?: AudioTrackInfo[];
  progress?: PlaybackProgress;
};

export type PlayerSettings = {
  accent: AccentName;
  doubleTapSeekSeconds: number;
  skipIntroSeconds: number;
  skipOutroSeconds: number;
  autoDeleteAfterWatch: boolean;
};

export type ParsedMediaFilename = {
  seriesTitle: string;
  episode: string | null;
  episodeNumber: number | null;
  cleanedTitle: string;
  groupKey: string;
};

export type LibraryVideo = {
  id: string;
  assetId: string;
  uri: string;
  filename: string;
  displayTitle: string;
  cleanedTitle: string;
  seriesTitle: string;
  episode: string | null;
  episodeNumber: number | null;
  albumTitle: string;
  durationSeconds: number;
  createdAt: number;
  folderKey: string;
  watchedProgress: number;
};

export type LibraryFolder = {
  key: string;
  title: string;
  kind: 'camera' | 'series' | 'misc';
  videos: LibraryVideo[];
};

export type DownloadRecord = {
  id: string;
  remoteUrl: string;
  localPath: string;
  filename: string;
  cleanedTitle: string;
  watchedProgress: number;
};

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  accent: 'blood',
  doubleTapSeekSeconds: 10,
  skipIntroSeconds: 85,
  skipOutroSeconds: 90,
  autoDeleteAfterWatch: false,
};
