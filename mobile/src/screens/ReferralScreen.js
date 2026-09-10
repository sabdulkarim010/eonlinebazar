import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { userAPI } from '../api/user';
import useToastStore from '../store/useToastStore';
import { useAppTheme } from '../store/useThemeStore';

const EMPTY_REFERRAL = {
  referralCode: '',
  referralLink: '',
  totalReferrals: 0,
  totalEarned: 0,
};

export default function ReferralScreen() {
  const { colors } = useAppTheme();
  const showToast = useToastStore((state) => state.showToast);
  const [referral, setReferral] = useState(EMPTY_REFERRAL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReferral = useCallback(async () => {
    try {
      const res = await userAPI.getReferral();
      const data = res?.data?.data;
      if (data) {
        setReferral({
          referralCode: data.referralCode || '',
          referralLink: data.referralLink || '',
          totalReferrals: Number(data.totalReferrals) || 0,
          totalEarned: Number(data.totalEarned) || 0,
        });
      }
    } catch (error) {
      console.warn('Failed to load referral info', error?.message || error);
      showToast?.('Could not load your referral details', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      loadReferral();
    }, [loadReferral])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadReferral();
  }, [loadReferral]);

  const buildInviteMessage = useCallback(() => {
    const link = referral.referralLink || '';
    const code = referral.referralCode || '';
    return `Shop with me on EonlineBazar! Use my referral code ${code} when you sign up.${link ? `\n${link}` : ''}`;
  }, [referral]);

  const handleCopy = useCallback(async () => {
    if (!referral.referralCode) return;
    try {
      await Clipboard.setStringAsync(referral.referralCode);
      showToast?.('Referral code copied', 'success');
    } catch {
      showToast?.('Could not copy code', 'error');
    }
  }, [referral.referralCode, showToast]);

  const handleShare = useCallback(async () => {
    if (!referral.referralCode) return;
    try {
      await Share.share({ message: buildInviteMessage() });
    } catch {
      showToast?.('Could not open share sheet', 'error');
    }
  }, [buildInviteMessage, referral.referralCode, showToast]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={(
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      )}
    >
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: `${colors.accent}1a` }]}>
          <Ionicons name="gift-outline" size={30} color={colors.accent} />
        </View>
        <Text style={[styles.heroTitle, { color: colors.text }]}>Invite friends, earn rewards</Text>
        <Text style={[styles.heroSub, { color: colors.muted }]}>
          Share your code. When a friend places their first order, you get wallet credit.
        </Text>
      </View>

      <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.codeLabel, { color: colors.muted }]}>Your referral code</Text>
        <Text style={[styles.codeValue, { color: colors.text }]}>
          {referral.referralCode || '—'}
        </Text>

        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.copyBtn, { borderColor: colors.border }]}
            onPress={handleCopy}
          >
            <Ionicons name="copy-outline" size={18} color={colors.text} />
            <Text style={[styles.copyBtnText, { color: colors.text }]}>Copy</Text>
          </Pressable>
          <Pressable
            style={[styles.shareBtn, { backgroundColor: colors.primaryBtn }]}
            onPress={handleShare}
          >
            <Ionicons name="share-social-outline" size={18} color={colors.primaryBtnText} />
            <Text style={[styles.shareBtnText, { color: colors.primaryBtnText }]}>Share invite</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {referral.totalReferrals.toLocaleString('en-US')}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Friends joined</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            ৳{referral.totalEarned.toLocaleString('en-US')}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Total earned</Text>
        </View>
      </View>

      <View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.stepsTitle, { color: colors.text }]}>How it works</Text>
        <Text style={[styles.stepLine, { color: colors.muted }]}>1. Share your referral code with friends.</Text>
        <Text style={[styles.stepLine, { color: colors.muted }]}>2. They sign up using your code.</Text>
        <Text style={[styles.stepLine, { color: colors.muted }]}>3. You earn wallet credit on their first order.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  hero: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  heroSub: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  codeCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  codeValue: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: 8,
    marginBottom: 16,
  },
  actionsRow: { flexDirection: 'row', gap: 12, width: '100%' },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnText: { fontSize: 14, fontWeight: '700' },
  shareBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 6,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: { fontSize: 14, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 4 },
  stepsCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  stepsTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  stepLine: { fontSize: 13, lineHeight: 20 },
});
