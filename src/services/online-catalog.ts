import i18n from '@/src/i18n';
import { Platform } from 'react-native';

const SHIKIMORI_BASE_URL = 'https://shikimori.one';
const MEDIA_BACKEND_BASE_URL =
  process.env.EXPO_PUBLIC_MEDIA_BACKEND_URL ||
  (Platform.OS === 'web'
    ? 'https://217-60-245-84.sslip.io/api/media'
    : 'http://217.60.245.84:3000/api');

const KODIK_REQUEST_TIMEOUT_MS = 35000;

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
  episodes?: Record<string, KodikEpisodePayload | string | null | undefined>;
  episodes_data?: Record<string, KodikEpisodePayload | string | null | undefined>;
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
  title?: string;
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
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      throw new Error(payload.error);
    }

    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isKodikRetryableError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes('HTTP 502') ||
      error.message.includes('HTTP 520') ||
      error.message.includes('HTTP 521') ||
      error.message.includes('HTTP 522') ||
      error.message.includes('HTTP 524'))
  );
}

async function requestKodikResults(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  const url = `${MEDIA_BACKEND_BASE_URL}/kodik/search?${searchParams.toString()}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), KODIK_REQUEST_TIMEOUT_MS);

    try {
      const payload = await requestJson<KodikSearchResponse>(url, {
        headers: {
          Accept: 'application/json',
          ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
        },
        signal: controller.signal,
      });
      return payload.results ?? [];
    } catch (error) {
      console.error('Kodik request failed:', error);

      if (attempt === 0 && isKodikRetryableError(error)) {
        await delay(2500);
        continue;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(i18n.t('online.providerTimeout'));
      }

      if (error instanceof Error && error.message.includes('Kodik timeout')) {
        throw new Error(i18n.t('online.providerTimeout'));
      }

      if (error instanceof Error && error.message.includes('Network request failed')) {
        throw new Error(i18n.t('online.providerBlocked'));
      }

      if (
        error instanceof Error &&
        (error.message.includes('Kodik blocked') ||
          error.message.includes('Failed to fetch Kodik.') ||
          error.message.includes('All Kodik mirrors failed.'))
      ) {
        throw new Error(i18n.t('online.providerBlocked'));
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return [];
}

function mapCatalogAnime(item: ShikimoriCatalogResponseItem): CatalogAnime {
  return {
    id: item.id,
    title: item.russian || item.name || i18n.t('discover.unknownTitle'),
    originalTitle: item.name || item.russian || i18n.t('discover.unknownTitle'),
    score: item.score || '0.0',
    posterUrl: buildShikimoriPosterUrl(item.image?.original),
    episodes: toPositiveNumber(item.episodes, 0),
    episodesAired: toPositiveNumber(item.episodes_aired, 0),
    kind: item.kind || 'tv',
  };
}

function mergeTranslations(results: KodikSearchResult[]) {
  const translations = new Map<string, KodikTranslation>();

  for (const result of results) {
    const translationTitle = normalizeText(result.translation?.title) || 'Original';
    const translationType = normalizeText(result.translation?.type) || 'voice';

    // STRICT FIX: Ensure we deduplicate only by translation.id, meaning AniDub isn't overwritten by AniLibria!
    if (!result.translation?.id) continue;
    const key = String(result.translation.id);

    const playerLink = normalizeKodikLink(result.link);
    const posterUrl = normalizeKodikLink(result.material_data?.anime_poster_url) ?? normalizeKodikLink(result.material_data?.poster_url);

    // EXACT FLATTEN LOGIC FROM CHAT.TXT RESTORED TO GUARANTEE ALL EPISODES
    const flatEpisodes: KodikEpisode[] = [];
    if (result.seasons) {
      Object.values(result.seasons).forEach((seasonPayload: any) => {
        if (seasonPayload?.episodes) {
          Object.entries(seasonPayload.episodes).forEach(([epNum, epData]: [string, any]) => {
            const numericNum = toPositiveNumber(epNum.replace(/\D+/g, ''), 0) || 1;
            flatEpisodes.push({
              id: `${key}-ep-${numericNum}`,
              number: numericNum,
              title: epData?.title || buildEpisodeTitle(numericNum),
              link: typeof epData === 'string' ? normalizeKodikLink(epData) : normalizeKodikLink(epData?.link) ?? playerLink,
              screenshot: epData?.screenshots?.[0] ?? null,
            });
          });
        }
      });
    } else if (result.episodes || result.episodes_data) {
       const episodesPayload = result.episodes || result.episodes_data;
       if (episodesPayload) {
          Object.entries(episodesPayload).forEach(([epNum, epData]: [string, any]) => {
            const numericNum = toPositiveNumber(epNum.replace(/\D+/g, ''), 0) || 1;
            flatEpisodes.push({
              id: `${key}-ep-${numericNum}`,
              number: numericNum,
              title: epData?.title || buildEpisodeTitle(numericNum),
              link: typeof epData === 'string' ? normalizeKodikLink(epData) : normalizeKodikLink(epData?.link) ?? playerLink,
              screenshot: epData?.screenshots?.[0] ?? null,
            });
          });
       }
    }

    const uniqueEpisodes = Array.from(new Map(flatEpisodes.map(item => [item.number, item])).values())
      .sort((a, b) => a.number - b.number);

    // To prevent duplicate keys overwriting episodes, we create the entry directly:
    translations.set(key, {
      id: key,
      title: translationTitle,
      type: translationType,
      posterUrl,
      playerLink,
      seasons: [{ id: 'all-episodes', label: 'Всі серії', link: playerLink, episodes: uniqueEpisodes }]
    });
  }

  return Array.from(translations.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export async function fetchTrendingCatalog(allowHentai: boolean = false) {
  const ratingFilter = allowHentai ? '' : '&rating=g,pg,pg_13,r,r_plus';
  const payload = await requestJson<ShikimoriCatalogResponseItem[]>(
    `${SHIKIMORI_BASE_URL}/api/animes?limit=30&order=ranked${ratingFilter}`
  );

  return Array.isArray(payload) ? payload.map(mapCatalogAnime) : [];
}

export async function searchCatalog(query: string, allowHentai: boolean = false) {
  const trimmed = query.trim();

  if (!trimmed) {
    return fetchTrendingCatalog(allowHentai);
  }

  const ratingFilter = allowHentai ? '' : '&rating=g,pg,pg_13,r,r_plus';
  const payload = await requestJson<ShikimoriCatalogResponseItem[]>(
    `${SHIKIMORI_BASE_URL}/api/animes?search=${encodeURIComponent(trimmed)}&limit=20${ratingFilter}`
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

export async function fetchKodikTranslations(shikimoriId: number, fallbackTitle?: string | string[] | null) {
  const titleVariants = [
    ...new Set(
      (Array.isArray(fallbackTitle) ? fallbackTitle : [fallbackTitle])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    ),
  ];

  try {
    const results: KodikSearchResult[] = [];
    let lastError: unknown = null;

    try {
      const fetched = await requestKodikResults({
        shikimori_id: String(shikimoriId),
      });
      // Strict filtering by shikimori_id to prevent franchise bleed (e.g. jojo parts)
      const strictFiltered = fetched.filter((res: any) => String(res.shikimori_id) === String(shikimoriId));
      results.push(...strictFiltered);
    } catch (error) {
      lastError = error;
    }

    for (const title of titleVariants) {
      try {
        results.push(
          ...(await requestKodikResults({
            title,
            strict: 'true',
            types: 'anime-serial,anime',
          }))
        );
      } catch (error) {
        lastError = error;
      }
    }

    if (results.length === 0) {
      throw lastError instanceof Error ? lastError : new Error(i18n.t('online.providerError'));
    }

    return mergeTranslations(results);
  } catch (error) {
    console.error('Kodik Fetch Failed:', error);
    throw error;
  }
}
