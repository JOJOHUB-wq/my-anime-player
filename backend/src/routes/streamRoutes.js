const express = require('express');

const { searchCatalog } = require('../controllers/streamController');

const router = express.Router();

router.get('/search', searchCatalog);

module.exports = router;
