import { ParsedMediaFilename } from '@/src/types/media';

const FILE_EXTENSION_RE = /\.[^.]+$/i;
const BRACKET_TAG_RE = /\[[^\]]*\]?/g;
const PAREN_TAG_RE = /\([^)]*\)?/g;
const EPISODE_TOKEN_RE = /\bE(?:P(?:ISODE)?)?\s*0*(\d{1,4})\b/i;
const BRACKET_EPISODE_RE = /\[(\d{1,4})]/g;
const TRAILING_NUMBER_RE = /(?:^|[\s-])0*(\d{1,4})(?=$|[\s-])/g;
const MULTI_SPACE_RE = /\s+/g;

function normalizeSpaces(value: string) {
  return value.replace(MULTI_SPACE_RE, ' ').trim();
}

function normalizeKey(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function extractEpisode(filename: string) {
  const bracketMatches = [...filename.matchAll(BRACKET_EPISODE_RE)];
  if (bracketMatches.length > 0) {
    return String(Number(bracketMatches.at(-1)?.[1] ?? '0'));
  }

  const directEpisode = filename.match(EPISODE_TOKEN_RE);
  if (directEpisode?.[1]) {
    return String(Number(directEpisode[1]));
  }

  const standaloneMatches = [...filename.matchAll(TRAILING_NUMBER_RE)];
  if (standaloneMatches.length > 0) {
    return String(Number(standaloneMatches.at(-1)?.[1] ?? '0'));
  }

  return null;
}

function cleanupTitle(value: string) {
  return normalizeSpaces(
    value
      .replace(BRACKET_TAG_RE, ' ')
      .replace(PAREN_TAG_RE, ' ')
      .replace(/_/g, ' ')
      .replace(EPISODE_TOKEN_RE, ' ')
      .replace(TRAILING_NUMBER_RE, ' ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*-\s*/g, '')
      .replace(/\s*-\s*$/g, '')
  );
}

export function parseMediaFilename(filename: string): ParsedMediaFilename {
  const withoutExtension = filename.replace(FILE_EXTENSION_RE, '');
  const episode = extractEpisode(withoutExtension);
  const seriesTitle = cleanupTitle(withoutExtension);
  const cleanedTitle = episode
    ? `${seriesTitle} - E${episode.padStart(2, '0')}`
    : seriesTitle;

  return {
    seriesTitle,
    episode,
    episodeNumber: episode ? Number(episode) : null,
    cleanedTitle,
    groupKey: normalizeKey(seriesTitle || filename),
  };
}

export function parseAnimeFilename(filename: string) {
  const parsed = parseMediaFilename(filename);

  return {
    cleanTitle: parsed.cleanedTitle,
    seriesTitle: parsed.seriesTitle,
    collectionTitle: parsed.seriesTitle,
    groupKey: parsed.groupKey,
    seasonNumber: 1,
    episodeNumber: parsed.episodeNumber,
  };
}
