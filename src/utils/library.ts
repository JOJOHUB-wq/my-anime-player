import { MediaItem } from '@/src/types/media';

export const CAMERA_GROUP_KEY = 'camera';
export const CAMERA_GROUP_TITLE = 'Мої відео з камери';

export type SeriesGroup = {
  key: string;
  title: string;
  icon: 'folder' | 'camera';
  episodes: MediaItem[];
  seasonCount: number;
  episodeCount: number;
  finishedCount: number;
  updatedAt: number;
};

export function sortEpisodes(items: MediaItem[]) {
  return [...items].sort((left, right) => {
    if (left.seasonNumber !== right.seasonNumber) {
      return left.seasonNumber - right.seasonNumber;
    }

    if ((left.episodeNumber ?? 9999) !== (right.episodeNumber ?? 9999)) {
      return (left.episodeNumber ?? 9999) - (right.episodeNumber ?? 9999);
    }

    return left.cleanTitle.localeCompare(right.cleanTitle);
  });
}

export function buildSeriesGroups(items: MediaItem[]) {
  const reduced = items.reduce<Map<string, SeriesGroup>>((groups, item) => {
    const existing = groups.get(item.groupKey);

    if (existing) {
      existing.episodes.push(item);
      existing.finishedCount += item.progress?.finished ? 1 : 0;
      existing.updatedAt = Math.max(existing.updatedAt, item.progress?.updatedAt ?? item.importedAt);
      return groups;
    }

    groups.set(item.groupKey, {
      key: item.groupKey,
      title:
        item.groupKey === CAMERA_GROUP_KEY
          ? CAMERA_GROUP_TITLE
          : item.collectionTitle || item.seriesTitle || 'Без назви',
      icon: item.groupKey === CAMERA_GROUP_KEY ? 'camera' : 'folder',
      episodes: [item],
      seasonCount: 1,
      episodeCount: 1,
      finishedCount: item.progress?.finished ? 1 : 0,
      updatedAt: item.progress?.updatedAt ?? item.importedAt,
    });

    return groups;
  }, new Map());

  return [...reduced.values()]
    .map((group) => {
      const episodes = sortEpisodes(group.episodes);
      return {
        ...group,
        episodes,
        episodeCount: episodes.length,
        seasonCount: new Set(episodes.map((episode) => episode.seasonNumber)).size,
      };
    })
    .sort((left, right) => {
      if (left.key === CAMERA_GROUP_KEY) {
        return -1;
      }

      if (right.key === CAMERA_GROUP_KEY) {
        return 1;
      }

      return right.updatedAt - left.updatedAt;
    });
}

export function getSeriesGroup(items: MediaItem[], key: string) {
  return buildSeriesGroups(items).find((group) => group.key === key);
}

export function getRecentEpisodes(items: MediaItem[], count = 8) {
  return [...items]
    .filter((item) => item.progress?.positionMs && !item.progress.finished)
    .sort((left, right) => (right.progress?.updatedAt ?? 0) - (left.progress?.updatedAt ?? 0))
    .slice(0, count);
}
