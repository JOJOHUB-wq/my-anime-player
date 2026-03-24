const express = require('express');

const { proxyStream, resolveByShikimori, searchCatalog } = require('../controllers/streamController');

const router = express.Router();

router.get('/search', searchCatalog);
router.get('/shikimori/:id', resolveByShikimori);
router.get('/proxy', proxyStream);

module.exports = router;
