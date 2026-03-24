import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import i18n from '@/src/i18n';
import { useAuth } from '@/src/providers/auth-provider';
import { apiRequest } from '@/src/services/backend-api';

export type SocialFriend = {
  id: string;
  userId: string;
  name: string;
  handle: string;
  email?: string | null;
  avatarSeed?: string;
  rank?: string;
  role?: string;
  status: 'online' | 'offline' | 'away';
  invitedToRoom: boolean;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  sender: 'me' | 'friend';
  text: string;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  friendId: string;
  lastMessageAt: string;
  friend?: SocialFriend;
};

type SocialContextValue = {
  ready: boolean;
  friends: SocialFriend[];
  chats: ChatThread[];
  messagesByChatId: Record<string, ChatMessage[]>;
  refreshSocial: () => Promise<void>;
  addFriend: (query: string) => Promise<SocialFriend>;
  inviteToRoom: (friendId: string) => Promise<void>;
  clearInvite: (friendId: string) => Promise<void>;
  getOrCreateChat: (friendId: string) => Promise<ChatThread>;
  loadMessages: (chatId: string) => Promise<ChatMessage[]>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
};

const SocialContext = createContext<SocialContextValue | null>(null);

type FriendsResponse = {
  friends: SocialFriend[];
};

type ChatsResponse = {
  chats: ChatThread[];
};

type MessagesResponse = {
  messages: ChatMessage[];
};

function sortFriends(items: SocialFriend[]) {
  return [...items].sort((left, right) => {
    const statusPriority = { online: 0, away: 1, offline: 2 };
    if (statusPriority[left.status] !== statusPriority[right.status]) {
      return statusPriority[left.status] - statusPriority[right.status];
    }

    return left.name.localeCompare(right.name);
  });
}

