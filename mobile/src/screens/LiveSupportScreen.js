import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AriaChatPanel from '../components/support/AriaChatPanel';
import ChatEndConfirmModal from '../components/support/ChatEndConfirmModal';
import { useAppTheme } from '../store/useThemeStore';
import useAuthStore from '../store/useAuthStore';
import useToastStore from '../store/useToastStore';
import { useProfileModuleTokens } from '../theme/profileModuleTokens';
import { buildWhatsAppUrl, SUPPORT, SUPPORT_FAQ } from '../utils/supportLinks';

function SpringButton({ children, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start()}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function FaqItem({ item, expanded, onToggle, T }) {
  return (
    <View style={[styles.faqCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <Pressable style={styles.faqHead} onPress={onToggle}>
        <Text style={[styles.faqQuestion, { color: T.text }]}>{item.question}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={T.muted}
        />
      </Pressable>
      {expanded ? (
        <Text style={[styles.faqAnswer, { color: T.sub }]}>{item.answer}</Text>
      ) : null}
    </View>
  );
}

function MinimizedChatBar({ onExpand, T }) {
  return (
    <Pressable
      style={[styles.minimizedBar, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={onExpand}
    >
      <View style={[styles.minAvatar, { backgroundColor: T.accentBg }]}>
        <Text style={styles.minAvatarEmoji}>🤖</Text>
      </View>
      <View style={styles.minInfo}>
        <Text style={[styles.minTitle, { color: T.text }]}>Aria · Online</Text>
        <Text style={[styles.minSub, { color: T.sub }]}>Tap to continue your chat</Text>
      </View>
      <Ionicons name="chevron-up" size={20} color={T.muted} />
    </Pressable>
  );
}

export default function LiveSupportScreen() {
  const navigation = useNavigation();
  const { isDark, colors } = useAppTheme();
  const T = useProfileModuleTokens(isDark);
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);
  const chatRef = useRef(null);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [faqOpen, setFaqOpen] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmVariant, setConfirmVariant] = useState('close');
  const [confirmLoading, setConfirmLoading] = useState(false);

  const guestName = useMemo(
    () => user?.name || user?.firstName || 'Guest',
    [user?.firstName, user?.name]
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const openUrl = async (url, failMessage) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showToast(failMessage || 'Could not open link.', 'error');
        return;
      }
      await Linking.openURL(url);
    } catch {
      showToast(failMessage || 'Could not open link.', 'error');
    }
  };

  const openConfirm = (variant) => {
    setConfirmVariant(variant);
    setConfirmVisible(true);
  };

  const handleConfirmAction = async () => {
    setConfirmLoading(true);
    try {
      if (confirmVariant === 'close') {
        await chatRef.current?.endChat?.();
        setConfirmVisible(false);
        navigation.goBack();
        return;
      }
      setChatMinimized(true);
      setConfirmVisible(false);
    } finally {
      setConfirmLoading(false);
    }
  };

  const showFaq = !chatMinimized && !keyboardVisible;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: T.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.topBar}>
        <View style={styles.actionRow}>
          <SpringButton
            style={styles.actionWrap}
            onPress={() => openUrl(buildWhatsAppUrl(), 'WhatsApp is not available.')}
          >
            <View style={[styles.actionPill, { backgroundColor: '#ecfdf5', borderColor: '#10b981' }]}>
              <Ionicons name="logo-whatsapp" size={18} color="#10b981" />
              <Text style={[styles.actionLabel, { color: T.text }]}>WhatsApp</Text>
            </View>
          </SpringButton>

          <SpringButton
            style={styles.actionWrap}
            onPress={() => openUrl(`tel:${SUPPORT.phone}`, 'Could not start call.')}
          >
            <View style={[styles.actionPill, { backgroundColor: T.card, borderColor: T.border }]}>
              <Ionicons name="call-outline" size={18} color={colors.accent} />
              <Text style={[styles.actionLabel, { color: T.text }]}>Call</Text>
            </View>
          </SpringButton>

          <SpringButton
            style={styles.actionWrap}
            onPress={() => openUrl(`mailto:${SUPPORT.email}`, 'Could not open email app.')}
          >
            <View style={[styles.actionPill, { backgroundColor: T.card, borderColor: T.border }]}>
              <Ionicons name="mail-outline" size={18} color={colors.accent} />
              <Text style={[styles.actionLabel, { color: T.text }]}>Email</Text>
            </View>
          </SpringButton>
        </View>
      </View>

      <View style={styles.chatWrap}>
        {chatMinimized ? (
          <MinimizedChatBar onExpand={() => setChatMinimized(false)} T={T} />
        ) : (
          <AriaChatPanel
            ref={chatRef}
            user={user}
            guestName={guestName}
            T={T}
            colors={colors}
            onMinimizePress={() => openConfirm('minimize')}
            onClosePress={() => openConfirm('close')}
          />
        )}
      </View>

      {showFaq ? (
        <View style={[styles.faqSection, { borderTopColor: T.border }]}>
          <Pressable
            style={styles.faqToggle}
            onPress={() => setFaqOpen((prev) => !prev)}
          >
            <Text style={[styles.faqToggleText, { color: T.text }]}>Quick Help (FAQ)</Text>
            <Ionicons name={faqOpen ? 'chevron-down' : 'chevron-up'} size={18} color={T.muted} />
          </Pressable>

          {faqOpen ? (
            <ScrollView
              style={styles.faqScroll}
              contentContainerStyle={styles.faqScrollContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {SUPPORT_FAQ.map((item) => (
                <FaqItem
                  key={item.id}
                  item={item}
                  expanded={expandedFaq === item.id}
                  onToggle={() => setExpandedFaq((prev) => (prev === item.id ? null : item.id))}
                  T={T}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      <ChatEndConfirmModal
        visible={confirmVisible}
        variant={confirmVariant}
        colors={colors}
        accentColor={colors.accent}
        loading={confirmLoading}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={handleConfirmAction}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionWrap: { flex: 1 },
  actionPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexDirection: 'row',
  },
  actionLabel: { fontSize: 12, fontWeight: '700' },
  chatWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 8,
    minHeight: 280,
  },
  minimizedBar: {
    flex: 1,
    maxHeight: 72,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  minAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minAvatarEmoji: { fontSize: 20 },
  minInfo: { flex: 1 },
  minTitle: { fontSize: 15, fontWeight: '800' },
  minSub: { fontSize: 12, marginTop: 2 },
  faqSection: {
    borderTopWidth: 1,
    maxHeight: 220,
  },
  faqToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  faqToggleText: { fontSize: 14, fontWeight: '800' },
  faqScroll: { maxHeight: 168 },
  faqScrollContent: { paddingHorizontal: 12, paddingBottom: 12 },
  faqCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  faqHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqQuestion: { flex: 1, fontSize: 14, fontWeight: '700' },
  faqAnswer: { fontSize: 13, lineHeight: 20, marginTop: 8 },
});
