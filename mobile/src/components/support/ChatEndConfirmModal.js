import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const COPY = {
  close: {
    icon: 'chatbubble-ellipses-outline',
    title: 'End Support Chat?',
    body: 'Are you sure you want to end this conversation?',
    confirm: 'Yes, Close',
  },
  minimize: {
    icon: 'remove-outline',
    title: 'Minimize Chat?',
    body: 'Hide the chat window? Your conversation will stay active.',
    confirm: 'Yes, Minimize',
  },
};

export default function ChatEndConfirmModal({
  visible,
  variant = 'close',
  colors,
  accentColor = '#f97316',
  onCancel,
  onConfirm,
  loading = false,
}) {
  const copy = COPY[variant] || COPY.close;
  const [mounted, setMounted] = useState(visible);
  const overlay = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      overlay.setValue(0);
      sheet.setValue(24);
      Animated.parallel([
        Animated.timing(overlay, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.spring(sheet, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
      return undefined;
    }

    if (!mounted) return undefined;
    Animated.parallel([
      Animated.timing(overlay, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(sheet, {
        toValue: 18,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return undefined;
  }, [mounted, overlay, sheet, visible]);

  const requestClose = () => {
    if (loading) return;
    onCancel?.();
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose}>
          <Animated.View style={[styles.overlay, { opacity: overlay }]} />
        </Pressable>
        <Animated.View
          style={[
            styles.box,
            {
              backgroundColor: colors.card,
              transform: [
                { translateY: sheet },
                {
                  scale: overlay.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  }),
                },
              ],
              opacity: overlay,
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: `${accentColor}22` }]}>
            <Ionicons name={copy.icon} size={28} color={accentColor} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{copy.body}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={requestClose}
              disabled={loading}
              style={({ pressed }) => [
                styles.btn,
                styles.cancel,
                {
                  backgroundColor: 'transparent',
                  borderColor: colors.border,
                  borderWidth: 1.5,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={loading}
              style={({ pressed }) => [
                styles.btn,
                styles.confirm,
                { backgroundColor: variant === 'close' ? '#ef4444' : accentColor },
                pressed && styles.pressed,
                loading && styles.disabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.confirmText}>{copy.confirm}</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  box: {
    width: '100%',
    maxWidth: 350,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    zIndex: 2,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  iconCircle: {
    width: 65,
    height: 65,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  cancel: {},
  confirm: {},
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  confirmText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.8,
  },
});
