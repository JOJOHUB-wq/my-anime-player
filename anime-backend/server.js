require('dotenv').config();

const http = require('http');
const https = require('https');
const dns = require('dns');
const { URLSearchParams } = require('url');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Server } = require('socket.io');
const youtubedl = require('youtube-dl-exec');

const PORT = Number(process.env.PORT || 3000);
const KODIK_TOKEN = process.env.KODIK_TOKEN || '8b72506e7c10b6510834316dcb989601';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KODIK_MIRROR_BASES = [
  'https://kodikapi.com/search',
  'https://kodik.biz/search',
  'https://kodik.info/search',
];
const dnsResolver = new dns.Resolver();
dnsResolver.setServers(['1.1.1.1', '8.8.8.8']);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const httpClient = axios.create({
  timeout: 15000,
  httpsAgent: new https.Agent({
    lookup(hostname, options, callback) {
      dnsResolver.resolve4(hostname, (error, addresses) => {
        if (!error && addresses && addresses.length > 0) {
          callback(null, addresses[0], 4);
          return;
        }

        dns.lookup(hostname, options, callback);
      });
    },
  }),
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    Referer: 'https://kodik.info/',
    Origin: 'https://kodik.info',
  },
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function sanitizeFilename(filename) {
  const normalized = String(filename || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return `youtube-${Date.now()}.mp4`;
  }

  return /\.(mp4|m4v|mov|webm)$/i.test(normalized) ? normalized : `${normalized}.mp4`;
}

function pickFirstPlayableUrl(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && /^https?:\/\//i.test(line)) || null;
}

function serializeAxiosError(error) {
  if (error.response) {
    return {
      message: error.message,
      status: error.response.status,
      data: error.response.data,
      headers: error.response.headers,
    };
  }

  return {
    message: error.message,
  };
}

function isKodikPayload(data) {
  return Boolean(data) && typeof data === 'object' && !Array.isArray(data);
}

function classifyKodikFailure(serializedError) {
  const message = String(serializedError?.message || '').toLowerCase();
  const data = String(serializedError?.data || '').toLowerCase();
  const status = Number(serializedError?.status || 0);

  if (
    message.includes('timeout') ||
    status >= 500 ||
    data.includes('error 520') ||
    data.includes('cloudflare')
  ) {
    return 'KODIK_TIMEOUT';
  }

  return 'KODIK_BLOCKED';
}

async function fetchKodikPayload(queryParams) {
  const params = {
    token: KODIK_TOKEN,
    with_material_data: 'true',
    with_episodes_data: 'true',
    not_blocked_for_me: 'true',
    ...queryParams,
  };

  let lastError = null;

  for (const endpoint of KODIK_MIRROR_BASES) {
    try {
      const response = await httpClient.get(endpoint, { params });

      if (!isKodikPayload(response.data)) {
        throw new Error(`Unexpected Kodik payload from ${endpoint}`);
      }

      return response.data;
    } catch (error) {
      const serialized = serializeAxiosError(error);
      lastError = serialized;
      console.error(`Kodik mirror failed: ${endpoint}`, serialized);
    }
  }

  const fallbackTargets = KODIK_MIRROR_BASES.map(
    (endpoint) => `${endpoint}?${new URLSearchParams(params).toString()}`
  );

  for (const fallbackUrl of fallbackTargets) {
    try {
      const fallbackResponse = await axios.get('https://api.allorigins.win/raw', {
        timeout: 15000,
        params: { url: fallbackUrl },
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Referer: 'https://kodik.info/',
          Origin: 'https://kodik.info',
        },
      });

      if (!isKodikPayload(fallbackResponse.data)) {
        throw new Error(`Unexpected AllOrigins payload for ${fallbackUrl}`);
      }

      return fallbackResponse.data;
    } catch (error) {
      const serialized = serializeAxiosError(error);
      lastError = serialized;
      console.error(`Kodik AllOrigins fallback failed: ${fallbackUrl}`, serialized);
    }
  }

  const finalError = new Error('All Kodik mirrors failed.');
  finalError.details = lastError;
  finalError.code = classifyKodikFailure(lastError);
  throw finalError;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'anime-backend',
    timestamp: new Date().toISOString(),
  });
});

async function handleKodikSearch(req, res) {
  const shikimoriId = String(req.query.shikimori_id || '').trim();
  const title = String(req.query.title || '').trim();
  const strict = String(req.query.strict || '').trim();
  const types = String(req.query.types || '').trim();

  if (!shikimoriId && !title) {
    return res.status(400).json({
      ok: false,
      error: 'Either shikimori_id or title is required.',
    });
  }

  try {
    const payload = await fetchKodikPayload({
      ...(shikimoriId ? { shikimori_id: shikimoriId } : {}),
      ...(title ? { title } : {}),
      ...(strict ? { strict } : {}),
      ...(types ? { types } : {}),
    });

    return res.json(payload);
  } catch (error) {
    const serialized = serializeAxiosError(error);
    console.error('Kodik proxy error:', serialized);

    if (error?.code === 'KODIK_TIMEOUT' || classifyKodikFailure(serialized) === 'KODIK_TIMEOUT') {
      return res.status(502).json({ error: 'Kodik timeout' });
    }

    return res.status(502).json({ error: 'Kodik blocked' });
  }
}

app.get('/api/kodik/search', handleKodikSearch);
app.get('/api/media/kodik/search', handleKodikSearch);

async function handleYouTubeExtract(req, res) {
  const url = String(req.body?.url || '').trim();

  if (!url) {
    return res.status(400).json({
      ok: false,
      error: 'url is required.',
    });
  }

  try {
    const [rawUrlOutput, metadata] = await Promise.all([
      youtubedl(url, {
        getUrl: true,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
        format: 'best[ext=mp4]/best',
      }),
      youtubedl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
        skipDownload: true,
      }),
    ]);

    const directUrl = pickFirstPlayableUrl(rawUrlOutput);

    if (!directUrl) {
      return res.status(502).json({
        ok: false,
        error: 'yt-dlp did not return a direct playable URL.',
      });
    }

    const title = metadata?.title || metadata?.fulltitle || 'YouTube';
    const filename = sanitizeFilename(metadata?._filename || title);

    return res.json({
      ok: true,
      url: directUrl,
      title,
      filename,
    });
  } catch (error) {
    console.error('YouTube extract error:', error);
    return res.status(502).json({
      ok: false,
      error: 'Failed to extract YouTube media URL.',
      details: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

app.post('/api/youtube/extract', handleYouTubeExtract);
app.post('/api/media/youtube/extract', handleYouTubeExtract);

io.on('connection', (socket) => {
  socket.on('join_room', (roomId) => {
    const room = String(roomId || '').trim();
    if (!room) {
      return;
    }

    socket.join(room);
    socket.to(room).emit('room_event', {
      type: 'join_room',
      socketId: socket.id,
      room,
    });
  });

  socket.on('leave_room', (roomId) => {
    const room = String(roomId || '').trim();
    if (!room) {
      return;
    }

    socket.leave(room);
    socket.to(room).emit('room_event', {
      type: 'leave_room',
      socketId: socket.id,
      room,
    });
  });

  socket.on('sync_player', (payload) => {
    const room = String(payload?.room || '').trim();
    if (!room) {
      return;
    }

    socket.to(room).emit('sync_player', {
      ...payload,
      socketId: socket.id,
    });
  });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled backend error:', error);
  res.status(500).json({
    ok: false,
    error: 'Internal server error.',
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`anime-backend listening on port ${PORT}`);
});
