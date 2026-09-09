import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  TouchableOpacity,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/tokens';
import useAuthStore from '../store/useAuthStore';
import { haptic } from '../utils/haptics';
import AppStatusBar from '../components/AppStatusBar';
import { useAriaChat } from '../hooks/useAriaChat';

const SCREEN_W = Dimensions.get('window').width;

const FAQ_ITEMS = [
  { icon: '📦', text: 'Where is my order?' },
  { icon: '↩️', text: 'How do I return?' },
  { icon: '💳', text: 'Payment methods?' },
  { icon: '🚚', text: 'Delivery time?' },
];

const RATING_PROMPT =
  'EOnlineBazar-এর সাথে থাকার জন্য আপনাকে ধন্যবাদ! আমাদের আজকের কাস্টমার সাপোর্ট সার্ভিসটি আপনার কেমন লেগেছে? ৫ স্টারের মধ্যে আপনার অভিজ্ঞতা শেয়ার করুন।';

const RATING_THANK_YOU =
  'আপনার মূল্যবান মতামতের জন্য ধন্যবাদ! EOnlineBazar-এ কেনাকাটা উপভোগ করুন।';

function getImageUrl(msg) {
  const att = msg.attachments?.[0];
  if (!att) return null;
  return att.url || att.thumbnail_url || null;
}

