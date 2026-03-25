import i18n from '@/src/i18n';
import { Platform } from 'react-native';

const SHIKIMORI_BASE_URL = 'https://shikimori.one';
const MEDIA_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_MEDIA_BACKEND_URL || 'http://217.60.245.84:3000/api';

type ShikimoriCatalogResponseItem = {
  id: number;
  name: string;
  russian: string;
  image?: {
    original?: string;
  };
  score?: string;
  kind?: string;
  episodes?: number;
  episodes_aired?: number;
};

type ShikimoriDetailResponse = ShikimoriCatalogResponseItem & {
  description?: string | null;
  status?: string | null;
  genres?: {
    id: number;
    name: string;
    russian: string;
  }[];
};

type KodikSearchResponse = {
  results?: KodikSearchResult[];
};

type KodikSearchResult = {
  id?: string | number;
  title?: string;
  other_title?: string;
  link?: string;
  type?: string;
  episodes_count?: number | string;
  last_season?: number | string;
  material_data?: {
    anime_poster_url?: string;
    poster_url?: string;
  };
  translation?: {
    id?: number | string;
    title?: string;
    type?: string;
  };
  seasons?: Record<string, KodikSeasonPayload | string | null | undefined>;
};

type KodikSeasonPayload = {
  link?: string;
  episodes?: Record<string, KodikEpisodePayload | string | null | undefined>;
};

type KodikEpisodePayload = {
  title?: string;
  link?: string;
  screenshots?: string[];
};

export type CatalogAnime = {
  id: number;
  title: string;
  originalTitle: string;
  score: string;
  posterUrl: string | null;
  episodes: number;
  episodesAired: number;
  kind: string;
};

export type CatalogAnimeDetail = CatalogAnime & {
  description: string;
  status: string;
  genres: string[];
};

export type KodikEpisode = {
  id: string;
  number: number;
  title: string;
  link: string | null;
  screenshot: string | null;
};

export type KodikSeason = {
  id: string;
  label: string;
  link: string | null;
  episodes: KodikEpisode[];
};

export type KodikTranslation = {
  id: string;
  title: string;
  type: string;
  posterUrl: string | null;
  playerLink: string | null;
  seasons: KodikSeason[];
};

function toPositiveNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildShikimoriPosterUrl(path?: string) {
  if (!path) {
    return null;
  }

  return `${SHIKIMORI_BASE_URL}${path}`;
}

