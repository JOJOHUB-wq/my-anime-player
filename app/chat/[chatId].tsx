import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  ListRenderItemInfo,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInputSubmitEditingEventData,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';
import { useSocial, type ChatMessage } from '@/src/providers/social-provider';

function formatTime(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function ChatScreen() {
  const { theme } = useApp();
  const { chatId: rawChatId } = useLocalSearchParams<{ chatId?: string | string[] }>();
  const chatId = Array.isArray(rawChatId) ? rawChatId[0] : rawChatId;
  const { friends, chats, messagesByChatId, loadMessages, sendMessage } = useSocial();
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const chat = useMemo(() => chats.find((item) => item.id === chatId), [chatId, chats]);
  const friend = useMemo(
    () => chats.find((item) => item.id === chatId)?.friend || friends.find((item) => item.userId === chat?.friendId),
    [chat?.friendId, chatId, chats, friends]
  );
  const messages = useMemo(() => messagesByChatId[chatId ?? ''] ?? [], [chatId, messagesByChatId]);

  useEffect(() => {
    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function hydrateMessages() {
      if (!chatId) {
        setLoading(false);
        return;
      }

      try {
        await loadMessages(chatId);
        interval = setInterval(() => {
          void loadMessages(chatId);
        }, 3500);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    setLoading(true);
    void hydrateMessages();

    return () => {
      active = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [chatId, loadMessages]);

  async function submit() {
    if (!chatId || !draft.trim()) {
      return;
    }

    await sendMessage(chatId, draft);
    setDraft('');
  }

  function handleSubmitEditing(_event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) {
    void submit();
  }

  const renderItem = ({ item }: ListRenderItemInfo<ChatMessage>) => {
    const mine = item.sender === 'me';

    return (
      <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowFriend]}>
        <View
          style={[
            styles.messageBubble,
            mine
              ? { backgroundColor: theme.accentPrimary }
              : { backgroundColor: theme.surfaceStrong, borderColor: theme.cardBorder, borderWidth: 1 },
          ]}>
          <Text style={[styles.messageText, { color: mine ? '#05070F' : theme.textPrimary }]}>{item.text}</Text>
          <Text style={[styles.messageTime, { color: mine ? 'rgba(5,7,15,0.68)' : theme.textMuted }]}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  return (
    <LiquidBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardRoot}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={[styles.backButton, { borderColor: theme.cardBorder }]}>
              <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => {
                if (friend?.userId) {
                  router.push({
                    pathname: '/user/[userId]',
                    params: { userId: friend.userId },
                  });
                }
              }}
              style={styles.headerCopy}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>{friend?.name ?? 'Chat'}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{friend?.handle ?? '@unknown'}</Text>
            </Pressable>
          </View>

          <FlatList
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color={theme.textPrimary} />
                </View>
              ) : (
                <GlassCard style={styles.emptyCard}>
                  <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No messages yet</Text>
                  <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>Start the conversation below.</Text>
                </GlassCard>
              )
            }
          />

          <View style={styles.composerWrap}>
            <GlassCard style={styles.composerCard}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, { color: theme.textPrimary }]}
                multiline={false}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={handleSubmitEditing}
              />
              <Pressable onPress={() => { void submit(); }} style={[styles.sendButton, { backgroundColor: theme.accentPrimary }]}>
                <Ionicons name="send" size={18} color="#05070F" />
              </Pressable>
            </GlassCard>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </LiquidBackground>
  );
}

// TODO: Implement End-to-End Encryption with AES-256 and WebSockets.

const styles = StyleSheet.create({
  keyboardRoot: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, fontWeight: '900' },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24, flexGrow: 1, gap: 10 },
  messageRow: { width: '100%' },
  messageRowMine: { alignItems: 'flex-end' },
  messageRowFriend: { alignItems: 'flex-start' },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageTime: { marginTop: 6, fontSize: 11, fontWeight: '700', alignSelf: 'flex-end' },
  composerWrap: { paddingHorizontal: 16, paddingBottom: 16 },
  composerCard: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 10 },
  input: { flex: 1, minHeight: 42, maxHeight: 120, fontSize: 15, paddingHorizontal: 6, paddingVertical: 6 },
  sendButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { paddingTop: 24, alignItems: 'center' },
  emptyCard: { padding: 18, alignItems: 'center', marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '900' },
  emptyCopy: { marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
