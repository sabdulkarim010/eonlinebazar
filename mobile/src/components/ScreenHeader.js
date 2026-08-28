import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../store/useThemeStore';

export default function ScreenHeader({ title, subtitle }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
});