function normalizeText(value?: string | null) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^[\]]+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKodikLink(link?: string | null) {
  if (!link) {
    return null;
  }

  if (link.startsWith('//')) {
    return `https:${link}`;
  }

  if (link.startsWith('http://') || link.startsWith('https://')) {
    return link;
  }

  if (link.startsWith('/')) {
    return `https://kodik.info${link}`;
  }

  return `https://${link}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

async function requestKodikResults(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);

  const url = `${MEDIA_BACKEND_BASE_URL}/kodik/search?${searchParams.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const payload = await requestJson<KodikSearchResponse>(url, {
      headers: {
        Accept: 'application/json',
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
      },
      signal: controller.signal,
    });
    console.log('Kodik Fetch Response:', payload);
    return payload.results ?? [];
  } catch (error) {
    console.error('Kodik request failed:', error);
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('Network request failed'))
    ) {
      throw new Error(i18n.t('online.providerBlocked'));
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapCatalogAnime(item: ShikimoriCatalogResponseItem): CatalogAnime {
  return {
    id: item.id,
    title: item.russian || item.name || 'Unknown title',
    originalTitle: item.name || item.russian || 'Unknown title',
    score: item.score || '0.0',
    posterUrl: buildShikimoriPosterUrl(item.image?.original),
    episodes: toPositiveNumber(item.episodes, 0),
    episodesAired: toPositiveNumber(item.episodes_aired, 0),
    kind: item.kind || 'tv',
  };
}

function buildFallbackEpisodes(count: number, link: string | null) {
  return Array.from({ length: Math.max(count, 1) }, (_, index) => ({
    id: `episode-${index + 1}`,
    number: index + 1,
    title: `Episode ${index + 1}`,
    link,
    screenshot: null,
  }));
}

function parseSeasonEpisodes(
  seasonPayload: KodikSeasonPayload | string | null | undefined,
  seasonLabel: string,
  fallbackLink: string | null,
  fallbackCount: number
) {
  if (typeof seasonPayload === 'string') {
    return buildFallbackEpisodes(fallbackCount, normalizeKodikLink(seasonPayload));
  }

  const seasonLink = normalizeKodikLink(seasonPayload?.link) ?? fallbackLink;
  const episodesData = seasonPayload?.episodes;

  if (!episodesData || typeof episodesData !== 'object') {
    return buildFallbackEpisodes(fallbackCount, seasonLink);
  }

  const episodes = Object.entries(episodesData)
    .map(([episodeKey, episodePayload]) => {
      const episodeNumber = toPositiveNumber(String(episodeKey).replace(/\D+/g, ''), 0);

      if (typeof episodePayload === 'string') {
        return {
          id: `${seasonLabel}-${episodeNumber || episodeKey}`,
          number: episodeNumber || 1,
          title: `Episode ${episodeNumber || 1}`,
          link: normalizeKodikLink(episodePayload) ?? seasonLink,
          screenshot: null,
        };
      }

      const payload = episodePayload ?? {};
      const link = normalizeKodikLink(payload.link) ?? seasonLink;
      const title = normalizeText(payload.title) || `Episode ${episodeNumber || 1}`;
      const screenshot = payload.screenshots?.[0] ?? null;

      return {
        id: `${seasonLabel}-${episodeNumber || episodeKey}`,
        number: episodeNumber || 1,
        title,
        link,
        screenshot,
      };
    })
    .sort((left, right) => left.number - right.number);

  return episodes.length > 0 ? episodes : buildFallbackEpisodes(fallbackCount, seasonLink);
}

function parseSeasons(result: KodikSearchResult): KodikSeason[] {
  const fallbackLink = normalizeKodikLink(result.link);
  const fallbackCount = toPositiveNumber(result.episodes_count, 1);
  const seasonsPayload = result.seasons;

  if (!seasonsPayload || typeof seasonsPayload !== 'object' || Array.isArray(seasonsPayload)) {
    const fallbackLabel =
      toPositiveNumber(result.last_season, 0) > 1
        ? `Season ${toPositiveNumber(result.last_season, 1)}`
        : 'Season 1';

    return [
      {
        id: 'season-1',
        label: fallbackLabel,
        link: fallbackLink,
        episodes: buildFallbackEpisodes(fallbackCount, fallbackLink),
      },
    ];
  }

  const seasons = Object.entries(seasonsPayload)
    .map(([seasonKey, seasonPayload], index) => {
      const numericSeason = toPositiveNumber(String(seasonKey).replace(/\D+/g, ''), index + 1);
      const label = `Season ${numericSeason}`;
      const seasonLink =
        typeof seasonPayload === 'string'
          ? normalizeKodikLink(seasonPayload)
          : normalizeKodikLink(seasonPayload?.link) ?? fallbackLink;

      return {
        id: `season-${numericSeason}`,
        label,
        link: seasonLink,
        episodes: parseSeasonEpisodes(seasonPayload, label, seasonLink, fallbackCount),
      };
    })
    .sort((left, right) => {
      const leftValue = toPositiveNumber(left.id.replace(/\D+/g, ''), 0);
      const rightValue = toPositiveNumber(right.id.replace(/\D+/g, ''), 0);
      return leftValue - rightValue;
    });

  return seasons.length > 0
    ? seasons
    : [
        {
          id: 'season-1',
          label: 'Season 1',
          link: fallbackLink,
          episodes: buildFallbackEpisodes(fallbackCount, fallbackLink),
        },
      ];
}

function mergeTranslations(results: KodikSearchResult[]) {
  const translations = new Map<string, KodikTranslation>();

  for (const result of results) {
    const translationTitle = normalizeText(result.translation?.title) || 'Original';
    const translationType = normalizeText(result.translation?.type) || 'voice';
    const keyBase = result.translation?.id ?? `${translationTitle}-${translationType}`;
    const key = String(keyBase);
    const playerLink = normalizeKodikLink(result.link);
    const seasons = parseSeasons(result);
    const posterUrl =
      normalizeKodikLink(result.material_data?.anime_poster_url) ??
      normalizeKodikLink(result.material_data?.poster_url);

    const existing = translations.get(key);

    if (!existing) {
      translations.set(key, {
        id: key,
        title: translationTitle,
        type: translationType,
        posterUrl,
        playerLink,
        seasons,
      });
      continue;
    }

    const mergedSeasons = new Map(existing.seasons.map((season) => [season.id, season]));

    for (const season of seasons) {
      const current = mergedSeasons.get(season.id);
      if (!current) {
        mergedSeasons.set(season.id, season);
        continue;
      }

      const mergedEpisodes = new Map(current.episodes.map((episode) => [episode.number, episode]));
      for (const episode of season.episodes) {
        if (!mergedEpisodes.has(episode.number)) {
          mergedEpisodes.set(episode.number, episode);
        }
      }

      mergedSeasons.set(season.id, {
        ...current,
        link: current.link ?? season.link,
        episodes: [...mergedEpisodes.values()].sort((left, right) => left.number - right.number),
      });
    }

    translations.set(key, {
      ...existing,
      posterUrl: existing.posterUrl ?? posterUrl,
      playerLink: existing.playerLink ?? playerLink,
      seasons: [...mergedSeasons.values()].sort((left, right) => {
        const leftValue = toPositiveNumber(left.id.replace(/\D+/g, ''), 0);
        const rightValue = toPositiveNumber(right.id.replace(/\D+/g, ''), 0);
        return leftValue - rightValue;
      }),
    });
  }

  return [...translations.values()].sort((left, right) => {
    const preferredOrder = ['anilibria', 'anidub', 'studioband', 'subtitles', 'original'];
    const leftIndex = preferredOrder.findIndex((item) => left.title.toLowerCase().includes(item));
    const rightIndex = preferredOrder.findIndex((item) => right.title.toLowerCase().includes(item));
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }

    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  });
}

