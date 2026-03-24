const jwt = require('jsonwebtoken');
const { run } = require('../db/database');

function extractToken(req) {
  const authorizationHeader = req.headers.authorization || '';

  if (authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.slice(7).trim();
  }

  return null;
}

function verifyJwtToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET || 'change-this-in-production');
}

async function authMiddleware(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        error: 'Authentication token is required.',
      });
      return;
    }

    req.user = verifyJwtToken(token);
    if (req.user?.id) {
      await run(`UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.user.id]);
    }
    next();
  } catch (error) {
    res.status(401).json({
      error: 'Invalid or expired authentication token.',
    });
  }
}

module.exports = {
  authMiddleware,
  extractToken,
  verifyJwtToken,
};
