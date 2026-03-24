import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
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
import {
  useSocial,
  type SocialFriend,
  type SocialFriendRequest,
  type SocialRoomInvite,
} from '@/src/providers/social-provider';

function statusColor(status: 'online' | 'offline' | 'away') {
  if (status === 'online') {
    return '#34D399';
  }

  if (status === 'away') {
    return '#FBBF24';
  }

  return '#94A3B8';
}

function Avatar({ label }: { label: string }) {
  return (
    <View style={styles.avatarWrap}>
      <Text style={styles.avatarLabel}>{label.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function FriendCard({
  item,
  onOpenProfile,
  onOpenChat,
  onInvite,
}: {
  item: SocialFriend;
  onOpenProfile: () => void;
  onOpenChat: () => void;
  onInvite: () => void;
}) {
  const { theme } = useApp();
  const { t } = useTranslation();
  const subtitle = item.email ? `${item.handle} • ${item.email}` : item.handle;

  return (
    <GlassCard style={styles.friendCard}>
      <Pressable onPress={onOpenProfile} style={styles.friendRow}>
        <Avatar label={item.name} />

        <View style={styles.friendCopy}>
          <Text style={[styles.friendName, { color: theme.textPrimary }]}>{item.name}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
            <Text style={[styles.friendMeta, { color: theme.textSecondary }]}>
              {subtitle} • {t(`social.status.${item.status}`, { defaultValue: item.status })}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.friendActions}>
        <Pressable onPress={onOpenChat} style={[styles.actionButton, { backgroundColor: theme.surfaceStrong }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.textPrimary} />
        </Pressable>
        <Pressable
          onPress={onInvite}
          style={[
            styles.primaryActionButton,
            { backgroundColor: item.invitedToRoom ? theme.surfaceStrong : theme.accentPrimary },
          ]}>
          <Ionicons
            name={item.invitedToRoom ? 'checkmark-circle-outline' : 'people-outline'}
            size={16}
            color={item.invitedToRoom ? theme.textPrimary : '#05070F'}
          />
          <Text style={[styles.primaryActionLabel, { color: item.invitedToRoom ? theme.textPrimary : '#05070F' }]}>
            {item.invitedToRoom
              ? t('social.invited', { defaultValue: 'Invited' })
              : t('social.invite', { defaultValue: 'Invite' })}
          </Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

function RequestCard({
  item,
  onAccept,
  onReject,
  type,
}: {
  item: SocialFriendRequest;
  onAccept: () => void;
  onReject: () => void;
  type: 'incoming' | 'outgoing';
}) {
  const { theme } = useApp();
  const { t } = useTranslation();

  return (
    <GlassCard style={styles.requestCard}>
      <View style={styles.friendRow}>
        <Avatar label={item.user.name} />
        <View style={styles.friendCopy}>
          <Text style={[styles.friendName, { color: theme.textPrimary }]}>{item.user.name}</Text>
          <Text style={[styles.friendMeta, { color: theme.textSecondary }]}>
            {type === 'incoming'
              ? t('social.requestIncoming', { defaultValue: 'Sent you a friend request' })
              : t('social.requestOutgoing', { defaultValue: 'Awaiting confirmation' })}
          </Text>
        </View>
      </View>

      <View style={styles.friendActions}>
        {type === 'incoming' ? (
          <>
            <Pressable onPress={onReject} style={[styles.actionButton, { backgroundColor: theme.surfaceStrong }]}>
              <Ionicons name="close-outline" size={20} color={theme.textPrimary} />
            </Pressable>
            <Pressable onPress={onAccept} style={[styles.primaryActionButton, { backgroundColor: theme.accentPrimary }]}>
              <Ionicons name="checkmark-outline" size={18} color="#05070F" />
              <Text style={[styles.primaryActionLabel, { color: '#05070F' }]}>
                {t('social.accept', { defaultValue: 'Accept' })}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={onReject} style={[styles.primaryActionButton, { backgroundColor: theme.surfaceStrong }]}>
            <Ionicons name="close-outline" size={18} color={theme.textPrimary} />
            <Text style={[styles.primaryActionLabel, { color: theme.textPrimary }]}>
              {t('social.cancelRequest', { defaultValue: 'Cancel' })}
            </Text>
          </Pressable>
        )}
      </View>
    </GlassCard>
  );
}

function RoomInviteCard({
  item,
  onAccept,
  onReject,
}: {
  item: SocialRoomInvite;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { theme } = useApp();
  const { t } = useTranslation();

  return (
    <GlassCard style={styles.requestCard}>
      <View style={styles.friendRow}>
        <Avatar label={item.user.name} />
        <View style={styles.friendCopy}>
          <Text style={[styles.friendName, { color: theme.textPrimary }]}>{item.user.name}</Text>
          <Text style={[styles.friendMeta, { color: theme.textSecondary }]}>
            {t('social.roomInviteCopy', { defaultValue: 'Invited you to a co-watching room' })}
          </Text>
          <Text style={[styles.roomCode, { color: theme.textMuted }]}>{item.roomId}</Text>
        </View>
      </View>

      <View style={styles.friendActions}>
        <Pressable onPress={onReject} style={[styles.actionButton, { backgroundColor: theme.surfaceStrong }]}>
          <Ionicons name="close-outline" size={20} color={theme.textPrimary} />
        </Pressable>
        <Pressable onPress={onAccept} style={[styles.primaryActionButton, { backgroundColor: theme.accentPrimary }]}>
          <Ionicons name="play-outline" size={18} color="#05070F" />
          <Text style={[styles.primaryActionLabel, { color: '#05070F' }]}>
            {t('social.joinRoom', { defaultValue: 'Join' })}
          </Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { theme } = useApp();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{title}</Text>
      <View style={styles.sectionStack}>{children}</View>
    </View>
  );
}

export default function SocialTabScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme } = useApp();
  const { user } = useAuth();
  const {
    ready,
    friends,
    incomingRequests,
    outgoingRequests,
    incomingRoomInvites,
    addFriend,
    acceptFriendRequest,
    declineFriendRequest,
    inviteToRoom,
    clearInvite,
    acceptRoomInvite,
    declineRoomInvite,
    getOrCreateChat,
    refreshSocial,
  } = useSocial();
  const { width } = useWindowDimensions();
  const [modalVisible, setModalVisible] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    setMessage(null);

    try {
      await addFriend(friendQuery);
      setFriendQuery('');
      setModalVisible(false);
      setMessage(t('social.requestSent', { defaultValue: 'Friend request sent.' }));
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : t('social.addError', { defaultValue: 'Unable to add this friend.' }));
    } finally {
      setLoading(false);
    }
  }

  const renderItem = ({ item }: ListRenderItemInfo<SocialFriend>) => (
    <FriendCard
      item={item}
      onOpenProfile={() => {
        router.push({
          pathname: '/user/[userId]',
          params: { userId: item.userId },
        });
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
      onInvite={() => {
        void (async () => {
          try {
            if (item.invitedToRoom) {
              await clearInvite(item.userId);
            } else {
              const invite = await inviteToRoom(item.userId);
              if (invite?.roomId) {
                router.push({
                  pathname: '/room/[roomId]',
                  params: { roomId: invite.roomId },
                });
              } else {
                setMessage(t('social.roomInviteSent', { defaultValue: 'Room invite sent.' }));
              }
            }
          } catch (inviteError) {
            setError(inviteError instanceof Error ? inviteError.message : t('social.addError', { defaultValue: 'Unable to send the invite.' }));
          }
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
              sortedFriends.length === 0 && incomingRequests.length === 0 && outgoingRequests.length === 0 && incomingRoomInvites.length === 0 && styles.contentEmpty,
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
                      {t('social.subtitle', { defaultValue: 'Manage friends, requests, rooms, and chats from one place.' })}
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

                {message ? (
                  <GlassCard style={styles.noticeCard}>
                    <Text style={[styles.noticeCopy, { color: theme.textPrimary }]}>{message}</Text>
                  </GlassCard>
                ) : null}

                {error ? (
                  <GlassCard style={styles.noticeCard}>
                    <Text style={[styles.noticeCopy, { color: theme.danger }]}>{error}</Text>
                  </GlassCard>
                ) : null}

                {!user || user.isGuest ? (
                  <GlassCard style={styles.noticeCard}>
                    <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>{t('social.guestTitle', { defaultValue: 'Sign in for full social features' })}</Text>
                    <Text style={[styles.noticeCopy, { color: theme.textSecondary }]}>{t('social.guestCopy', { defaultValue: 'Guest mode can browse the social shell, but account sign-in unlocks persistent rooms and profile identity.' })}</Text>
                    <Pressable onPress={() => router.push('/auth')} style={[styles.noticeButton, { backgroundColor: theme.accentPrimary }]}>
                      <Text style={styles.noticeButtonLabel}>{t('social.signIn', { defaultValue: 'Open auth' })}</Text>
                    </Pressable>
                  </GlassCard>
                ) : null}

                {incomingRequests.length > 0 ? (
                  <Section title={t('social.incomingRequests', { defaultValue: 'Incoming requests' })}>
                    {incomingRequests.map((request) => (
                      <RequestCard
                        key={request.id}
                        item={request}
                        type="incoming"
                        onAccept={() => {
                          void acceptFriendRequest(request.id);
                        }}
                        onReject={() => {
                          void declineFriendRequest(request.id);
                        }}
                      />
                    ))}
                  </Section>
                ) : null}

                {outgoingRequests.length > 0 ? (
                  <Section title={t('social.outgoingRequests', { defaultValue: 'Sent requests' })}>
                    {outgoingRequests.map((request) => (
                      <RequestCard
                        key={request.id}
                        item={request}
                        type="outgoing"
                        onAccept={() => undefined}
                        onReject={() => {
                          void declineFriendRequest(request.id);
                        }}
                      />
                    ))}
                  </Section>
                ) : null}

                {incomingRoomInvites.length > 0 ? (
                  <Section title={t('social.roomInvites', { defaultValue: 'Room invites' })}>
                    {incomingRoomInvites.map((invite) => (
                      <RoomInviteCard
                        key={invite.id}
                        item={invite}
                        onAccept={() => {
                          void (async () => {
                            try {
                              const accepted = await acceptRoomInvite(invite.id);
                              router.push({
                                pathname: '/room/[roomId]',
                                params: { roomId: accepted.roomId },
                              });
                            } catch (inviteError) {
                              setError(inviteError instanceof Error ? inviteError.message : t('social.addError', { defaultValue: 'Unable to join room.' }));
                            }
                          })();
                        }}
                        onReject={() => {
                          void declineRoomInvite(invite.id);
                        }}
                      />
                    ))}
                  </Section>
                ) : null}

                <Section title={t('social.friendsTitle', { defaultValue: 'Friends' })}>
                  {sortedFriends.length === 0 ? (
                    <GlassCard style={styles.emptyCard}>
                      <Ionicons name="people-outline" size={30} color={theme.textPrimary} />
                      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{t('social.emptyTitle', { defaultValue: 'No friends yet' })}</Text>
                      <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>{t('social.emptyCopy', { defaultValue: 'Tap + to send your first friend request.' })}</Text>
                    </GlassCard>
                  ) : null}
                </Section>
              </View>
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
                autoCorrect={false}
                onSubmitEditing={() => {
                  void handleAddFriend();
                }}
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
  header: { marginBottom: 22, gap: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 34, fontWeight: '900' },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 20, maxWidth: 360 },
  headerActions: { flexDirection: 'row', gap: 10 },
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  noticeCard: { padding: 16, gap: 10 },
  noticeTitle: { fontSize: 16, fontWeight: '900' },
  noticeCopy: { fontSize: 14, lineHeight: 20 },
  noticeButton: { alignSelf: 'flex-start', minHeight: 42, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  noticeButtonLabel: { color: '#05070F', fontSize: 14, fontWeight: '900' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  sectionStack: { gap: 12 },
  friendCard: { padding: 16, gap: 14 },
  requestCard: { padding: 16, gap: 14 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  avatarLabel: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  friendCopy: { flex: 1 },
  friendName: { fontSize: 16, fontWeight: '800' },
  metaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  friendMeta: { fontSize: 13, fontWeight: '600' },
  roomCode: { marginTop: 6, fontSize: 11, fontWeight: '700' },
  friendActions: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'flex-end' },
  actionButton: { minWidth: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryActionButton: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, flexDirection: 'row', gap: 8 },
  primaryActionLabel: { fontSize: 13, fontWeight: '900' },
  emptyCard: { padding: 22, alignItems: 'center', justifyContent: 'center' },
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
