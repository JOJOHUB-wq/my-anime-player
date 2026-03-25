require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Server } = require('socket.io');
const youtubedl = require('youtube-dl-exec');

const PORT = Number(process.env.PORT || 3000);
const KODIK_TOKEN = process.env.KODIK_TOKEN || '8b72506e7c10b6510834316dcb989601';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const httpClient = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
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
    };
  }

  return {
    message: error.message,
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'anime-backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/kodik/search', async (req, res) => {
  const shikimoriId = String(req.query.shikimori_id || '').trim();
  const title = String(req.query.title || '').trim();

  if (!shikimoriId && !title) {
    return res.status(400).json({
      ok: false,
      error: 'Either shikimori_id or title is required.',
    });
  }

  try {
    const response = await httpClient.get('https://kodikapi.com/search', {
      params: {
        token: KODIK_TOKEN,
        with_material_data: 'true',
        with_episodes_data: 'true',
        not_blocked_for_me: 'true',
        ...(shikimoriId ? { shikimori_id: shikimoriId } : {}),
        ...(title ? { title } : {}),
      },
    });

    return res.json(response.data);
  } catch (error) {
    console.error('Kodik proxy error:', serializeAxiosError(error));
    return res.status(502).json({
      ok: false,
      error: 'Failed to fetch Kodik.',
      details: serializeAxiosError(error),
    });
  }
});

app.post('/api/youtube/extract', async (req, res) => {
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
});

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
