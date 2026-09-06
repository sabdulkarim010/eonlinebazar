import { StatusBar } from 'react-native';
import useThemeStore from '../store/useThemeStore';
import { useTheme } from '../theme/tokens';

export default function AppStatusBar() {
  const isDark = useThemeStore((state) => state.mode === 'dark');
  const T = useTheme();

  return (
    <StatusBar
      barStyle={isDark ? 'light-content' : 'dark-content'}
      backgroundColor={T.bg}
      translucent={false}
    />
  );
}
