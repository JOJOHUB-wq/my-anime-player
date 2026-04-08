const { all, get, run } = require('../db/database');
const { emitToUser, isUserConnected } = require('../sockets');

function notifyUsers(userIds, eventName, payload) {
  [...new Set(userIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))].forEach(
    (userId) => {
      emitToUser(userId, eventName, payload);
    }
  );
}

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

function buildRoomId(leftUserId, rightUserId) {
  return `room:${buildPairKey(leftUserId, rightUserId)}:${Date.now()}`;
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

function mapUserPreview(row) {
  return {
    id: String(row.id),
    userId: String(row.id),
    name: row.username,
    handle: `@${row.username}`,
    email: row.email,
    avatarSeed: row.avatar_seed,
    rank: row.rank,
    role: row.role,
    status: mapFriendStatus(row.last_seen_at, row.id),
    invitedToRoom: Boolean(row.invited_to_room),
    createdAt: row.created_at || row.friendship_created_at || row.request_created_at || row.invite_created_at,
  };
}

function mapFriendRow(row) {
  return {
    ...mapUserPreview(row),
    invitedToRoom: Boolean(row.invited_to_room),
    createdAt: row.friendship_created_at,
  };
}

function mapRequestRow(row, direction) {
  return {
    id: String(row.request_id),
    direction,
    status: row.request_status,
    createdAt: row.request_created_at,
    user: {
      ...mapUserPreview(row),
      invitedToRoom: false,
      createdAt: row.request_created_at,
    },
  };
}

function mapRoomInviteRow(row, direction) {
  return {
    id: String(row.invite_id),
    roomId: row.room_id,
    direction,
    status: row.invite_status,
    createdAt: row.invite_created_at,
    user: {
      ...mapUserPreview(row),
      invitedToRoom: direction === 'outgoing',
      createdAt: row.invite_created_at,
    },
  };
}

async function getAuthenticatedUserRow(userId) {
  return get(
    `
      SELECT id, username, email, role, rank, is_guest, avatar_seed, age, created_at, last_seen_at
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

async function getFriendshipState(viewerId, targetId) {
  if (!viewerId || !targetId || Number(viewerId) === Number(targetId)) {
    return 'self';
  }

  const friendship = await get(
    `SELECT id FROM friendships WHERE user_id = ? AND friend_id = ? LIMIT 1`,
    [viewerId, targetId]
  );
  if (friendship) {
    return 'friend';
  }

  const outgoing = await get(
    `
      SELECT id
      FROM friend_requests
      WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'
      LIMIT 1
    `,
    [viewerId, targetId]
  );
  if (outgoing) {
    return 'outgoing_request';
  }

  const incoming = await get(
    `
      SELECT id
      FROM friend_requests
      WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'
      LIMIT 1
    `,
    [targetId, viewerId]
  );
  if (incoming) {
    return 'incoming_request';
  }

  return 'none';
}

async function listFriends(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const [friendRows, incomingRequestRows, outgoingRequestRows, incomingInviteRows, outgoingInviteRows] =
      await Promise.all([
        all(
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
            ORDER BY invited_to_room DESC, LOWER(users.username) ASC
          `,
          [req.user.id, req.user.id]
        ),
        all(
          `
            SELECT
              friend_requests.id AS request_id,
              friend_requests.status AS request_status,
              friend_requests.created_at AS request_created_at,
              users.id,
              users.username,
              users.email,
              users.role,
              users.rank,
              users.avatar_seed,
              users.last_seen_at,
              0 AS invited_to_room
            FROM friend_requests
            INNER JOIN users ON users.id = friend_requests.sender_id
            WHERE friend_requests.recipient_id = ?
              AND friend_requests.status = 'pending'
            ORDER BY datetime(friend_requests.created_at) DESC
          `,
          [req.user.id]
        ),
        all(
          `
            SELECT
              friend_requests.id AS request_id,
              friend_requests.status AS request_status,
              friend_requests.created_at AS request_created_at,
              users.id,
              users.username,
              users.email,
              users.role,
              users.rank,
              users.avatar_seed,
              users.last_seen_at,
              0 AS invited_to_room
            FROM friend_requests
            INNER JOIN users ON users.id = friend_requests.recipient_id
            WHERE friend_requests.sender_id = ?
              AND friend_requests.status = 'pending'
            ORDER BY datetime(friend_requests.created_at) DESC
          `,
          [req.user.id]
        ),
        all(
          `
            SELECT
              room_invites.id AS invite_id,
              room_invites.room_id,
              room_invites.status AS invite_status,
              room_invites.created_at AS invite_created_at,
              users.id,
              users.username,
              users.email,
              users.role,
              users.rank,
              users.avatar_seed,
              users.last_seen_at,
              0 AS invited_to_room
            FROM room_invites
            INNER JOIN users ON users.id = room_invites.sender_id
            WHERE room_invites.recipient_id = ?
              AND room_invites.status = 'pending'
            ORDER BY datetime(room_invites.created_at) DESC
          `,
          [req.user.id]
        ),
        all(
          `
            SELECT
              room_invites.id AS invite_id,
              room_invites.room_id,
              room_invites.status AS invite_status,
              room_invites.created_at AS invite_created_at,
              users.id,
              users.username,
              users.email,
              users.role,
              users.rank,
              users.avatar_seed,
              users.last_seen_at,
              1 AS invited_to_room
            FROM room_invites
            INNER JOIN users ON users.id = room_invites.recipient_id
            WHERE room_invites.sender_id = ?
              AND room_invites.status = 'pending'
            ORDER BY datetime(room_invites.created_at) DESC
          `,
          [req.user.id]
        ),
      ]);

    res.status(200).json({
      friends: friendRows.map(mapFriendRow),
      incomingRequests: incomingRequestRows.map((row) => mapRequestRow(row, 'incoming')),
      outgoingRequests: outgoingRequestRows.map((row) => mapRequestRow(row, 'outgoing')),
      incomingRoomInvites: incomingInviteRows.map((row) => mapRoomInviteRow(row, 'incoming')),
      outgoingRoomInvites: outgoingInviteRows.map((row) => mapRoomInviteRow(row, 'outgoing')),
    });
  } catch {
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
    const query = String(req.body.query || '').trim().replace(/^@+/, '');

    if (query.length < 2) {
      res.status(400).json({
        error: 'Friend username or email is required.',
      });
      return;
    }

    const targetUser = await get(
      `
        SELECT id, username, email, role, rank, avatar_seed, last_seen_at, created_at
        FROM users
        WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?))
          AND is_guest = 0
        LIMIT 1
      `,
      [query, query]
    );

    if (!targetUser) {
      res.status(404).json({
        error: 'User not found.',
      });
      return;
    }

    if (Number(targetUser.id) === Number(req.user.id)) {
      res.status(400).json({
        error: 'You cannot add yourself as a friend.',
      });
      return;
    }

    const existingFriendship = await ensureExistingFriend(req.user.id, targetUser.id);
    if (existingFriendship) {
      res.status(409).json({
        error: 'You are already friends.',
      });
      return;
    }

    const incomingRequest = await get(
      `
        SELECT id
        FROM friend_requests
        WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'
        LIMIT 1
      `,
      [targetUser.id, req.user.id]
    );

    if (incomingRequest) {
      res.status(409).json({
        error: 'This user has already sent you a friend request.',
      });
      return;
    }

    await run(
      `
        INSERT INTO friend_requests (sender_id, recipient_id, status, created_at, updated_at)
        VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(sender_id, recipient_id)
        DO UPDATE SET
          status = 'pending',
          updated_at = CURRENT_TIMESTAMP
      `,
      [req.user.id, targetUser.id]
    );

    const request = await get(
      `
        SELECT
          friend_requests.id AS request_id,
          friend_requests.status AS request_status,
          friend_requests.created_at AS request_created_at,
          users.id,
          users.username,
          users.email,
          users.role,
          users.rank,
          users.avatar_seed,
          users.last_seen_at,
          0 AS invited_to_room
        FROM friend_requests
        INNER JOIN users ON users.id = friend_requests.recipient_id
        WHERE friend_requests.sender_id = ?
          AND friend_requests.recipient_id = ?
          AND friend_requests.status = 'pending'
        LIMIT 1
      `,
      [req.user.id, targetUser.id]
    );

    res.status(201).json({
      request: request ? mapRequestRow(request, 'outgoing') : null,
    });
    notifyUsers([targetUser.id], 'social_refresh', {
      reason: 'friend_request_created',
      senderId: Number(req.user.id),
    });
  } catch {
    res.status(500).json({
      error: 'Unable to add friend.',
    });
  }
}

