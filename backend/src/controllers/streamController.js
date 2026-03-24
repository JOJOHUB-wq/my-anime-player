const DEFAULT_UPSTREAM = 'https://animeapi.net';
const ANILIBRIA_BASE_URL = 'https://anilibria.top/api/v1';
const ANILIBRIA_HOST = 'https://anilibria.top';
const SHIKIMORI_BASE_URL = 'https://shikimori.one';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function normalizeQuery(value) {
  return String(value || '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandRomanNumerals(value) {
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

function stripSeasonMarkers(value) {
  return normalizeQuery(
    String(value || '')
      .replace(/\b\d+(st|nd|rd|th)\s+season\b/gi, ' ')
      .replace(/\bseason\s+\d+\b/gi, ' ')
      .replace(/\bpart\s+\d+\b/gi, ' ')
      .replace(/\bcour\s+\d+\b/gi, ' ')
      .replace(/\bmovie\b/gi, ' ')
      .replace(/\bova\b/gi, ' ')
      .replace(/\bona\b/gi, ' ')
  );
}

function buildQueryVariants(query) {
  const normalized = normalizeQuery(query);
  const fragments = normalized
    .split(/[:\-]/)
    .map((part) => normalizeQuery(part))
    .filter(Boolean);

  return [...new Set([
    normalized,
    expandRomanNumerals(normalized),
    stripSeasonMarkers(normalized),
    stripSeasonMarkers(expandRomanNumerals(normalized)),
    normalized.replace(/['’]/g, ''),
    normalized.replace(/['’:&]/g, ' '),
    ...fragments,
    ...fragments.map(expandRomanNumerals),
    ...fragments.map(stripSeasonMarkers),
  ])].filter(Boolean);
}

function tokenize(value) {
  return normalizeQuery(value)
    .toLowerCase()
    .split(/[^a-z0-9а-яёіїєґ]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreRelease(release, query) {
  const title = normalizeQuery(
    release?.name?.main || release?.name?.english || release?.name?.alternative || ''
  ).toLowerCase();
  const normalizedQuery = normalizeQuery(query).toLowerCase();

  if (!title) {
    return -1;
  }

  let score = 0;
  if (title === normalizedQuery) {
    score += 140;
  }
  if (title.includes(normalizedQuery)) {
    score += 70;
  }

  const titleTokens = new Set(tokenize(title));
  for (const token of tokenize(query)) {
    if (titleTokens.has(token)) {
      score += 12;
    }
  }

  if (String(release?.type?.value || '').toLowerCase() === 'tv') {
    score += 10;
  }

  return score;
}

function scoreCatalogResult(result, query) {
  if (result?.title) {
    const title = normalizeQuery(result.title).toLowerCase();
    const normalizedQuery = normalizeQuery(query).toLowerCase();

    if (!title) {
      return -1;
    }

    let score = 0;
    if (title === normalizedQuery) {
      score += 140;
    }
    if (title.includes(normalizedQuery)) {
      score += 70;
    }

    const titleTokens = new Set(tokenize(title));
    for (const token of tokenize(query)) {
      if (titleTokens.has(token)) {
        score += 12;
      }
    }

    if (String(result?.type || '').toLowerCase() === 'tv') {
      score += 10;
    }

    return score;
  }

  return scoreRelease(result, query);
}

function scoreResultAgainstQueries(result, queries) {
  const normalizedQueries = [...new Set((queries || []).map((value) => normalizeQuery(value)).filter(Boolean))];
  if (normalizedQueries.length === 0) {
    return scoreCatalogResult(result, '');
  }

  return Math.max(...normalizedQueries.map((query) => scoreCatalogResult(result, query)));
}

function toAbsoluteUrl(value) {
  if (!value) {
    return null;
  }

  return /^https?:\/\//i.test(value) ? value : `${ANILIBRIA_HOST}${value}`;
}

function mapAnilibriaEpisode(episode, fallbackImage) {
  const streamUrl = episode.hls_1080 || episode.hls_720 || episode.hls_480 || null;
  if (!streamUrl) {
    return null;
  }

  const number = Number(episode.ordinal || episode.sort_order || 0) || 0;

  return {
    id: String(episode.id || `${number}`),
    episode: number,
    title: episode.name || episode.name_english || `Episode ${number}`,
    image:
      toAbsoluteUrl(episode?.preview?.src) ||
      toAbsoluteUrl(episode?.preview?.optimized?.src) ||
      fallbackImage ||
      null,
    sub: null,
    dub: {
      url: streamUrl,
      label: 'AniLibria',
    },
  };
}

function mapAnilibriaRelease(detail) {
  const poster =
    toAbsoluteUrl(detail?.poster?.optimized?.src) ||
    toAbsoluteUrl(detail?.poster?.src) ||
    toAbsoluteUrl(detail?.poster?.thumbnail);
  const episodes = Array.isArray(detail?.episodes)
    ? detail.episodes
        .map((episode) => mapAnilibriaEpisode(episode, poster))
        .filter(Boolean)
    : [];

  if (episodes.length === 0) {
    return null;
  }

  return {
    id: String(detail.id),
    title: detail?.name?.main || detail?.name?.english || detail?.alias || 'AniLibria release',
    image: poster,
    provider: 'AniLibria',
    type: detail?.type?.value || 'anime',
    episodes,
  };
}

function hasPlayableEpisodes(result) {
  return Array.isArray(result?.episodes)
    ? result.episodes.some(
        (episode) =>
          (episode?.sub && typeof episode.sub.url === 'string' && episode.sub.url) ||
          (episode?.dub && typeof episode.dub.url === 'string' && episode.dub.url)
      )
    : false;
}

function toQuerySeed(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toQuerySeed(entry));
  }

  const normalized = normalizeQuery(value);
  return normalized ? [normalized] : [];
}

function buildDetailQueries(detail) {
  return [...new Set([
    ...toQuerySeed(detail?.russian),
    ...toQuerySeed(detail?.name),
    ...toQuerySeed(detail?.english),
    ...toQuerySeed(detail?.japanese),
    ...toQuerySeed(detail?.franchise),
    ...(Array.isArray(detail?.synonyms) ? detail.synonyms.flatMap((value) => toQuerySeed(value)) : []),
  ])].filter(Boolean);
}

function buildProxyUrl(req, targetUrl, headers) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const params = new URLSearchParams({
    url: targetUrl,
  });

  if (headers && Object.keys(headers).length > 0) {
    params.set('headers', JSON.stringify(headers));
  }

  return `${baseUrl}/api/streams/proxy?${params.toString()}`;
}

function rewriteManifestBody(body, sourceUrl, req, headers) {
  const sourceBase = new URL(sourceUrl);

  return body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, rawUrl) => {
          const absoluteUrl = new URL(rawUrl, sourceBase).toString();
          return `URI="${buildProxyUrl(req, absoluteUrl, headers)}"`;
        });
      }

      const absoluteUrl = new URL(trimmed, sourceBase).toString();
      return buildProxyUrl(req, absoluteUrl, headers);
    })
    .join('\n');
}

