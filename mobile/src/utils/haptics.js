import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function safeHaptic(fn) {
  return () => {
    if (Platform.OS === 'web') return;
    try {
      fn();
    } catch {
      // Haptics unavailable on this device/simulator.
    }
  };
}

export const haptic = {
  light: safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warning: safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
