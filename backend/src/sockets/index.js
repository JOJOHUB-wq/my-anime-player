const { extractToken, verifyJwtToken } = require('../middleware/authMiddleware');
const { run } = require('../db/database');

const activeUserSockets = new Map();

function getSocketToken(socket) {
  const authToken = socket.handshake.auth?.token;

  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }

  const headerToken = extractToken({
    headers: {
      authorization: socket.handshake.headers?.authorization || '',
    },
  });

  return headerToken;
}

function initializeSocketServer(io) {
  io.use((socket, next) => {
    try {
      const token = getSocketToken(socket);

      if (!token) {
        next(new Error('Authentication token is required.'));
        return;
      }

      socket.data.user = verifyJwtToken(token);
      next();
    } catch (error) {
      next(new Error('Invalid or expired authentication token.'));
    }
  });

  io.on('connection', (socket) => {
    socket.data.rooms = new Set();
    const userId = Number(socket.data.user?.id || 0);

    if (userId > 0) {
      activeUserSockets.set(userId, (activeUserSockets.get(userId) || 0) + 1);
      void run(`UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`, [userId]).catch(() => undefined);
    }

    socket.on('join_room', ({ roomId }, ack = () => {}) => {
      if (!roomId || typeof roomId !== 'string') {
        ack({
          ok: false,
          error: 'roomId is required.',
        });
        return;
      }

      if (socket.data.user?.is_guest) {
        ack({
          ok: false,
          error: 'Guest accounts cannot join co-watching rooms.',
        });
        return;
      }

      socket.join(roomId);
      socket.data.rooms.add(roomId);

      ack({
        ok: true,
        roomId,
      });

      socket.to(roomId).emit('user_joined', {
        roomId,
        user: {
          username: socket.data.user.username,
          role: socket.data.user.role,
          rank: socket.data.user.rank,
        },
      });
    });

    socket.on('leave_room', ({ roomId }, ack = () => {}) => {
      if (!roomId || typeof roomId !== 'string') {
        ack({
          ok: false,
          error: 'roomId is required.',
        });
        return;
      }

      socket.leave(roomId);
      socket.data.rooms.delete(roomId);

      ack({
        ok: true,
        roomId,
      });

      socket.to(roomId).emit('user_left', {
        roomId,
        user: {
          username: socket.data.user.username,
        },
      });
    });

    socket.on('sync_player', ({ roomId, action, currentTime, isPlaying }, ack = () => {}) => {
      if (!roomId || typeof roomId !== 'string') {
        ack({
          ok: false,
          error: 'roomId is required.',
        });
        return;
      }

      if (!socket.data.rooms.has(roomId)) {
        ack({
          ok: false,
          error: 'You must join the room before syncing the player.',
        });
        return;
      }

      if (!['play', 'pause', 'seek'].includes(action)) {
        ack({
          ok: false,
          error: 'Invalid sync action.',
        });
        return;
      }

      const payload = {
        roomId,
        action,
        currentTime: Number.isFinite(currentTime) ? currentTime : 0,
        isPlaying: Boolean(isPlaying),
        user: {
          username: socket.data.user.username,
          role: socket.data.user.role,
          rank: socket.data.user.rank,
        },
        sentAt: new Date().toISOString(),
      };

      socket.to(roomId).emit('player_synced', payload);
      ack({
        ok: true,
        roomId,
      });
    });

    socket.on('disconnect', () => {
      socket.data.rooms?.clear?.();
      if (userId > 0) {
        const nextCount = (activeUserSockets.get(userId) || 1) - 1;

        if (nextCount <= 0) {
          activeUserSockets.delete(userId);
        } else {
          activeUserSockets.set(userId, nextCount);
        }

        void run(`UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`, [userId]).catch(() => undefined);
      }
    });
  });
}

function isUserConnected(userId) {
  return activeUserSockets.has(Number(userId));
}

module.exports = {
  initializeSocketServer,
  isUserConnected,
};