async function fetchShikimoriDetail(animeId) {
  const response = await fetch(`${SHIKIMORI_BASE_URL}/api/animes/${encodeURIComponent(animeId)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`shikimori_${response.status}`);
  }

  return response.json();
}

async function resolveCatalogByQueries(queryVariants, rankingQueries = queryVariants) {
  const aggregatedResults = [];

  for (const variant of queryVariants) {
    const [animeApiResults, anilibriaResults] = await Promise.allSettled([
      fetchAnimeApi(variant),
      fetchAnilibria(variant),
    ]);

    aggregatedResults.push(
      ...(animeApiResults.status === 'fulfilled' ? animeApiResults.value : []),
      ...(anilibriaResults.status === 'fulfilled' ? anilibriaResults.value : [])
    );

    if (aggregatedResults.some(hasPlayableEpisodes)) {
      // Keep gathering a few more hits via precomputed variants, but we already have usable results.
      continue;
    }
  }

  const dedupedResults = [];
  const seenKeys = new Set();
  for (const result of aggregatedResults) {
    const key = `${String(result?.provider || 'provider')}::${normalizeQuery(result?.title || result?.id || '')}`;
    if (!key || seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    dedupedResults.push(result);
  }

  return dedupedResults
    .filter(hasPlayableEpisodes)
    .sort(
      (left, right) =>
        scoreResultAgainstQueries(right, rankingQueries) - scoreResultAgainstQueries(left, rankingQueries)
    );
}

async function fetchAnimeApi(query) {
  const upstreamBase = (process.env.STREAM_PROVIDER_UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, '');
  const upstreamResponse = await fetch(`${upstreamBase}/anime/${encodeURIComponent(query)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  const responseText = await upstreamResponse.text();
  if (!upstreamResponse.ok) {
    return [];
  }

  try {
    const payload = JSON.parse(responseText);
    return Array.isArray(payload?.results) ? payload.results : [];
  } catch {
    return [];
  }
}

async function fetchAnilibria(query) {
  const searchResponse = await fetch(
    `${ANILIBRIA_BASE_URL}/app/search/releases?query=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!searchResponse.ok) {
    return [];
  }

  const searchPayload = await searchResponse.json();
  const releases = Array.isArray(searchPayload) ? searchPayload : [];
  const ranked = [...releases]
    .sort((left, right) => scoreRelease(right, query) - scoreRelease(left, query))
    .slice(0, 5);

  const detailedResults = await Promise.all(
    ranked.map(async (release) => {
      try {
        const releaseResponse = await fetch(
          `${ANILIBRIA_BASE_URL}/anime/releases/${encodeURIComponent(release.alias || release.id)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (!releaseResponse.ok) {
          return null;
        }

        return mapAnilibriaRelease(await releaseResponse.json());
      } catch {
        return null;
      }
    })
  );

  return detailedResults.filter(Boolean);
}

