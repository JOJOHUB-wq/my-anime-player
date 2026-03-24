import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useAuth } from '@/src/providers/auth-provider';
import { useApp } from '@/src/providers/app-provider';
import { useSocial, type SocialFriend } from '@/src/providers/social-provider';

function statusColor(status: 'online' | 'offline' | 'away') {
  if (status === 'online') {
    return '#34D399';
  }

  if (status === 'away') {
    return '#FBBF24';
  }

  return '#94A3B8';
}

function FriendCard({
  item,
  onInvite,
  onOpenChat,
}: {
  item: SocialFriend;
  onInvite: () => void;
  onOpenChat: () => void;
}) {
  const { theme } = useApp();
  const { t } = useTranslation();
  const subtitle = item.email ? `${item.handle} • ${item.email}` : item.handle;

  return (
    <GlassCard style={styles.friendCard}>
      <Pressable onPress={onOpenChat} style={styles.friendRow}>
        <View style={styles.avatarWrap}>
          <Text style={styles.avatarLabel}>{item.name.slice(0, 1).toUpperCase()}</Text>
        </View>

        <View style={styles.friendCopy}>
          <Text style={[styles.friendName, { color: theme.textPrimary }]}>{item.name}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
            <Text style={[styles.friendMeta, { color: theme.textSecondary }]}>
              {subtitle} • {t(`social.status.${item.status}`, { defaultValue: item.status })}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onInvite}
          style={[
            styles.inviteButton,
            { backgroundColor: item.invitedToRoom ? theme.surfaceStrong : theme.accentPrimary },
          ]}>
          <Text style={[styles.inviteLabel, { color: item.invitedToRoom ? theme.textPrimary : '#05070F' }]}>
            {item.invitedToRoom
              ? t('social.invited', { defaultValue: 'Invited' })
              : t('social.invite', { defaultValue: 'Invite' })}
          </Text>
        </Pressable>
      </Pressable>
    </GlassCard>
  );
}

