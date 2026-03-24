require('dotenv').config();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const cors = require('cors');
const express = require('express');
const { Server } = require('socket.io');

const { initializeDatabase } = require('./src/db/database');
const { authMiddleware } = require('./src/middleware/authMiddleware');
const { roleMiddleware } = require('./src/middleware/roleMiddleware');
const authRoutes = require('./src/routes/authRoutes');
const commentRoutes = require('./src/routes/commentRoutes');
const socialRoutes = require('./src/routes/socialRoutes');
const streamRoutes = require('./src/routes/streamRoutes');
const { getCurrentUserProfile } = require('./src/controllers/socialController');
const { initializeSocketServer } = require('./src/sockets');

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const webRootCandidates = [
  path.resolve(process.cwd(), process.env.WEB_DIST_PATH || 'public'),
  path.resolve(process.cwd(), '../dist'),
];
const webRoot = webRootCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) || null;
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((value) => value.trim())
  : true;
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

if (webRoot) {
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/socket.io/') ||
      req.path === '/health'
    ) {
      next();
      return;
    }

    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.path === '/' || req.path.endsWith('.html') || !path.extname(req.path)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  app.use(
    express.static(webRoot, {
      extensions: ['html'],
      etag: false,
      lastModified: false,
      maxAge: 0,
    })
  );
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'anime-streaming-backend',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/social', authMiddleware, socialRoutes);

app.get('/api/me', authMiddleware, getCurrentUserProfile);

app.get(
  '/api/admin/ping',
  authMiddleware,
  roleMiddleware(['admin', 'moderator']),
  (_req, res) => {
    res.status(200).json({
      ok: true,
      message: 'Protected admin/moderator route is reachable.',
    });
  }
);

if (webRoot) {
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(webRoot, 'index.html'));
  });
}

initializeSocketServer(io);

const port = Number(process.env.PORT || 4000);

async function bootstrap() {
  try {
    await initializeDatabase();

    server.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
      console.log(`Socket.io server ready on ws://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to bootstrap backend:', error);
    process.exit(1);
  }
}

bootstrap();