function sortChats(items: ChatThread[]) {
  return [...items].sort(
    (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime()
  );
}

function normalizeFriend(friend: SocialFriend): SocialFriend {
  return {
    ...friend,
    id: String(friend.id),
    userId: String(friend.userId || friend.id),
    invitedToRoom: Boolean(friend.invitedToRoom),
  };
}

function normalizeChat(chat: ChatThread): ChatThread {
  return {
    ...chat,
    id: String(chat.id),
    friendId: String(chat.friendId),
    friend: chat.friend ? normalizeFriend(chat.friend) : undefined,
  };
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    id: String(message.id),
    chatId: String(message.chatId),
  };
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [ready, setReady] = useState(false);
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, ChatMessage[]>>({});

  const refreshSocial = useCallback(async () => {
    if (!token || user?.isGuest) {
      setFriends([]);
      setChats([]);
      setMessagesByChatId({});
      setReady(true);
      return;
    }

    setReady(false);

    try {
      const [friendsResponse, chatsResponse] = await Promise.all([
        apiRequest<FriendsResponse>('/api/social/friends', { token }),
        apiRequest<ChatsResponse>('/api/social/chats', { token }),
      ]);

      const nextFriends = sortFriends(friendsResponse.friends);
      const normalizedFriends = nextFriends.map(normalizeFriend);
      const friendsById = new Map(normalizedFriends.map((friend) => [friend.userId, friend]));
      const nextChats = sortChats(
        chatsResponse.chats.map((chat) => {
          const normalizedChat = normalizeChat(chat);
          return {
            ...normalizedChat,
            friend: normalizedChat.friend || friendsById.get(normalizedChat.friendId),
          };
        })
      );

      setFriends(normalizedFriends);
      setChats(nextChats);
    } catch {
      setFriends([]);
      setChats([]);
    } finally {
      setReady(true);
    }
  }, [token, user?.isGuest]);

  useEffect(() => {
    void refreshSocial();
  }, [refreshSocial]);

  const addFriend = useCallback(
    async (query: string) => {
      if (!token) {
        throw new Error(i18n.t('social.errors.signInRequired', { defaultValue: 'Sign in first.' }));
      }

      const trimmed = query.trim().replace(/^@+/, '');
      if (trimmed.length < 2) {
        throw new Error(i18n.t('social.errors.handleMin'));
      }

      const response = await apiRequest<{ friend: SocialFriend }>('/api/social/friends', {
        method: 'POST',
        token,
        body: { query: trimmed },
      });

      const normalizedFriend = normalizeFriend(response.friend);
      const nextFriends = sortFriends([
        normalizedFriend,
        ...friends.filter((item) => item.userId !== normalizedFriend.userId),
      ]);
      setFriends(nextFriends);
      return normalizedFriend;
    },
    [friends, token]
  );

  const inviteToRoom = useCallback(
    async (friendId: string) => {
      if (!token) {
        return;
      }

      await apiRequest(`/api/social/friends/${friendId}/invite`, {
        method: 'POST',
        token,
      });

      setFriends((current) =>
        current.map((friend) =>
          friend.userId === friendId
            ? {
                ...friend,
                invitedToRoom: true,
              }
            : friend
        )
      );
    },
    [token]
  );

  const clearInvite = useCallback(
    async (friendId: string) => {
      if (!token) {
        return;
      }

      await apiRequest(`/api/social/friends/${friendId}/invite`, {
        method: 'DELETE',
        token,
      });

      setFriends((current) =>
        current.map((friend) =>
          friend.userId === friendId
            ? {
                ...friend,
                invitedToRoom: false,
              }
            : friend
        )
      );
    },
    [token]
  );

  const getOrCreateChat = useCallback(
    async (friendId: string) => {
      if (!token) {
        throw new Error(i18n.t('social.errors.signInRequired', { defaultValue: 'Sign in first.' }));
      }

      const response = await apiRequest<{ chat: ChatThread }>(`/api/social/chats/with/${friendId}`, {
        method: 'POST',
        token,
      });

      const normalizedChat = normalizeChat(response.chat);
      const enrichedChat: ChatThread = {
        ...normalizedChat,
        friend: friends.find((item) => item.userId === friendId),
      };

      setChats((current) => sortChats([enrichedChat, ...current.filter((item) => item.id !== enrichedChat.id)]));
      return enrichedChat;
    },
    [friends, token]
  );

  const loadMessages = useCallback(
    async (chatId: string) => {
      if (!token) {
        return [];
      }

      const response = await apiRequest<MessagesResponse>(`/api/social/chats/${chatId}/messages`, {
        token,
      });
      const nextMessages = response.messages.map(normalizeMessage);
      setMessagesByChatId((current) => ({
        ...current,
        [chatId]: nextMessages,
      }));
      return nextMessages;
    },
    [token]
  );

  const sendMessage = useCallback(
    async (chatId: string, text: string) => {
      if (!token) {
        throw new Error(i18n.t('social.errors.signInRequired', { defaultValue: 'Sign in first.' }));
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      const response = await apiRequest<{ message: ChatMessage }>(`/api/social/chats/${chatId}/messages`, {
        method: 'POST',
        token,
        body: { text: trimmed },
      });

      const nextMessage = normalizeMessage(response.message);
      setMessagesByChatId((current) => ({
        ...current,
        [chatId]: [...(current[chatId] ?? []), nextMessage],
      }));
      setChats((current) =>
        sortChats(
          current.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  lastMessageAt: nextMessage.createdAt,
                }
              : chat
          )
        )
      );
    },
    [token]
  );

  const value = useMemo<SocialContextValue>(
    () => ({
      ready,
      friends,
      chats,
      messagesByChatId,
      refreshSocial,
      addFriend,
      inviteToRoom,
      clearInvite,
      getOrCreateChat,
      loadMessages,
      sendMessage,
    }),
    [
      addFriend,
      chats,
      clearInvite,
      friends,
      getOrCreateChat,
      inviteToRoom,
      loadMessages,
      messagesByChatId,
      ready,
      refreshSocial,
      sendMessage,
    ]
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);

  if (!context) {
    throw new Error('useSocial must be used inside SocialProvider.');
  }

  return context;
}
