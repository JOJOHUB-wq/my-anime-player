const express = require('express');

const {
  acceptFriendRequest,
  acceptRoomInvite,
  addFriend,
  clearFriendInvite,
  declineFriendRequest,
  declineRoomInvite,
  getOrCreateChat,
  getPublicUserProfile,
  inviteFriendToRoom,
  listChats,
  listFriends,
  listMessages,
  sendMessage,
} = require('../controllers/socialController');

const router = express.Router();

router.get('/friends', listFriends);
router.post('/friends', addFriend);
router.post('/friend-requests/:requestId/accept', acceptFriendRequest);
router.post('/friend-requests/:requestId/reject', declineFriendRequest);
router.post('/friends/:friendId/invite', inviteFriendToRoom);
router.delete('/friends/:friendId/invite', clearFriendInvite);
router.post('/room-invites/:inviteId/accept', acceptRoomInvite);
router.post('/room-invites/:inviteId/reject', declineRoomInvite);
router.get('/chats', listChats);
router.post('/chats/with/:friendId', getOrCreateChat);
router.get('/chats/:chatId/messages', listMessages);
router.post('/chats/:chatId/messages', sendMessage);
router.get('/users/:userId', getPublicUserProfile);

module.exports = router;
