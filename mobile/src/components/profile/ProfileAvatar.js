import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { resolveMediaUrl } from '../../utils/normalizeProduct';

function pickAvatarUri(user) {
  const candidates = [
    user?.avatar,
    user?.avatarUrl,
    user?.profilePicture,
    user?.image,
  ];
  for (const candidate of candidates) {
    const raw = String(candidate ?? '').trim();
    if (raw) return resolveMediaUrl(raw);
  }
  return '';
}

export default function ProfileAvatar({
  user,
  size = 72,
  showRing = true,
  dark = false,
  editable = false,
  uploading = false,
  onPress,
  accentColor = '#f97316',
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const avatarUri = pickAvatarUri(user);
  const showImage = Boolean(avatarUri) && !imgFailed;

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUri]);

  const initials = (() => {
    const n = user?.name || user?.firstName || '';
    const parts = String(n).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return String(n).slice(0, 2).toUpperCase() || '?';
  })();

  const initialsBg = dark ? '#1e3a5f' : '#fff7ed';
  const badgeSize = Math.max(24, Math.round(size * 0.3));

  const avatarBody = (
    <View
      style={[
        styles.wrapper,
        { width: size, height: size, borderRadius: size / 2 },
        showRing && {
          borderWidth: 3,
          borderColor: accentColor,
          shadowColor: accentColor,
          shadowOpacity: 0.4,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUri }}
          style={[styles.img, { borderRadius: size / 2 }]}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <View
          style={[
            styles.initialsBox,
            {
              borderRadius: size / 2,
              width: size - 6,
              height: size - 6,
              backgroundColor: initialsBg,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.32, color: accentColor }]}>
            {initials}
          </Text>
        </View>
      )}

      {editable ? (
        <View
          style={[
            styles.cameraBadge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: accentColor,
              borderColor: dark ? '#0f172a' : '#ffffff',
            },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="camera" size={Math.round(badgeSize * 0.48)} color="#ffffff" />
          )}
        </View>
      ) : null}
    </View>
  );

  if (editable && onPress) {
    return (
      <Pressable onPress={onPress} disabled={uploading} style={styles.pressable}>
        {avatarBody}
      </Pressable>
    );
  }

  return avatarBody;
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'flex-start',
  },
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  initialsBox: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontWeight: '800',
    letterSpacing: 1,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
