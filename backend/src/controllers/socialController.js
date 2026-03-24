const { all, get, run } = require('../db/database');
const { isUserConnected } = require('../sockets');

function requireMember(res, user) {
  if (!user?.id || user.is_guest) {
    res.status(403).json({
      error: 'Guest accounts cannot use social features.',
    });
    return false;
  }

  return true;
}

function buildPairKey(leftUserId, rightUserId) {
  const [a, b] = [Number(leftUserId), Number(rightUserId)].sort((left, right) => left - right);
  return `${a}:${b}`;
}

function mapFriendStatus(lastSeenAt, userId) {
  if (isUserConnected(userId)) {
    return 'online';
  }

  if (!lastSeenAt) {
    return 'offline';
  }

  const lastSeenTimestamp = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenTimestamp)) {
    return 'offline';
  }

  const diff = Date.now() - lastSeenTimestamp;

  if (diff < 5 * 60 * 1000) {
    return 'online';
  }

  if (diff < 30 * 60 * 1000) {
    return 'away';
  }

  return 'offline';
}

function mapFriendRow(row) {
  return {
    id: String(row.id),
    userId: row.id,
    name: row.username,
    handle: `@${row.username}`,
    email: row.email,
    avatarSeed: row.avatar_seed,
    rank: row.rank,
    role: row.role,
    status: mapFriendStatus(row.last_seen_at, row.id),
    invitedToRoom: Boolean(row.invited_to_room),
    createdAt: row.friendship_created_at,
  };
}

async function getAuthenticatedUserRow(userId) {
  return get(
    `
      SELECT id, username, email, role, rank, is_guest, avatar_seed, created_at, last_seen_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );
}

async function ensureExistingFriend(userId, friendId) {
  const friendship = await get(
    `
      SELECT id
      FROM friendships
      WHERE user_id = ? AND friend_id = ?
      LIMIT 1
    `,
    [userId, friendId]
  );

  return Boolean(friendship);
}

async function listFriends(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const rows = await all(
      `
        SELECT
          users.id,
          users.username,
          users.email,
          users.role,
          users.rank,
          users.avatar_seed,
          users.last_seen_at,
          friendships.created_at AS friendship_created_at,
          EXISTS (
            SELECT 1
            FROM room_invites
            WHERE room_invites.sender_id = ?
              AND room_invites.recipient_id = users.id
              AND room_invites.status = 'pending'
          ) AS invited_to_room
        FROM friendships
        INNER JOIN users ON users.id = friendships.friend_id
        WHERE friendships.user_id = ?
        ORDER BY
          invited_to_room DESC,
          LOWER(users.username) ASC
      `,
      [req.user.id, req.user.id]
    );

    res.status(200).json({
      friends: rows.map(mapFriendRow),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to load friends.',
    });
  }
}

async function addFriend(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const query = String(req.body.query || '').trim();

    if (query.length < 2) {
      res.status(400).json({
        error: 'Friend username or email is required.',
      });
      return;
    }

    const friend = await get(
      `
        SELECT id, username, email, role, rank, avatar_seed, last_seen_at
        FROM users
        WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?))
          AND is_guest = 0
        LIMIT 1
      `,
      [query, query]
    );

    if (!friend) {
      res.status(404).json({
        error: 'User not found.',
      });
      return;
    }

    if (Number(friend.id) === Number(req.user.id)) {
      res.status(400).json({
        error: 'You cannot add yourself as a friend.',
      });
      return;
    }

    await run(
      `
        INSERT OR IGNORE INTO friendships (user_id, friend_id)
        VALUES (?, ?)
      `,
      [req.user.id, friend.id]
    );

    await run(
      `
        INSERT OR IGNORE INTO friendships (user_id, friend_id)
        VALUES (?, ?)
      `,
      [friend.id, req.user.id]
    );

    const created = await get(
      `
        SELECT
          users.id,
          users.username,
          users.email,
          users.role,
          users.rank,
          users.avatar_seed,
          users.last_seen_at,
          friendships.created_at AS friendship_created_at,
          0 AS invited_to_room
        FROM friendships
        INNER JOIN users ON users.id = friendships.friend_id
        WHERE friendships.user_id = ? AND friendships.friend_id = ?
        LIMIT 1
      `,
      [req.user.id, friend.id]
    );

    res.status(201).json({
      friend: created ? mapFriendRow(created) : null,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to add friend.',
    });
  }
}

async function inviteFriendToRoom(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const friendId = Number(req.params.friendId);
    if (!Number.isFinite(friendId) || friendId <= 0) {
      res.status(400).json({
        error: 'Invalid friend id.',
      });
      return;
    }

    const isFriend = await ensureExistingFriend(req.user.id, friendId);
    if (!isFriend) {
      res.status(404).json({
        error: 'Friendship not found.',
      });
      return;
    }

    await run(
      `
        UPDATE room_invites
        SET status = 'cleared',
            updated_at = CURRENT_TIMESTAMP
        WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'
      `,
      [req.user.id, friendId]
    );

    await run(
      `
        INSERT INTO room_invites (sender_id, recipient_id, status, created_at, updated_at)
        VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [req.user.id, friendId]
    );

    res.status(200).json({
      ok: true,
      invitedToRoom: true,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to invite friend.',
    });
  }
}