async function searchCatalog(req, res) {
  try {
    const query = String(req.query.q || '').trim();
    let extraQueries = [];

    if (typeof req.query.queries === 'string' && req.query.queries.trim()) {
      try {
        const parsed = JSON.parse(req.query.queries);
        if (Array.isArray(parsed)) {
          extraQueries = parsed
            .map((value) => normalizeQuery(value))
            .filter(Boolean);
        }
      } catch {
        extraQueries = String(req.query.queries)
          .split(',')
          .map((value) => normalizeQuery(value))
          .filter(Boolean);
      }
    }

    const initialQueries = [...new Set([query, ...extraQueries].map((value) => normalizeQuery(value)).filter(Boolean))];

    if (initialQueries.length === 0) {
      res.status(400).json({
        error: 'Query parameter q is required.',
      });
      return;
    }

    const queryVariants = [...new Set(initialQueries.flatMap((seed) => buildQueryVariants(seed)).filter(Boolean))].slice(0, 12);
    const combinedResults = await resolveCatalogByQueries(queryVariants, initialQueries);

    if (combinedResults.length === 0) {
      res.status(200).json({
        status: 'success',
        query: initialQueries[0],
        type: 'anime',
        results: [],
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      query: initialQueries[0],
      type: 'anime',
      results: combinedResults,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to resolve stream provider request.',
      detail: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}

async function resolveByShikimori(req, res) {
  try {
    const animeId = String(req.params.id || '').trim();
    if (!animeId) {
      res.status(400).json({ error: 'Anime id is required.' });
      return;
    }

    const detail = await fetchShikimoriDetail(animeId);
    const detailQueries = buildDetailQueries(detail);

    if (detailQueries.length === 0) {
      res.status(200).json({
        status: 'success',
        query: animeId,
        type: 'anime',
        results: [],
      });
      return;
    }

    const queryVariants = [...new Set(detailQueries.flatMap((seed) => buildQueryVariants(seed)).filter(Boolean))].slice(0, 14);
    const combinedResults = await resolveCatalogByQueries(queryVariants, detailQueries);

    res.status(200).json({
      status: 'success',
      query: detailQueries[0],
      type: 'anime',
      details: {
        id: detail.id,
        name: detail.name,
        russian: detail.russian,
        franchise: detail.franchise,
      },
      results: combinedResults,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to resolve streams by Shikimori id.',
      detail: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}

async function proxyStream(req, res) {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      res.status(400).json({ error: 'Target URL is required.' });
      return;
    }

    const targetUrl = new URL(rawUrl);
    if (!/^https?:$/i.test(targetUrl.protocol)) {
      res.status(400).json({ error: 'Only http/https upstreams are allowed.' });
      return;
    }

    let forwardedHeaders = {};
    if (typeof req.query.headers === 'string' && req.query.headers.trim()) {
      try {
        const parsed = JSON.parse(req.query.headers);
        if (parsed && typeof parsed === 'object') {
          forwardedHeaders = parsed;
        }
      } catch {
        forwardedHeaders = {};
      }
    }

    const upstreamResponse = await fetch(targetUrl.toString(), {
      headers: {
        Accept: '*/*',
        'User-Agent': DEFAULT_USER_AGENT,
        ...forwardedHeaders,
      },
    });

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).json({
        error: 'Upstream stream is unavailable.',
      });
      return;
    }

    const contentType = upstreamResponse.headers.get('content-type') || '';
    const isManifest =
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegURL') ||
      targetUrl.pathname.endsWith('.m3u8');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=60');

    if (isManifest) {
      const body = await upstreamResponse.text();
      const rewritten = rewriteManifestBody(body, targetUrl.toString(), req, forwardedHeaders);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.status(200).send(rewritten);
      return;
    }

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const arrayBuffer = await upstreamResponse.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    res.status(500).json({
      error: 'Unable to proxy stream.',
      detail: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}

module.exports = {
  searchCatalog,
  resolveByShikimori,
  proxyStream,
};
