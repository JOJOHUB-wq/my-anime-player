const express = require('express');

const {
  guestLogin,
  login,
  register,
} = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/guest', guestLogin);

module.exports = router;
