const { extractToken, verifyJwtToken } = require('../middleware/authMiddleware');
const { all, run } = require('../db/database');

const activeUserSockets = new Map();
const roomStates = new Map();
let socketServer = null;

function userRoom(userId) {
  return `user:${Number(userId)}`;
}

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
  socketServer = io;

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
      socket.join(userRoom(userId));
      activeUserSockets.set(userId, (activeUserSockets.get(userId) || 0) + 1);
      void run(`UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`, [userId]).catch(() => undefined);
    }

    socket.on('join_room', async ({ roomId }, ack = () => {}) => {
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

      const messages = await all(
        `
          SELECT id, room_id, user_id, username, body, is_guest, created_at
          FROM room_messages
          WHERE room_id = ?
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT 100
        `,
        [roomId]
      ).catch(() => []);

      ack({
        ok: true,
        roomId,
        state: roomStates.get(roomId) ?? null,
        messages: messages.reverse().map((row) => ({
          id: String(row.id),
          roomId: row.room_id,
          userId: row.user_id ? String(row.user_id) : null,
          username: row.username,
          text: row.body,
          isGuest: Boolean(row.is_guest),
          createdAt: row.created_at,
        })),
      });

      const currentState = roomStates.get(roomId);
      if (currentState) {
        socket.emit('room_state', currentState);
      }

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

    socket.on('set_media', ({ roomId, media }, ack = () => {}) => {
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
          error: 'You must join the room before setting media.',
        });
        return;
      }

      if (!media || typeof media.uri !== 'string' || !media.uri.trim()) {
        ack({
          ok: false,
          error: 'A playable media uri is required.',
        });
        return;
      }

      const nextState = {
        roomId,
        media: {
          uri: media.uri.trim(),
          title: typeof media.title === 'string' ? media.title.trim() : '',
          subtitle: typeof media.subtitle === 'string' ? media.subtitle.trim() : '',
          headers:
            media.headers && typeof media.headers === 'object'
              ? media.headers
              : undefined,
        },
        currentTime: 0,
        isPlaying: false,
        updatedAt: new Date().toISOString(),
        updatedBy: {
          username: socket.data.user.username,
          role: socket.data.user.role,
          rank: socket.data.user.rank,
        },
      };

      roomStates.set(roomId, nextState);
      io.to(roomId).emit('room_state', nextState);

      ack({
        ok: true,
        state: nextState,
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

      const previousState = roomStates.get(roomId) || {
        roomId,
        media: null,
        currentTime: 0,
        isPlaying: false,
      };
      roomStates.set(roomId, {
        ...previousState,
        currentTime: payload.currentTime,
        isPlaying: payload.isPlaying,
        updatedAt: payload.sentAt,
        updatedBy: payload.user,
      });

      socket.to(roomId).emit('player_synced', payload);
      ack({
        ok: true,
        roomId,
      });
    });

    socket.on('room_message', async ({ roomId, text }, ack = () => {}) => {
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
          error: 'You must join the room before sending messages.',
        });
        return;
      }

      const body = String(text || '').trim();
      if (!body) {
        ack({
          ok: false,
          error: 'Message text is required.',
        });
        return;
      }

      const result = await run(
        `
          INSERT INTO room_messages (room_id, user_id, username, body, is_guest, created_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          roomId,
          socket.data.user?.id || null,
          socket.data.user?.username || 'Guest',
          body,
          socket.data.user?.is_guest ? 1 : 0,
        ]
      ).catch(() => null);

      if (!result?.lastID) {
        ack({
          ok: false,
          error: 'Unable to send room message.',
        });
        return;
      }

      const payload = {
        id: String(result.lastID),
        roomId,
        userId: socket.data.user?.id ? String(socket.data.user.id) : null,
        username: socket.data.user?.username || 'Guest',
        text: body,
        isGuest: Boolean(socket.data.user?.is_guest),
        createdAt: new Date().toISOString(),
      };

      io.to(roomId).emit('room_message', payload);
      ack({
        ok: true,
        message: payload,
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

function emitToUser(userId, eventName, payload) {
  if (!socketServer || !userId) {
    return;
  }

  socketServer.to(userRoom(userId)).emit(eventName, payload);
}

module.exports = {
  emitToUser,
  initializeSocketServer,
  isUserConnected,
};
