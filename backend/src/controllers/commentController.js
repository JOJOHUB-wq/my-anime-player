const { all, get, run } = require('../db/database');

async function listAnimeComments(req, res) {
  try {
    const animeId = Number(req.params.animeId);
    if (!Number.isFinite(animeId) || animeId <= 0) {
      res.status(400).json({
        error: 'Invalid anime id.',
      });
      return;
    }

    const rows = await all(
      `
        SELECT
          anime_comments.id,
          anime_comments.anime_id,
          anime_comments.user_id,
          anime_comments.username,
          anime_comments.body,
          anime_comments.is_guest,
          anime_comments.created_at,
          anime_comments.updated_at,
          users.avatar_seed
        FROM anime_comments
        LEFT JOIN users ON users.id = anime_comments.user_id
        WHERE anime_comments.anime_id = ?
        ORDER BY datetime(anime_comments.created_at) DESC, anime_comments.id DESC
        LIMIT 100
      `,
      [animeId]
    );

    res.status(200).json({
      comments: rows.map((row) => ({
        id: String(row.id),
        animeId: Number(row.anime_id),
        userId: row.user_id ? String(row.user_id) : null,
        author: row.username,
        text: row.body,
        isGuest: Boolean(row.is_guest),
        avatarSeed: row.avatar_seed || `${row.username}-${row.id}`,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch {
    res.status(500).json({
      error: 'Unable to load comments.',
    });
  }
}

async function createAnimeComment(req, res) {
  try {
    const animeId = Number(req.params.animeId);
    const text = String(req.body.text || '').trim();

    if (!Number.isFinite(animeId) || animeId <= 0) {
      res.status(400).json({
        error: 'Invalid anime id.',
      });
      return;
    }

    if (!text) {
      res.status(400).json({
        error: 'Comment text is required.',
      });
      return;
    }

    if (text.length > 800) {
      res.status(400).json({
        error: 'Comment is too long.',
      });
      return;
    }

    const username = String(req.user?.username || '').trim() || 'Guest';
    const userId = req.user?.id ? Number(req.user.id) : null;
    const isGuest = req.user?.is_guest ? 1 : 0;

    const result = await run(
      `
        INSERT INTO anime_comments (anime_id, user_id, username, body, is_guest, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [animeId, userId, username, text, isGuest]
    );

    const row = await get(
      `
        SELECT
          anime_comments.id,
          anime_comments.anime_id,
          anime_comments.user_id,
          anime_comments.username,
          anime_comments.body,
          anime_comments.is_guest,
          anime_comments.created_at,
          anime_comments.updated_at,
          users.avatar_seed
        FROM anime_comments
        LEFT JOIN users ON users.id = anime_comments.user_id
        WHERE anime_comments.id = ?
        LIMIT 1
      `,
      [result.lastID]
    );

    res.status(201).json({
      comment: {
        id: String(row.id),
        animeId: Number(row.anime_id),
        userId: row.user_id ? String(row.user_id) : null,
        author: row.username,
        text: row.body,
        isGuest: Boolean(row.is_guest),
        avatarSeed: row.avatar_seed || `${row.username}-${row.id}`,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch {
    res.status(500).json({
      error: 'Unable to save comment.',
    });
  }
}

module.exports = {
  createAnimeComment,
  listAnimeComments,
};
