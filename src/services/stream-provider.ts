type ProviderResponse = {
  status?: string;
  query?: string;
  type?: string;
  results?: ProviderResult[];
};

type ProviderResult = {
  id?: string;
  title?: string;
  image?: string;
  provider?: string;
  type?: string;
  episodes?: ProviderEpisode[];
};

type ProviderEpisode = {
  id?: string;
  episode?: string | number;
  title?: string;
  image?: string;
  sub?: ProviderStream | null;
  dub?: ProviderStream | null;
};

type ProviderSubtitle = {
  lang?: string;
  url?: string;
};

type ProviderStream = {
  url?: string;
  headers?: Record<string, string>;
  subtitles?: ProviderSubtitle[];
  label?: string;
};

export type StreamingSource = {
  url: string;
  label: string;
  dub: string;
  headers?: Record<string, string>;
};

export type StreamingEpisode = {
  id: string;
  number: number;
  title: string;
  image: string | null;
  dubs: string[];
  sources: StreamingSource[];
};

export type StreamingSeason = {
  id: string;
  title: string;
  image: string | null;
  provider: string;
  type: string;
  episodes: StreamingEpisode[];
};

export type StreamingResolution = {
  providerConfigured: boolean;
  resolvedQuery: string | null;
  seasons: StreamingSeason[];
};

const DEFAULT_STREAM_PROVIDER_BASE_URL = 'https://animeapi.net';
const DEFAULT_BACKEND_BASE_URL = 'https://217-60-245-84.sslip.io';

