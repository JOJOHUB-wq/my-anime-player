const express = require('express');

const { authMiddleware } = require('../middleware/authMiddleware');
const {
  createAnimeComment,
  listAnimeComments,
} = require('../controllers/commentController');

const router = express.Router();

router.get('/anime/:animeId', listAnimeComments);
router.post('/anime/:animeId', authMiddleware, createAnimeComment);

module.exports = router;
