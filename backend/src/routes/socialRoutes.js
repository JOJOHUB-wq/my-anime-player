const express = require('express');

const {
  addFriend,
  clearFriendInvite,
  getOrCreateChat,
  inviteFriendToRoom,
  listChats,
  listFriends,
  listMessages,
  sendMessage,
} = require('../controllers/socialController');

const router = express.Router();

router.get('/friends', listFriends);
router.post('/friends', addFriend);
router.post('/friends/:friendId/invite', inviteFriendToRoom);
router.delete('/friends/:friendId/invite', clearFriendInvite);
router.get('/chats', listChats);
router.post('/chats/with/:friendId', getOrCreateChat);
router.get('/chats/:chatId/messages', listMessages);
router.post('/chats/:chatId/messages', sendMessage);

module.exports = router;