export async function fetchTrendingCatalog() {
  const payload = await requestJson<ShikimoriCatalogResponseItem[]>(
    `${SHIKIMORI_BASE_URL}/api/animes?limit=30&order=ranked`
  );

  return Array.isArray(payload) ? payload.map(mapCatalogAnime) : [];
}

export async function searchCatalog(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return fetchTrendingCatalog();
  }

  const payload = await requestJson<ShikimoriCatalogResponseItem[]>(
    `${SHIKIMORI_BASE_URL}/api/animes?search=${encodeURIComponent(trimmed)}&limit=20`
  );

  return Array.isArray(payload) ? payload.map(mapCatalogAnime) : [];
}

export async function fetchAnimeDetail(id: number) {
  const payload = await requestJson<ShikimoriDetailResponse>(
    `${SHIKIMORI_BASE_URL}/api/animes/${id}`
  );

  const base = mapCatalogAnime(payload);

  return {
    ...base,
    description: normalizeText(payload.description) || i18n.t('discover.descriptionFallback'),
    status: normalizeText(payload.status) || 'ongoing',
    genres: Array.isArray(payload.genres)
      ? payload.genres.map((genre) => genre.russian || genre.name).filter(Boolean)
      : [],
  } satisfies CatalogAnimeDetail;
}

export async function fetchKodikTranslations(shikimoriId: number, fallbackTitle?: string | null) {
  try {
    let results = await requestKodikResults({
      shikimori_id: String(shikimoriId),
    });

    if (results.length === 0 && fallbackTitle?.trim()) {
      results = await requestKodikResults({
        title: fallbackTitle.trim(),
      });
    }

    if (results.length === 0) {
      throw new Error(i18n.t('online.providerError'));
    }

    return mergeTranslations(results);
  } catch (error) {
    console.error('Kodik Fetch Failed:', error);
    throw error;
  }
}
