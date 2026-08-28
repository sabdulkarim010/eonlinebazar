import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useToastStore from '../store/useToastStore';

export default function ToastBanner() {
  const insets = useSafeAreaInsets();
  const visible = useToastStore((state) => state.visible);
  const message = useToastStore((state) => state.message);
  const type = useToastStore((state) => state.type);
  const hideToast = useToastStore((state) => state.hideToast);

  if (!visible || !message) return null;

  return (
    <Pressable
      onPress={hideToast}
      style={[
        styles.banner,
        type === 'error' ? styles.error : styles.success,
        { top: Math.max(insets.top, 12) + 8 },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  success: {
    backgroundColor: '#067d62',
  },
  error: {
    backgroundColor: '#b12704',
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