function normalizeQuery(value: unknown) {
  return String(value || '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandRomanNumerals(value: string) {
  return value
    .replace(/\bii\b/gi, '2')
    .replace(/\biii\b/gi, '3')
    .replace(/\biv\b/gi, '4')
    .replace(/\bv\b/gi, '5')
    .replace(/\bvi\b/gi, '6')
    .replace(/\bvii\b/gi, '7')
    .replace(/\bviii\b/gi, '8')
    .replace(/\bix\b/gi, '9')
    .replace(/\bx\b/gi, '10');
}

function stripSeasonMarkers(value: string) {
  return normalizeQuery(
    value
      .replace(/\b\d+(st|nd|rd|th)\s+season\b/gi, ' ')
      .replace(/\bseason\s+\d+\b/gi, ' ')
      .replace(/\bpart\s+\d+\b/gi, ' ')
      .replace(/\bcour\s+\d+\b/gi, ' ')
      .replace(/\bmovie\b/gi, ' ')
      .replace(/\bova\b/gi, ' ')
      .replace(/\bona\b/gi, ' ')
  );
}

function buildLooseVariants(value: string) {
  const normalized = normalizeQuery(value);
  if (!normalized) {
    return [] as string[];
  }

  const fragments = normalized
    .split(/[:\-]/)
    .map((part) => normalizeQuery(part))
    .filter(Boolean);

  const variants = new Set<string>([
    normalized,
    expandRomanNumerals(normalized),
    stripSeasonMarkers(normalized),
    stripSeasonMarkers(expandRomanNumerals(normalized)),
    normalized.replace(/['’]/g, ''),
    normalized.replace(/['’:&]/g, ' '),
    ...fragments,
    ...fragments.map(stripSeasonMarkers),
    ...fragments.map(expandRomanNumerals),
  ]);

  return [...variants]
    .map((part) => normalizeQuery(part))
    .filter(Boolean);
}

function buildCandidateQueries(input: {
  title: string;
  alternativeTitles?: (string | string[] | null | undefined)[];
  franchise?: string | null;
}) {
  const values = [
    input.title,
    ...(input.alternativeTitles ?? []),
    input.franchise ?? '',
    input.title.split(':')[0] ?? '',
    input.title.split('-')[0] ?? '',
    input.title.split(':').slice(1).join(':') ?? '',
    input.title.split('-').slice(1).join('-') ?? '',
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .flatMap((value) => buildLooseVariants(String(value || '')))
    .filter(Boolean);

  return [...new Set(values)];
}

function tokenize(value: string) {
  return normalizeQuery(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseEpisodeNumber(value: string | number | undefined, fallbackIndex: number) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  return fallbackIndex + 1;
}

function normalizeHeaders(headers?: Record<string, string>) {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const entries = Object.entries(headers).filter(
    ([key, value]) => typeof key === 'string' && Boolean(key) && typeof value === 'string' && Boolean(value)
  );

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function scoreResult(result: ProviderResult, query: string) {
  const resultTitle = normalizeQuery(result.title || '').toLowerCase();
  const normalizedQuery = normalizeQuery(query).toLowerCase();

  if (!resultTitle) {
    return -1;
  }

  let score = 0;

  if (resultTitle === normalizedQuery) {
    score += 120;
  }

  if (resultTitle.includes(normalizedQuery)) {
    score += 55;
  }

  const queryTokens = tokenize(query);
  const resultTokens = new Set(tokenize(result.title || ''));

  for (const token of queryTokens) {
    if (resultTokens.has(token)) {
      score += 10;
    }
  }

  if ((result.type || '').toLowerCase() === 'tv') {
    score += 8;
  }

  if ((result.type || '').toLowerCase() === 'movie') {
    score -= 3;
  }

  if ((result.type || '').toLowerCase() === 'ova') {
    score -= 6;
  }

  return score;
}

function buildSources(episode: ProviderEpisode) {
  const sources: StreamingSource[] = [];

  if (episode.sub?.url) {
    const label = episode.sub.label || 'Original';
    sources.push({
      url: episode.sub.url,
      label,
      dub: label,
      headers: normalizeHeaders(episode.sub.headers),
    });

    if ((episode.sub.subtitles?.length ?? 0) > 0) {
      sources.push({
        url: episode.sub.url,
        label: 'Subtitles',
        dub: 'Subtitles',
        headers: normalizeHeaders(episode.sub.headers),
      });
    }
  }

  if (episode.dub?.url) {
    const label = episode.dub.label || 'Dubbed';
    sources.push({
      url: episode.dub.url,
      label,
      dub: label,
      headers: normalizeHeaders(episode.dub.headers),
    });
  }

  return sources;
}

function mapResultToSeason(result: ProviderResult): StreamingSeason | null {
  const rawEpisodes = Array.isArray(result.episodes) ? result.episodes : [];

  if (rawEpisodes.length === 0) {
    return null;
  }

  const mappedEpisodes = rawEpisodes
    .map<StreamingEpisode | null>((episode, index) => {
      const sources = buildSources(episode);
      if (sources.length === 0) {
        return null;
      }

      const number = parseEpisodeNumber(episode.episode, index);
      return {
        id: episode.id || `${result.id || result.title || 'season'}-${number}`,
        number,
        title: normalizeQuery(episode.title || `Episode ${number}`),
        image: episode.image || result.image || null,
        dubs: [...new Set(sources.map((source) => source.dub))],
        sources,
      };
    })
    .filter((episode): episode is StreamingEpisode => Boolean(episode))
    .sort((left, right) => left.number - right.number);

  if (mappedEpisodes.length === 0) {
    return null;
  }

  return {
    id: result.id || result.title || `season-${Date.now()}`,
    title: normalizeQuery(result.title || 'Season'),
    image: result.image || null,
    provider: result.provider || 'AnimeAPI',
    type: result.type || 'anime',
    episodes: mappedEpisodes,
  };
}

async function fetchJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Provider responded with ${response.status}`);
  }

  return (await response.json()) as ProviderResponse;
}

async function fetchProviderCatalogWithAlternatives(queries: string[], signal?: AbortSignal) {
  const providerBaseUrl = process.env.EXPO_PUBLIC_STREAM_PROVIDER_BASE_URL?.trim() || DEFAULT_STREAM_PROVIDER_BASE_URL;
  const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || DEFAULT_BACKEND_BASE_URL;
  const normalizedQueries = [...new Set(queries.map(normalizeQuery).filter(Boolean))];
  const primaryQuery = normalizedQueries[0] || '';

  const endpoints = [
    `${backendBaseUrl.replace(/\/+$/, '')}/api/streams/search?q=${encodeURIComponent(primaryQuery)}&queries=${encodeURIComponent(JSON.stringify(normalizedQueries))}`,
    `${providerBaseUrl.replace(/\/+$/, '')}/anime/${encodeURIComponent(primaryQuery)}`,
  ];

  let payload: ProviderResponse | null = null;

  for (const endpoint of endpoints) {
    try {
      payload = await fetchJson(endpoint, signal);
      break;
    } catch {
      continue;
    }
  }

  if (!payload) {
    throw new Error('stream_provider_unreachable');
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const rankedResults = [...results].sort(
    (left, right) => scoreResult(right, primaryQuery) - scoreResult(left, primaryQuery)
  );
  const seasons = rankedResults
    .map((result) => mapResultToSeason(result))
    .filter((season): season is StreamingSeason => Boolean(season));

  return {
    resolvedQuery: payload.query || primaryQuery,
    seasons,
  };
}

async function fetchProviderCatalog(query: string, signal?: AbortSignal) {
  return fetchProviderCatalogWithAlternatives([query], signal);
}

function mapProviderResponseToResolution(payload: ProviderResponse, query: string): StreamingResolution {
  const results = Array.isArray(payload.results) ? payload.results : [];
  const rankedResults = [...results].sort(
    (left, right) => scoreResult(right, query) - scoreResult(left, query)
  );
  const seasons = rankedResults
    .map((result) => mapResultToSeason(result))
    .filter((season): season is StreamingSeason => Boolean(season));

  return {
    providerConfigured: true,
    resolvedQuery: payload.query || query,
    seasons,
  };
}

export async function resolveStreamingCatalog(
  input: {
    title: string;
    alternativeTitles?: string[];
    franchise?: string | null;
  },
  signal?: AbortSignal
): Promise<StreamingResolution> {
  const candidateQueries = buildCandidateQueries(input);

  try {
    const combinedResult = await fetchProviderCatalogWithAlternatives(candidateQueries, signal);

    if (combinedResult.seasons.length > 0) {
      return {
        providerConfigured: true,
        resolvedQuery: combinedResult.resolvedQuery,
        seasons: combinedResult.seasons,
      };
    }
  } catch {
    // Fall back to one-by-one queries below.
  }

  for (const query of candidateQueries) {
    try {
      const result = await fetchProviderCatalog(query, signal);

      if (result.seasons.length > 0) {
        return {
          providerConfigured: true,
          resolvedQuery: result.resolvedQuery,
          seasons: result.seasons,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    providerConfigured: true,
    resolvedQuery: candidateQueries[0] ?? null,
    seasons: [],
  };
}

export async function resolveStreamingCatalogByAnimeId(animeId: number, signal?: AbortSignal) {
  const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || DEFAULT_BACKEND_BASE_URL;
  const payload = await fetchJson(
    `${backendBaseUrl.replace(/\/+$/, '')}/api/streams/shikimori/${encodeURIComponent(String(animeId))}`,
    signal
  );

  return mapProviderResponseToResolution(payload, String(animeId));
}

export function buildStreamProxyUrl(url: string, headers?: Record<string, string>) {
  const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || DEFAULT_BACKEND_BASE_URL;
  const params = new URLSearchParams({
    url,
  });

  if (headers && Object.keys(headers).length > 0) {
    params.set('headers', JSON.stringify(headers));
  }

  return `${backendBaseUrl.replace(/\/+$/, '')}/api/streams/proxy?${params.toString()}`;
}