async function acceptFriendRequest(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      res.status(400).json({
        error: 'Invalid request id.',
      });
      return;
    }

    const request = await get(
      `
        SELECT id, sender_id, recipient_id, status
        FROM friend_requests
        WHERE id = ? AND recipient_id = ?
        LIMIT 1
      `,
      [requestId, req.user.id]
    );

    if (!request || request.status !== 'pending') {
      res.status(404).json({
        error: 'Friend request not found.',
      });
      return;
    }

    await run(
      `
        INSERT OR IGNORE INTO friendships (user_id, friend_id)
        VALUES (?, ?)
      `,
      [request.sender_id, request.recipient_id]
    );
    await run(
      `
        INSERT OR IGNORE INTO friendships (user_id, friend_id)
        VALUES (?, ?)
      `,
      [request.recipient_id, request.sender_id]
    );
    await run(
      `
        UPDATE friend_requests
        SET status = 'accepted',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [requestId]
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
      [req.user.id, request.sender_id]
    );

    res.status(200).json({
      friend: created ? mapFriendRow(created) : null,
    });
    notifyUsers([request.sender_id, request.recipient_id], 'social_refresh', {
      reason: 'friend_request_accepted',
      requestId,
    });
  } catch {
    res.status(500).json({
      error: 'Unable to accept friend request.',
    });
  }
}

async function declineFriendRequest(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      res.status(400).json({
        error: 'Invalid request id.',
      });
      return;
    }

    const request = await get(
      `
        SELECT id, sender_id, recipient_id, status
        FROM friend_requests
        WHERE id = ?
          AND (recipient_id = ? OR sender_id = ?)
        LIMIT 1
      `,
      [requestId, req.user.id, req.user.id]
    );

    if (!request || request.status !== 'pending') {
      res.status(404).json({
        error: 'Friend request not found.',
      });
      return;
    }

    const nextStatus = Number(request.recipient_id) === Number(req.user.id) ? 'rejected' : 'cancelled';

    await run(
      `
        UPDATE friend_requests
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [nextStatus, requestId]
    );

    res.status(200).json({
      ok: true,
      status: nextStatus,
    });
    notifyUsers([request.sender_id, request.recipient_id], 'social_refresh', {
      reason: 'friend_request_closed',
      requestId,
      status: nextStatus,
    });
  } catch {
    res.status(500).json({
      error: 'Unable to decline friend request.',
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

    const roomId = buildRoomId(req.user.id, friendId);

    await run(
      `
        UPDATE room_invites
        SET status = 'cleared',
            updated_at = CURRENT_TIMESTAMP
        WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'
      `,
      [req.user.id, friendId]
    );

    const result = await run(
      `
        INSERT INTO room_invites (sender_id, recipient_id, room_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [req.user.id, friendId, roomId]
    );

    res.status(200).json({
      invite: {
        id: String(result.lastID),
        roomId,
        invitedToRoom: true,
      },
    });
    notifyUsers([req.user.id, friendId], 'social_refresh', {
      reason: 'room_invite_created',
      roomId,
    });
  } catch {
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
    notifyUsers([req.user.id, friendId], 'social_refresh', {
      reason: 'room_invite_cleared',
    });
  } catch {
    res.status(500).json({
      error: 'Unable to clear invite.',
    });
  }
}

async function acceptRoomInvite(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const inviteId = Number(req.params.inviteId);
    if (!Number.isFinite(inviteId) || inviteId <= 0) {
      res.status(400).json({
        error: 'Invalid invite id.',
      });
      return;
    }

    const invite = await get(
      `
        SELECT id, sender_id, recipient_id, room_id, status
        FROM room_invites
        WHERE id = ? AND recipient_id = ?
        LIMIT 1
      `,
      [inviteId, req.user.id]
    );

    if (!invite || invite.status !== 'pending') {
      res.status(404).json({
        error: 'Room invite not found.',
      });
      return;
    }

    await run(
      `
        UPDATE room_invites
        SET status = 'accepted',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [inviteId]
    );

    res.status(200).json({
      ok: true,
      roomId: invite.room_id,
      senderId: String(invite.sender_id),
    });
    notifyUsers([invite.sender_id, invite.recipient_id], 'social_refresh', {
      reason: 'room_invite_accepted',
      roomId: invite.room_id,
    });
  } catch {
    res.status(500).json({
      error: 'Unable to accept room invite.',
    });
  }
}

async function declineRoomInvite(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const inviteId = Number(req.params.inviteId);
    if (!Number.isFinite(inviteId) || inviteId <= 0) {
      res.status(400).json({
        error: 'Invalid invite id.',
      });
      return;
    }

    const invite = await get(
      `
        SELECT id, sender_id, recipient_id, status
        FROM room_invites
        WHERE id = ? AND recipient_id = ?
        LIMIT 1
      `,
      [inviteId, req.user.id]
    );

    if (!invite || invite.status !== 'pending') {
      res.status(404).json({
        error: 'Room invite not found.',
      });
      return;
    }

    await run(
      `
        UPDATE room_invites
        SET status = 'rejected',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [inviteId]
    );

    res.status(200).json({
      ok: true,
    });
    notifyUsers([invite.sender_id, invite.recipient_id], 'social_refresh', {
      reason: 'room_invite_rejected',
      inviteId,
    });
  } catch {
    res.status(500).json({
      error: 'Unable to decline room invite.',
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
          userId: String(row.friend_id),
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
  } catch {
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
        SELECT id, updated_at
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
  } catch {
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
  } catch {
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
    const participantIds = thread.direct_pair_key
      .split(':')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    notifyUsers(participantIds, 'chat_message', {
      chatId: String(message.thread_id),
      messageId: String(message.id),
    });
    notifyUsers(participantIds, 'social_refresh', {
      reason: 'chat_message_created',
      chatId: String(message.thread_id),
    });
  } catch {
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
        age: user.age,
        created_at: user.created_at,
        is_guest: Boolean(user.is_guest),
        stats: {
          friends: Number(friendRow?.total || 0),
          messages: Number(messageRow?.total || 0),
        },
      },
    });
  } catch {
    res.status(500).json({
      error: 'Unable to load current user.',
    });
  }
}

async function getPublicUserProfile(req, res) {
  if (!requireMember(res, req.user)) {
    return;
  }

  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({
        error: 'Invalid user id.',
      });
      return;
    }

    const user = await getAuthenticatedUserRow(userId);
    if (!user) {
      res.status(404).json({
        error: 'User not found.',
      });
      return;
    }

    const [friendRow, messageRow, relationship] = await Promise.all([
      get(`SELECT COUNT(*) AS total FROM friendships WHERE user_id = ?`, [userId]),
      get(`SELECT COUNT(*) AS total FROM chat_messages WHERE sender_id = ?`, [userId]),
      getFriendshipState(req.user.id, userId),
    ]);

    res.status(200).json({
      user: {
        id: String(user.id),
        username: user.username,
        email: user.email,
        role: user.role,
        rank: user.rank,
        avatar_seed: user.avatar_seed,
        age: user.age,
        created_at: user.created_at,
        is_guest: Boolean(user.is_guest),
        status: mapFriendStatus(user.last_seen_at, user.id),
        stats: {
          friends: Number(friendRow?.total || 0),
          messages: Number(messageRow?.total || 0),
        },
      },
      relationship,
    });
  } catch {
    res.status(500).json({
      error: 'Unable to load profile.',
    });
  }
}

module.exports = {
  acceptFriendRequest,
  acceptRoomInvite,
  addFriend,
  clearFriendInvite,
  declineFriendRequest,
  declineRoomInvite,
  getCurrentUserProfile,
  getOrCreateChat,
  getPublicUserProfile,
  inviteFriendToRoom,
  listChats,
  listFriends,
  listMessages,
  sendMessage,
};