async function clearFriendInvite(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const friendId = Number(req.params.friendId);
    if (!Number.isFinite(friendId) || friendId <= 0) {
      res.status(400).json({
        error: 'Invalid friend id.',
      });
      return;
    }

    await run(
      `
        UPDATE room_invites
        SET status = 'cleared',
            updated_at = CURRENT_TIMESTAMP
        WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'
      `,
      [req.user.id, friendId]
    );

    res.status(200).json({
      ok: true,
      invitedToRoom: false,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to clear invite.',
    });
  }
}

async function listChats(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const rows = await all(
      `
        SELECT
          chat_threads.id,
          chat_threads.updated_at,
          users.id AS friend_id,
          users.username,
          users.email,
          users.rank,
          users.role,
          users.avatar_seed,
          users.last_seen_at
        FROM chat_threads
        INNER JOIN users
          ON users.id = CASE
            WHEN CAST(SUBSTR(chat_threads.direct_pair_key, 1, INSTR(chat_threads.direct_pair_key, ':') - 1) AS INTEGER) = ?
              THEN CAST(SUBSTR(chat_threads.direct_pair_key, INSTR(chat_threads.direct_pair_key, ':') + 1) AS INTEGER)
            ELSE CAST(SUBSTR(chat_threads.direct_pair_key, 1, INSTR(chat_threads.direct_pair_key, ':') - 1) AS INTEGER)
          END
        WHERE chat_threads.direct_pair_key LIKE ? OR chat_threads.direct_pair_key LIKE ?
        ORDER BY datetime(chat_threads.updated_at) DESC
      `,
      [req.user.id, `${req.user.id}:%`, `%:${req.user.id}`]
    );

    res.status(200).json({
      chats: rows.map((row) => ({
        id: String(row.id),
        friendId: String(row.friend_id),
        lastMessageAt: row.updated_at,
        friend: {
          id: String(row.friend_id),
          name: row.username,
          handle: `@${row.username}`,
          email: row.email,
          avatarSeed: row.avatar_seed,
          rank: row.rank,
          role: row.role,
          status: mapFriendStatus(row.last_seen_at, row.friend_id),
          invitedToRoom: false,
          createdAt: row.updated_at,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to load chats.',
    });
  }
}

async function getOrCreateChat(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const friendId = Number(req.params.friendId);

    if (!Number.isFinite(friendId) || friendId <= 0) {
      res.status(400).json({
        error: 'Invalid friend id.',
      });
      return;
    }

    const isFriend = await ensureExistingFriend(req.user.id, friendId);
    if (!isFriend) {
      res.status(404).json({
        error: 'Friendship not found.',
      });
      return;
    }

    const pairKey = buildPairKey(req.user.id, friendId);
    await run(
      `
        INSERT OR IGNORE INTO chat_threads (direct_pair_key, created_at, updated_at)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [pairKey]
    );

    const thread = await get(
      `
        SELECT id, direct_pair_key, created_at, updated_at
        FROM chat_threads
        WHERE direct_pair_key = ?
        LIMIT 1
      `,
      [pairKey]
    );

    res.status(200).json({
      chat: {
        id: String(thread.id),
        friendId: String(friendId),
        lastMessageAt: thread.updated_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to open chat.',
    });
  }
}

async function listMessages(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const chatId = Number(req.params.chatId);
    if (!Number.isFinite(chatId) || chatId <= 0) {
      res.status(400).json({
        error: 'Invalid chat id.',
      });
      return;
    }

    const thread = await get(
      `
        SELECT id, direct_pair_key
        FROM chat_threads
        WHERE id = ?
        LIMIT 1
      `,
      [chatId]
    );

    if (!thread || !thread.direct_pair_key.split(':').includes(String(req.user.id))) {
      res.status(404).json({
        error: 'Chat not found.',
      });
      return;
    }

    const rows = await all(
      `
        SELECT
          chat_messages.id,
          chat_messages.thread_id,
          chat_messages.sender_id,
          chat_messages.body,
          chat_messages.created_at
        FROM chat_messages
        WHERE chat_messages.thread_id = ?
        ORDER BY datetime(chat_messages.created_at) ASC, chat_messages.id ASC
      `,
      [chatId]
    );

    res.status(200).json({
      messages: rows.map((row) => ({
        id: String(row.id),
        chatId: String(row.thread_id),
        sender: Number(row.sender_id) === Number(req.user.id) ? 'me' : 'friend',
        text: row.body,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to load messages.',
    });
  }
}

async function sendMessage(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const chatId = Number(req.params.chatId);
    const text = String(req.body.text || '').trim();

    if (!Number.isFinite(chatId) || chatId <= 0) {
      res.status(400).json({
        error: 'Invalid chat id.',
      });
      return;
    }

    if (!text) {
      res.status(400).json({
        error: 'Message text is required.',
      });
      return;
    }

    const thread = await get(
      `
        SELECT id, direct_pair_key
        FROM chat_threads
        WHERE id = ?
        LIMIT 1
      `,
      [chatId]
    );

    if (!thread || !thread.direct_pair_key.split(':').includes(String(req.user.id))) {
      res.status(404).json({
        error: 'Chat not found.',
      });
      return;
    }

    const result = await run(
      `
        INSERT INTO chat_messages (thread_id, sender_id, body, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [chatId, req.user.id, text]
    );

    await run(
      `
        UPDATE chat_threads
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [chatId]
    );

    const message = await get(
      `
        SELECT id, thread_id, sender_id, body, created_at
        FROM chat_messages
        WHERE id = ?
        LIMIT 1
      `,
      [result.lastID]
    );

    res.status(201).json({
      message: {
        id: String(message.id),
        chatId: String(message.thread_id),
        sender: Number(message.sender_id) === Number(req.user.id) ? 'me' : 'friend',
        text: message.body,
        createdAt: message.created_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to send message.',
    });
  }
}

async function getCurrentUserProfile(req, res) {
  if (!req.user?.id) {
    res.status(200).json({
      user: req.user,
    });
    return;
  }

  try {
    const user = await getAuthenticatedUserRow(req.user.id);
    if (!user) {
      res.status(404).json({
        error: 'User not found.',
      });
      return;
    }

    const [friendRow, messageRow] = await Promise.all([
      get(`SELECT COUNT(*) AS total FROM friendships WHERE user_id = ?`, [req.user.id]),
      get(`SELECT COUNT(*) AS total FROM chat_messages WHERE sender_id = ?`, [req.user.id]),
    ]);

    res.status(200).json({
      user: {
        id: String(user.id),
        username: user.username,
        email: user.email,
        role: user.role,
        rank: user.rank,
        avatar_seed: user.avatar_seed,
        created_at: user.created_at,
        is_guest: Boolean(user.is_guest),
        stats: {
          friends: Number(friendRow?.total || 0),
          messages: Number(messageRow?.total || 0),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to load current user.',
    });
  }
}

module.exports = {
  addFriend,
  clearFriendInvite,
  getCurrentUserProfile,
  getOrCreateChat,
  inviteFriendToRoom,
  listChats,
  listFriends,
  listMessages,
  sendMessage,
};
