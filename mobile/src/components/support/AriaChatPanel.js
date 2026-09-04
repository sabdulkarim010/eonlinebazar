import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ARIA_GREETING } from '../../config/chatConfig';
import { useAriaChat } from '../../hooks/useAriaChat';

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;
  const padded = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${hours}:${padded} ${ampm}`;
}

function SpringChip({ label, onPress, T }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[styles.chip, { backgroundColor: T.card, borderColor: T.border }]}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start()}
      >
        <Text style={[styles.chipText, { color: T.text }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function HeaderIconButton({ icon, onPress, T, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.headerIconBtn, { borderColor: T.border, backgroundColor: T.iconBg }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
    >
      <Ionicons name={icon} size={18} color={T.sub} />
    </Pressable>
  );
}

function MessageBubble({ item, T }) {
  if (item.senderType === 'SYSTEM') {
    return (
      <View style={styles.systemWrap}>
        <Text style={[styles.systemText, { color: T.sub, backgroundColor: T.iconBg }]}>
          {item.text}
        </Text>
      </View>
    );
  }

  const isUser = item.senderType === 'USER';
  const isAgent = item.senderType === 'AGENT';
  const bubbleColor = isUser ? T.accent : isAgent ? T.successBg : T.card;
  const textColor = isUser ? '#ffffff' : T.text;
  const align = isUser ? 'flex-end' : 'flex-start';

  return (
    <View style={[styles.bubbleRow, { alignItems: align, alignSelf: isUser ? 'flex-end' : 'flex-start' }]}>
      {!isUser ? (
        <Text style={[styles.senderLabel, { color: T.muted }]}>
          {isAgent ? `${item.senderName || 'Agent'} 👤` : 'Aria 🤖'}
        </Text>
      ) : null}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: bubbleColor,
            borderColor: isUser ? T.accent : T.border,
          },
        ]}
      >
        <Text style={[styles.bubbleText, { color: textColor }]}>{item.text}</Text>
      </View>
      <Text style={[styles.timeText, { color: T.muted }]}>{formatTime(item.createdAt)}</Text>
    </View>
  );
}

const AriaChatPanel = forwardRef(function AriaChatPanel({
  user,
  guestName,
  T,
  colors,
  onMinimizePress,
  onClosePress,
}, ref) {
  const listRef = useRef(null);
  const [draft, setDraft] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const {
    messages,
    connectionState,
    personaName,
    statusLabel,
    waitingForAgent,
    isAgentTyping,
    isSending,
    error,
    activeQuickReplies,
    canSend,
    sendMessage,
    sendQuickReply,
    onInputChange,
    retryBootstrap,
    endChat,
  } = useAriaChat({ user, guestName });

  useImperativeHandle(ref, () => ({ endChat }), [endChat]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (!messages.length && !activeQuickReplies.length) return;
    const timer = setTimeout(() => scrollToBottom(true), 80);
    return () => clearTimeout(timer);
  }, [messages.length, activeQuickReplies.length, isAgentTyping, waitingForAgent, scrollToBottom]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      scrollToBottom(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    const ok = await sendMessage(text);
    if (ok) {
      setDraft('');
      scrollToBottom(true);
    }
  };

  const showGreeting = messages.length === 0 && connectionState !== 'error';
  const isConnecting = connectionState === 'connecting';

  return (
    <View style={[styles.flex, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={[styles.header, { borderBottomColor: T.border, backgroundColor: T.card }]}>
        <View style={[styles.avatar, { backgroundColor: T.accentBg }]}>
          <Text style={styles.avatarEmoji}>{personaName === 'Aria' ? '🤖' : '👤'}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: T.text }]}>{personaName}</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    connectionState === 'online' && !waitingForAgent
                      ? T.online
                      : waitingForAgent
                        ? '#f59e0b'
                        : T.muted,
                },
              ]}
            />
            <Text style={[styles.headerStatus, { color: T.sub }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {connectionState === 'error' ? (
            <HeaderIconButton
              icon="refresh"
              onPress={retryBootstrap}
              T={T}
              accessibilityLabel="Retry chat connection"
            />
          ) : null}
          {onMinimizePress ? (
            <HeaderIconButton
              icon="remove-outline"
              onPress={onMinimizePress}
              T={T}
              accessibilityLabel="Minimize chat"
            />
          ) : null}
          {onClosePress ? (
            <HeaderIconButton
              icon="close-outline"
              onPress={onClosePress}
              T={T}
              accessibilityLabel="Close chat"
            />
          ) : null}
        </View>
      </View>

      {waitingForAgent ? (
        <View style={[styles.waitingBanner, { backgroundColor: T.accentBg, borderColor: T.accent }]}>
          <Text style={[styles.waitingText, { color: T.text }]}>
            একজন প্রতিনিধি শীঘ্রই যোগ দেবেন…
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble item={item} T={T} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scrollToBottom(false)}
        ListHeaderComponent={
          showGreeting ? (
            <View style={styles.greetingWrap}>
              {isConnecting ? (
                <ActivityIndicator size="small" color={T.accent} style={styles.loader} />
              ) : null}
              <View style={[styles.bubble, { backgroundColor: T.card, borderColor: T.border }]}>
                <Text style={[styles.bubbleText, { color: T.text }]}>{ARIA_GREETING}</Text>
              </View>
            </View>
          ) : null
        }
        ListFooterComponent={
          isAgentTyping ? (
            <View style={styles.typingWrap}>
              <Text style={[styles.typingText, { color: T.muted }]}>Agent is typing…</Text>
            </View>
          ) : null
        }
      />

      {activeQuickReplies.length ? (
        <View style={[styles.chipsRow, { borderTopColor: T.border }]}>
          {activeQuickReplies.map((reply) => (
            <SpringChip
              key={reply.id}
              label={reply.label}
              T={T}
              onPress={async () => {
                await sendQuickReply(reply);
                scrollToBottom(true);
              }}
            />
          ))}
        </View>
      ) : null}

      {error ? (
        <Text style={[styles.errorText, { color: T.danger }]}>{error}</Text>
      ) : null}

      <View
        style={[
          styles.inputBar,
          {
            borderTopColor: T.border,
            backgroundColor: T.card,
            paddingBottom: keyboardVisible ? 8 : 8,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              color: T.text,
              backgroundColor: T.bg,
              borderColor: T.border,
            },
          ]}
          placeholder="আপনার বার্তা লিখুন..."
          placeholderTextColor={T.muted}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            onInputChange();
          }}
          onFocus={() => scrollToBottom(true)}
          editable={canSend}
          multiline
          maxLength={5000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <Pressable
          style={[
            styles.sendBtn,
            {
              backgroundColor: canSend && draft.trim() ? T.accent : T.iconBg,
            },
          ]}
          onPress={handleSend}
          disabled={!canSend || !draft.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons
              name="send"
              size={18}
              color={canSend && draft.trim() ? '#ffffff' : T.muted}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
});

export default AriaChatPanel;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  headerStatus: { fontSize: 12, fontWeight: '600' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingBanner: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  waitingText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexGrow: 1,
  },
  greetingWrap: { marginBottom: 10 },
  loader: { marginBottom: 8 },
  bubbleRow: { marginBottom: 12, maxWidth: '88%' },
  senderLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  bubble: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  timeText: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  systemWrap: { alignItems: 'center', marginVertical: 8 },
  systemText: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    textAlign: 'center',
    maxWidth: '92%',
  },
  typingWrap: { paddingVertical: 6 },
  typingText: { fontSize: 12, fontStyle: 'italic' },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