export default function LiveSupportScreen({ route, navigation }) {
  const { orderContext } = route.params || {};
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const authToken = useAuthStore((state) => state.token);

  const guestName = user?.name || user?.firstName || 'Guest';

  const {
    messages,
    connectionState,
    roomStatus,
    agentName,
    agentAvatarUrl,
    personaName,
    statusLabel,
    isAgentTyping,
    isSending,
    error,
    canSend,
    showRatingPrompt,
    hasRated,
    sendMessage,
    sendImage,
    submitRating,
    onInputChange,
    resetChat,
  } = useAriaChat({
    user,
    guestName,
    orderContext,
    authToken,
    productContext: route?.params?.productContext || null,
  });

  const [inputText, setInputText] = useState('');
  const [faqVisible, setFaqVisible] = useState(true);
  const [selectedRating, setSelectedRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const flatListRef = useRef(null);

  const isLoading = connectionState === 'connecting' && messages.length === 0;
  const isResolved = roomStatus === 'RESOLVED';
  const displayAgentName = agentName || personaName || 'EOnlineBazar Support';
  const isOnline = connectionState === 'online';

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (messages.some((msg) => msg.senderType === 'USER')) {
      setFaqVisible(false);
    }
  }, [messages]);

  const scrollToEnd = (animated = true) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => scrollToEnd(true));
    const hideSub = Keyboard.addListener(hideEvent, () => scrollToEnd(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleSend = async (text = inputText.trim()) => {
    if (!text || isSending) return;
    setInputText('');
    setFaqVisible(false);
    haptic.light();
    const ok = await sendMessage(text);
    if (ok) scrollToEnd();
  };

  const handleSendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled) return;

    haptic.light();
    const ok = await sendImage(result.assets[0].uri);
    if (ok) scrollToEnd();
  };

  const handleRate = async (score) => {
    if (submittingRating || hasRated) return;
    setSelectedRating(score);
    setSubmittingRating(true);
    haptic.light();
    const ok = await submitRating(score);
    setSubmittingRating(false);
    if (ok) {
      haptic.success();
    } else {
      setSelectedRating(0);
    }
  };

  const handleStartNewChat = () => {
    setSelectedRating(0);
    setFaqVisible(true);
    resetChat();
  };

  const handleInputChange = (text) => {
    setInputText(text);
    onInputChange();
  };

  const renderMessage = ({ item: msg }) => {
    const isCustomer = msg.senderType === 'USER';
    const isAgent = msg.senderType === 'AGENT';
    const isSystem = msg.senderType === 'SYSTEM';
    const imageUrl = getImageUrl(msg);
    const isPending = msg.isPending || String(msg.id).startsWith('tmp-');
    const agentLabel = msg.senderName || agentName || 'Support';
    const avatarUri = msg.senderAvatar || agentAvatarUrl || null;

    if (isSystem && !imageUrl) {
      return (
        <View style={styles.systemMsg}>
          <Text style={[styles.systemMsgText, { color: T.textMuted }]}>
            {msg.text}
          </Text>
        </View>
      );
    }

    return (
      <View style={[
        styles.msgRow,
        isCustomer ? styles.msgRowRight : styles.msgRowLeft,
      ]}>
        {!isCustomer && (
          avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.agentAvatarImg}
            />
          ) : (
            <View style={[styles.agentAvatar, { backgroundColor: isAgent ? '#6366f1' : '#0f3460' }]}>
              <Text style={styles.agentAvatarEmoji}>
                {isAgent
                  ? agentLabel.charAt(0).toUpperCase()
                  : '🤖'}
              </Text>
            </View>
          )
        )}

        <View style={{ maxWidth: SCREEN_W * 0.72 }}>
          {!isCustomer && isAgent ? (
            <Text style={[styles.agentLabel, { color: T.textMuted }]}>
              {agentLabel}
            </Text>
          ) : null}
          <View style={[
            styles.bubble,
            isCustomer
              ? [styles.bubbleCustomer, { backgroundColor: T.accent }]
              : [styles.bubbleAgent, { backgroundColor: T.card, borderColor: T.border }],
          ]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.chatImage}
              resizeMode="cover"
            />
          ) : (
            <Text style={[
              styles.bubbleText,
              { color: isCustomer ? '#fff' : T.text },
            ]}>
              {msg.text}
            </Text>
          )}

          <Text style={[
            styles.msgTime,
            { color: isCustomer ? 'rgba(255,255,255,0.7)' : T.textMuted },
          ]}>
            {new Date(msg.createdAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {isCustomer && !isPending ? ' ✓' : ''}
            {isPending ? ' ⏳' : ''}
          </Text>
        </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: T.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <AppStatusBar />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.agentInfo}>
          <View style={[styles.agentIcon, { backgroundColor: '#0f3460' }]}>
            <Text style={styles.agentIconEmoji}>
              {agentName && agentName !== 'Aria'
                ? agentName.charAt(0).toUpperCase()
                : '🤖'}
            </Text>
          </View>
          <View>
            <Text style={styles.agentName}>{displayAgentName}</Text>
            <View style={styles.statusRow}>
              <View style={[
                styles.onlineDot,
                !isOnline && styles.offlineDot,
              ]} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          </View>
        </View>
        {orderContext?.orderNumber ? (
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>
              #{orderContext.orderNumber}
            </Text>
          </View>
        ) : null}
      </View>

      {orderContext ? (
        <View style={[styles.contextBanner, { backgroundColor: T.warningBg }]}>
          <Ionicons name="cube-outline" size={14} color={T.warning} />
          <Text style={[styles.contextText, { color: T.warning }]}>
            Chatting about Order #{orderContext.orderNumber}
            {orderContext.orderStatus ? ` · ${orderContext.orderStatus}` : ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.flex}>
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={T.accent} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => scrollToEnd(false)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListFooterComponent={
              isAgentTyping ? (
                <View style={styles.typingIndicator}>
                  <View style={[styles.agentAvatar, { backgroundColor: '#0f3460' }]}>
                    <Text style={styles.agentAvatarEmojiSmall}>🤖</Text>
                  </View>
                  <View style={[styles.typingBubble, { backgroundColor: T.card, borderColor: T.border }]}>
                    <Text style={{ color: T.textMuted, fontSize: 12 }}>
                      Typing...
                    </Text>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {faqVisible && !isLoading && !isResolved ? (
          <View style={[styles.faqSection, { backgroundColor: T.card, borderTopColor: T.border }]}>
            <Text style={[styles.faqLabel, { color: T.textMuted }]}>
              QUICK QUESTIONS
            </Text>
            <View style={styles.faqRow}>
              {FAQ_ITEMS.map((item) => (
                <Pressable
                  key={item.text}
                  style={[styles.faqBtn, { borderColor: T.border, backgroundColor: T.bg }]}
                  onPress={() => handleSend(item.text)}
                >
                  <Text style={styles.faqIcon}>{item.icon}</Text>
                  <Text style={[styles.faqText, { color: T.textSub }]}>
                    {item.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!isResolved ? (
          <View style={[styles.inputSection, {
            backgroundColor: T.card,
            borderTopColor: T.border,
            paddingBottom: insets.bottom + 8,
          }]}>
            <Pressable
              onPress={handleSendImage}
              disabled={!canSend || isSending}
              style={[styles.iconBtn, { borderColor: T.border, opacity: canSend ? 1 : 0.5 }]}
            >
              <Ionicons name="image-outline" size={20} color={T.textSub} />
            </Pressable>

            <TextInput
              style={[styles.input, {
                backgroundColor: T.bg,
                borderColor: T.border,
                color: T.text,
              }]}
              placeholder="Type a message..."
              placeholderTextColor={T.textMuted}
              value={inputText}
              onChangeText={handleInputChange}
              onFocus={() => scrollToEnd(true)}
              multiline
              maxLength={1000}
              editable={canSend}
            />

            <Pressable
              onPress={() => handleSend()}
              disabled={isSending || !inputText.trim() || !canSend}
              style={[styles.sendBtn, (isSending || !inputText.trim() || !canSend) && styles.sendBtnDisabled]}
            >
              {isSending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color="#fff" />}
            </Pressable>
          </View>
        ) : (
          <View style={[styles.resolvedFooter, {
            backgroundColor: T.card,
            borderTopColor: T.border,
            paddingBottom: insets.bottom + 12,
          }]}>
            {showRatingPrompt ? (
              <View style={styles.ratingSection}>
                <Text style={[styles.ratingPrompt, { color: T.textSub }]}>
                  {RATING_PROMPT}
                </Text>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => handleRate(n)}
                      disabled={submittingRating}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      style={styles.starTouchable}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${n} out of 5 stars`}
                    >
                      {submittingRating && selectedRating === n ? (
                        <ActivityIndicator size="small" color="#f59e0b" />
                      ) : (
                        <Ionicons
                          name={n <= selectedRating ? 'star' : 'star-outline'}
                          size={36}
                          color="#f59e0b"
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : hasRated ? (
              <View style={[styles.thankYouBanner, { backgroundColor: T.successBg }]}>
                <Ionicons name="heart" size={20} color={T.success} />
                <Text style={[styles.thankYouText, { color: T.success }]}>
                  {RATING_THANK_YOU}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.newChatBtn, { backgroundColor: T.accent }]}
              onPress={handleStartNewChat}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
              <Text style={styles.newChatBtnText}>Start New Chat</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: '#1a1a2e',
  },
  backBtn: { padding: 4 },
  agentInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  agentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentIconEmoji: { fontSize: 20 },
  agentName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22c55e',
  },
  offlineDot: { backgroundColor: '#94a3b8' },
  statusText: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  orderBadge: {
    backgroundColor: 'rgba(249,115,22,0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  orderBadgeText: { color: '#f97316', fontSize: 11, fontWeight: '700' },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  contextText: { fontSize: 12, fontWeight: '600' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messagesList: { flexGrow: 1, padding: 16, gap: 8, paddingBottom: 20 },
  systemMsg: { alignItems: 'center', marginVertical: 4 },
  systemMsgText: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
  },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  msgRowRight: { justifyContent: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start' },
  agentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  agentAvatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    flexShrink: 0,
  },
  agentLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 3,
    marginLeft: 4,
  },
  agentAvatarEmoji: { color: '#fff', fontSize: 12 },
  agentAvatarEmojiSmall: { color: '#fff', fontSize: 10 },
  bubble: {
    maxWidth: SCREEN_W * 0.72,
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  bubbleCustomer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleAgent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 16,
    borderWidth: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  msgTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  chatImage: { width: 180, height: 180, borderRadius: 8 },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  typingBubble: {
    borderRadius: 16,
    padding: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  faqSection: {
    padding: 12,
    borderTopWidth: 1,
  },
  faqLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  faqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  faqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  faqIcon: { fontSize: 12 },
  faqText: { fontSize: 11, fontWeight: '500' },
  resolvedFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  ratingSection: {
    alignItems: 'center',
    gap: 16,
  },
  ratingPrompt: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  starTouchable: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thankYouBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  thankYouText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  newChatBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  inputSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    paddingHorizontal: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { opacity: 0.5 },
});
