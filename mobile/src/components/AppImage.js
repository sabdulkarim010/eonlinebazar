import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/tokens';

const PLACEHOLDER = require('../../assets/icon.png');

export default function AppImage({
  source,
  style,
  resizeMode = 'cover',
  placeholderOpacity = 0.35,
  ...rest
}) {
  const T = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = source?.uri;
  const hasRemote = Boolean(uri) && !failed;
  const flatStyle = StyleSheet.flatten(style) || {};

  return (
    <View
      style={[
        flatStyle,
        { backgroundColor: flatStyle.backgroundColor || T.skeleton, overflow: 'hidden' },
      ]}
    >
      <Image
        {...rest}
        source={hasRemote ? { uri } : PLACEHOLDER}
        style={[StyleSheet.absoluteFill, !hasRemote && { opacity: placeholderOpacity }]}
        resizeMode={hasRemote ? resizeMode : 'contain'}
        onError={() => setFailed(true)}
      />
    </View>
  );
}