export default function SocialTabScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme } = useApp();
  const { user } = useAuth();
  const { ready, friends, addFriend, inviteToRoom, clearInvite, getOrCreateChat, refreshSocial } = useSocial();
  const { width } = useWindowDimensions();
  const [modalVisible, setModalVisible] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: true,
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: {
        backgroundColor: 'transparent',
      },
    });
  }, [navigation]);

  const sortedFriends = useMemo(
    () => [...friends].sort((left, right) => left.name.localeCompare(right.name)),
    [friends]
  );
  const contentMaxWidth = width >= 1440 ? 1120 : 920;

  async function handleAddFriend() {
    setLoading(true);
    setError(null);

    try {
      await addFriend(friendQuery);
      setFriendQuery('');
      setModalVisible(false);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : t('social.addError', { defaultValue: 'Unable to add this friend.' }));
    } finally {
      setLoading(false);
    }
  }

  const renderItem = ({ item }: ListRenderItemInfo<SocialFriend>) => (
    <FriendCard
      item={item}
      onInvite={() => {
        void (item.invitedToRoom ? clearInvite(item.userId) : inviteToRoom(item.userId));
      }}
      onOpenChat={() => {
        void (async () => {
          const chat = await getOrCreateChat(item.userId);
          router.push({
            pathname: '/chat/[chatId]',
            params: { chatId: chat.id },
          });
        })();
      }}
    />
  );

  return (
    <LiquidBackground>
      <SafeAreaView style={styles.safeArea}>
        {!ready ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.textPrimary} />
          </View>
        ) : (
          <FlatList
            data={sortedFriends}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.content,
              { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
              sortedFriends.length === 0 && styles.contentEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListHeaderComponent={
              <View style={styles.header}>
                <View style={styles.headerRow}>
                  <View style={styles.headerCopy}>
                    <Text style={[styles.eyebrow, { color: theme.textMuted }]}>{t('social.eyebrow', { defaultValue: 'Community' })}</Text>
                    <Text style={[styles.title, { color: theme.textPrimary }]}>{t('social.title', { defaultValue: 'Social' })}</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                      {t('social.subtitle', { defaultValue: 'Build your friend list, invite contacts to co-watching rooms, and jump into chats.' })}
                    </Text>
                  </View>

                  <View style={styles.headerActions}>
                    <Pressable onPress={() => router.push('/profile')} style={[styles.headerButton, { backgroundColor: theme.surfaceStrong }]}>
                      <Ionicons name="person-circle-outline" size={20} color={theme.textPrimary} />
                    </Pressable>
                    <Pressable onPress={() => { void refreshSocial(); }} style={[styles.headerButton, { backgroundColor: theme.surfaceStrong }]}>
                      <Ionicons name="refresh-outline" size={20} color={theme.textPrimary} />
                    </Pressable>
                    <Pressable onPress={() => setModalVisible(true)} style={[styles.headerButton, { backgroundColor: theme.accentPrimary }]}>
                      <Ionicons name="add" size={20} color="#05070F" />
                    </Pressable>
                  </View>
                </View>

                {!user || user.isGuest ? (
                  <GlassCard style={styles.noticeCard}>
                    <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>{t('social.guestTitle', { defaultValue: 'Sign in for full social features' })}</Text>
                    <Text style={[styles.noticeCopy, { color: theme.textSecondary }]}>{t('social.guestCopy', { defaultValue: 'Guest mode can browse the social shell, but account sign-in unlocks persistent rooms and profile identity.' })}</Text>
                    <Pressable onPress={() => router.push('/auth')} style={[styles.noticeButton, { backgroundColor: theme.accentPrimary }]}>
                      <Text style={styles.noticeButtonLabel}>{t('social.signIn', { defaultValue: 'Open auth' })}</Text>
                    </Pressable>
                  </GlassCard>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <GlassCard style={styles.emptyCard}>
                <Ionicons name="people-outline" size={30} color={theme.textPrimary} />
                <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{t('social.emptyTitle', { defaultValue: 'No friends yet' })}</Text>
                <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>{t('social.emptyCopy', { defaultValue: 'Tap + to add your first contact and start a local Telegram-style chat.' })}</Text>
              </GlassCard>
            }
          />
        )}

        <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <GlassCard style={styles.modalCard}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{t('social.addFriendTitle', { defaultValue: 'Add friend' })}</Text>

              <TextInput
                value={friendQuery}
                onChangeText={setFriendQuery}
                placeholder={t('social.searchPlaceholder', { defaultValue: 'Username or email' })}
                placeholderTextColor={theme.textMuted}
                style={[styles.input, { color: theme.textPrimary, borderColor: theme.cardBorder, backgroundColor: theme.inputBackground }]}
                autoCapitalize="none"
              />

              {error ? <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text> : null}

              <View style={styles.modalActions}>
                <Pressable onPress={() => setModalVisible(false)} style={[styles.modalButton, { backgroundColor: theme.surfaceMuted }]}>
                  <Text style={[styles.modalButtonLabel, { color: theme.textPrimary }]}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={() => { void handleAddFriend(); }} disabled={loading} style={[styles.modalButton, { backgroundColor: theme.accentPrimary }]}>
                  {loading ? (
                    <ActivityIndicator size="small" color="#05070F" />
                  ) : (
                    <Text style={[styles.modalButtonLabel, { color: '#05070F' }]}>{t('common.create')}</Text>
                  )}
                </Pressable>
              </View>
            </GlassCard>
          </View>
        </Modal>
      </SafeAreaView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  contentEmpty: { flexGrow: 1 },
  header: { marginBottom: 22 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 34, fontWeight: '900' },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 20, maxWidth: 320 },
  headerActions: { flexDirection: 'row', gap: 10 },
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  noticeCard: { marginTop: 16, padding: 16, gap: 10 },
  noticeTitle: { fontSize: 16, fontWeight: '900' },
  noticeCopy: { fontSize: 14, lineHeight: 20 },
  noticeButton: { alignSelf: 'flex-start', minHeight: 42, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  noticeButtonLabel: { color: '#05070F', fontSize: 14, fontWeight: '900' },
  friendCard: { padding: 16 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  avatarLabel: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  friendCopy: { flex: 1 },
  friendName: { fontSize: 16, fontWeight: '800' },
  metaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  friendMeta: { fontSize: 13, fontWeight: '600' },
  inviteButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  inviteLabel: { fontSize: 13, fontWeight: '900' },
  emptyCard: { flex: 1, padding: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: '900' },
  emptyCopy: { marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { padding: 20, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  input: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontWeight: '600' },
  errorText: { fontSize: 13, lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalButtonLabel: { fontSize: 14, fontWeight: '900' },
});
