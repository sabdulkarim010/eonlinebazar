import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

function formatBdt(amount) {
  return `৳${Number(amount || 0).toLocaleString('en-US')}`;
}

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

export default function WalletScreen({ navigation }) {
  const { colors } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const convertPoints = useAuthStore((state) => state.convertPoints);
  const showToast = useToastStore((state) => state.showToast);
  const [pointsInput, setPointsInput] = useState('');
  const [converting, setConverting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const rewardSettings = user?.rewardSettings || {};
  const unit = Number(rewardSettings.pointsConversionUnit || 100);
  const takaRate = Number(rewardSettings.pointsToTakaConversionRate ?? 10);
  const history = Array.isArray(user?.walletHistory) ? user.walletHistory : [];

  useFocusEffect(
    useCallback(() => {
      refreshProfile?.();
    }, [refreshProfile])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshProfile?.();
    setRefreshing(false);
  };

  const handleConvert = async () => {
    const points = Number(pointsInput);
    if (!points || points <= 0) {
      showToast('Enter points to convert.', 'error');
      return;
    }
    if (points < unit) {
      showToast(`Minimum ${unit} points required.`, 'error');
      return;
    }
    if (points % unit !== 0) {
      showToast(`Points must be in multiples of ${unit}.`, 'error');
      return;
    }
    setConverting(true);
    const result = await convertPoints(points);
    setConverting(false);
    if (!result.success) {
      showToast(result.message || 'Conversion failed.', 'error');
      return;
    }
    setPointsInput('');
    showToast(result.message || 'Points converted.', 'success');
  };

  const renderTx = ({ item }) => {
    const txType = String(item.type || '').toLowerCase();
    const isDeduct = txType === 'debit';
    const sign = isDeduct ? '-' : '+';
    return (
      <View style={[styles.txRow, { borderBottomColor: colors.border }]}>
        <View style={styles.txCopy}>
          <Text style={[styles.txNote, { color: colors.text }]} numberOfLines={2}>
            {item.note || item.type || 'Transaction'}
          </Text>
          <Text style={[styles.txDate, { color: colors.muted }]}>{formatWhen(item.date)}</Text>
        </View>
        <Text style={[styles.txAmount, { color: isDeduct ? colors.price : colors.success }]}>
          {sign}{formatBdt(item.amount)}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <FlatList
        data={history}
        keyExtractor={(item, index) => String(item._id || item.id || index)}
        renderItem={renderTx}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        )}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.balanceLabel, { color: colors.muted }]}>Wallet balance</Text>
              <Text style={[styles.balanceValue, { color: colors.text }]}>
                {formatBdt(user?.walletBalance)}
              </Text>
              <Text style={[styles.balanceHint, { color: colors.muted }]}>
                {unit} points = {formatBdt(takaRate)} wallet balance
              </Text>
            </View>

            <View style={[styles.convertCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.convertTitle, { color: colors.text }]}>Convert loyalty points</Text>
              <Text style={[styles.convertSub, { color: colors.muted }]}>
                Available: {Number(user?.loyaltyPoints || 0).toLocaleString('en-US')} points
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                ]}
                value={pointsInput}
                onChangeText={setPointsInput}
                keyboardType="number-pad"
                placeholder={`Minimum ${unit} points`}
                placeholderTextColor={colors.muted}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primaryBtn },
                  pressed && { backgroundColor: colors.primaryBtnPressed },
                  converting && styles.disabled,
                ]}
                onPress={handleConvert}
                disabled={converting}
              >
                {converting ? (
                  <ActivityIndicator color={colors.primaryBtnText} />
                ) : (
                  <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>
                    Convert to wallet
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={() => navigation.navigate('LoyaltyPoints')} hitSlop={8}>
                <Text style={[styles.link, { color: colors.link }]}>View loyalty points history</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent transactions</Text>
          </View>
        )}
        ListEmptyComponent={(
          <Text style={[styles.empty, { color: colors.muted }]}>No wallet transactions yet.</Text>
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
  balanceCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  balanceLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  balanceValue: { fontSize: 32, fontWeight: '800', marginTop: 6 },
  balanceHint: { fontSize: 13, marginTop: 6 },
  convertCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  convertTitle: { fontSize: 16, fontWeight: '800' },
  convertSub: { fontSize: 13, marginTop: 4, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  primaryBtn: {
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  link: { textAlign: 'center', marginTop: 12, fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  txCopy: { flex: 1 },
  txNote: { fontSize: 14, fontWeight: '600' },
  txDate: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '800' },
  empty: { textAlign: 'center', padding: 24, fontSize: 14 },
});
