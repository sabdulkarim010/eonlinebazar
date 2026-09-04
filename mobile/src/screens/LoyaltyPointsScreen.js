import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LoyaltyPointsScreen({ navigation }) {
  const { colors } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const rewardSettings = user?.rewardSettings || {};
  const unit = Number(rewardSettings.pointsConversionUnit || 100);
  const takaRate = Number(rewardSettings.pointsToTakaConversionRate ?? 10);
  const cashback = Number(rewardSettings.cashbackPercentage ?? 1);
  const takaPerPoint = Number(rewardSettings.takaToPointsRatio ?? 100);

  const history = (Array.isArray(user?.walletHistory) ? user.walletHistory : [])
    .filter((tx) => String(tx.type || '').toLowerCase() === 'conversion'
      || /point/i.test(String(tx.note || '')));

  useFocusEffect(
    useCallback(() => {
      refreshProfile?.();
    }, [refreshProfile])
  );

  const renderItem = ({ item }) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.qtyBg }]}>
        <Ionicons name="star-outline" size={18} color="#f59e0b" />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.note, { color: colors.text }]} numberOfLines={2}>
          {item.note || 'Points activity'}
        </Text>
        <Text style={[styles.date, { color: colors.muted }]}>{formatWhen(item.date)}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <FlatList
        data={history}
        keyExtractor={(item, index) => String(item._id || item.id || index)}
        renderItem={renderItem}
        refreshControl={(
          <RefreshControl
            refreshing={false}
            onRefresh={() => refreshProfile?.()}
            tintColor={colors.accent}
          />
        )}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.heroLabel, { color: colors.muted }]}>Loyalty points</Text>
              <Text style={[styles.heroValue, { color: colors.text }]}>
                {Number(user?.loyaltyPoints || 0).toLocaleString('en-US')}
              </Text>
              <Text style={[styles.heroSub, { color: colors.muted }]}>XP available to convert</Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.text }]}>How you earn points</Text>
              <Text style={[styles.infoLine, { color: colors.muted }]}>
                • {cashback}% cashback goes to your wallet on eligible orders
              </Text>
              <Text style={[styles.infoLine, { color: colors.muted }]}>
                • Earn 1 point for every ৳{takaPerPoint.toLocaleString('en-US')} spent
              </Text>
              <Text style={[styles.infoLine, { color: colors.muted }]}>
                • Convert {unit} points = ৳{takaRate.toLocaleString('en-US')} wallet balance
              </Text>
            </View>

            <Pressable
              style={[styles.walletBtn, { backgroundColor: colors.primaryBtn }]}
              onPress={() => navigation.navigate('Wallet')}
            >
              <Text style={[styles.walletBtnText, { color: colors.primaryBtnText }]}>
                Open wallet & convert points
              </Text>
            </Pressable>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Points activity</Text>
          </View>
        )}
        ListEmptyComponent={(
          <Text style={[styles.empty, { color: colors.muted }]}>
            No points conversions yet. Shop and convert points from your wallet tab.
          </Text>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 24 },
  headerWrap: { padding: 16, paddingBottom: 0 },
  hero: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  heroLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  heroValue: { fontSize: 34, fontWeight: '800', marginTop: 6 },
  heroSub: { fontSize: 13, marginTop: 4 },
  infoCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  infoTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  infoLine: { fontSize: 13, lineHeight: 20 },
  walletBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  walletBtnText: { fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  note: { fontSize: 14, fontWeight: '600' },
  date: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', padding: 24, fontSize: 14 },
});
