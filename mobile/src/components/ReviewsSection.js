import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractReviews, reviewsAPI } from '../api/reviews';
import useAuthStore from '../store/useAuthStore';
import useOrderStore from '../store/useOrderStore';
import { useAppTheme } from '../store/useThemeStore';
import { resolveMediaUrl } from '../utils/normalizeProduct';

const PREVIEW_LIMIT = 5;

function uniqueIds(...values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function productIdSet(product, productId) {
  return new Set(uniqueIds(productId, product?.id, product?._id, product?.productId));
}

function itemMatchesProduct(item, idSet) {
  return uniqueIds(
    item?.id,
    item?.productId,
    item?._id,
    item?.product?._id,
    item?.product?.id,
    item?.product?.productId
  ).some((id) => idSet.has(id));
}

function isDeliveredOrder(order) {
  return order?.isDelivered === true
    || String(order?.status || '').toLowerCase() === 'delivered';
}

function reviewerName(review) {
  return review?.userId?.name
    || review?.user?.name
    || review?.userName
    || review?.name
    || 'Customer';
}

function formatReviewDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildSummary(reviews) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((review) => {
    const rating = Math.round(Number(review.rating) || 0);
    if (rating >= 1 && rating <= 5) dist[rating] += 1;
  });
  const total = reviews.length;
  const sum = reviews.reduce((acc, review) => acc + (Number(review.rating) || 0), 0);
  return {
    avg: total ? sum / total : 0,
    total,
    dist,
  };
}

function StarSelector({ value, onChange, colors }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} hitSlop={6}>
          <Text style={[styles.starPick, { color: star <= value ? colors.accent : colors.border }]}>
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ReviewsSection({ productId, product, navigation }) {
  const { colors } = useAppTheme();
  const token = useAuthStore((state) => state.token);
  const fetchOrderHistory = useOrderStore((state) => state.fetchOrderHistory);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWriteReview, setShowWriteReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [eligibleOrder, setEligibleOrder] = useState(null);

  const ids = useMemo(
    () => uniqueIds(productId, product?.id, product?._id, product?.productId),
    [product, productId]
  );

  const loadReviews = useCallback(async () => {
    if (!ids.length) {
      setReviews([]);
      setLoading(false);
      return;
    }
    try {
      const payloads = await Promise.all(
        ids.map(async (id) => {
          try {
            const { data } = await reviewsAPI.getByProduct(id);
            return extractReviews(data);
          } catch {
            return [];
          }
        })
      );
      const seen = new Set();
      const merged = [];
      payloads.flat().forEach((review) => {
        const key = String(review?._id || `${review?.userId}-${review?.createdAt}-${review?.comment}`);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(review);
      });
      merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setReviews(merged);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [ids]);

  useEffect(() => {
    setLoading(true);
    loadReviews();
  }, [loadReviews]);

  const summary = useMemo(() => buildSummary(reviews), [reviews]);
  const preview = reviews.slice(0, PREVIEW_LIMIT);

  const findEligibleOrder = useCallback(async () => {
    const result = await fetchOrderHistory({ silent: true, limit: 50 });
    const orders = Array.isArray(result?.orders) ? result.orders : [];
    const idSet = productIdSet(product, productId);
    const match = orders.find((order) =>
      isDeliveredOrder(order)
      && (order.items || []).some((item) => itemMatchesProduct(item, idSet))
    );
    if (!match) return null;
    const item = (match.items || []).find((entry) => itemMatchesProduct(entry, idSet));
    return {
      orderId: String(match._id),
      productId: String(item?.id || item?.productId || productId || product?.id || ''),
    };
  }, [fetchOrderHistory, product, productId]);

  const openWriteReview = useCallback(async () => {
    if (!token) {
      Alert.alert(
        'Login required',
        'Please sign in to write a review.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }

    const eligible = await findEligibleOrder();
    if (!eligible) {
      Alert.alert(
        'Verified purchase required',
        'You can review this product after an order containing it has been delivered.',
        [
          { text: 'OK', style: 'cancel' },
          { text: 'My orders', onPress: () => navigation.navigate('Main', { screen: 'Orders' }) },
        ]
      );
      return;
    }

    setEligibleOrder(eligible);
    setShowWriteReview(true);
  }, [findEligibleOrder, navigation, token]);

  const submitReview = useCallback(async () => {
    if (!token) {
      setShowWriteReview(false);
      openWriteReview();
      return;
    }
    if (comment.trim().length < 10) {
      Alert.alert('Review too short', 'Please write at least 10 characters.');
      return;
    }

    const eligible = eligibleOrder || await findEligibleOrder();
    if (!eligible) {
      Alert.alert(
        'Verified purchase required',
        'You can review this product after an order containing it has been delivered.'
      );
      return;
    }

    try {
      setSubmitting(true);
      const { data } = await reviewsAPI.submit({
        orderId: eligible.orderId,
        productId: eligible.productId,
        rating,
        comment: comment.trim(),
      });
      if (data?.success === false) {
        Alert.alert('Error', data.message || 'Failed to submit review.');
        return;
      }
      Alert.alert('Review submitted', data?.message || 'Thank you for your feedback.');
      setShowWriteReview(false);
      setComment('');
      setRating(5);
      setEligibleOrder(null);
      loadReviews();
    } catch (error) {
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to submit review.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [comment, eligibleOrder, findEligibleOrder, loadReviews, openWriteReview, rating, token]);

  return (
    <View style={[styles.container, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Reviews ({summary.total})
        </Text>
        <Pressable
          onPress={openWriteReview}
          style={[styles.writeBtn, { borderColor: colors.border, backgroundColor: colors.qtyBg }]}
        >
          <Text style={[styles.writeBtnText, { color: colors.accent }]}>Write review</Text>
        </Pressable>
      </View>

      {summary.avg > 0 ? (
        <View style={[styles.ratingSummary, { backgroundColor: colors.qtyBg }]}>
          <View style={styles.avgBlock}>
            <Text style={[styles.avgNumber, { color: colors.text }]}>{summary.avg.toFixed(1)}</Text>
            <Text style={[styles.avgStars, { color: colors.accent }]}>
              {'★'.repeat(Math.max(1, Math.round(summary.avg)))}
            </Text>
            <Text style={[styles.avgTotal, { color: colors.muted }]}>{summary.total} reviews</Text>
          </View>
          <View style={styles.distBars}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.dist[star] || 0;
              const width = summary.total ? `${(count / summary.total) * 100}%` : '0%';
              return (
                <View key={star} style={styles.distRow}>
                  <Text style={[styles.distLabel, { color: colors.muted }]}>{star}★</Text>
                  <View style={[styles.distBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.distFill, { width, backgroundColor: colors.accent }]} />
                  </View>
                  <Text style={[styles.distCount, { color: colors.muted }]}>{count}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {loading ? (
        <Text style={[styles.loadingText, { color: colors.muted }]}>Loading reviews…</Text>
      ) : preview.length === 0 ? (
        <View style={styles.emptyReviews}>
          <Text style={[styles.emptyText, { color: colors.text }]}>No reviews yet.</Text>
          <Text style={[styles.emptySubText, { color: colors.muted }]}>Be the first to review!</Text>
        </View>
      ) : (
        preview.map((review) => {
          const name = reviewerName(review);
          const stars = Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0)));
          const photo = resolveMediaUrl(review.photo);
          return (
            <View key={String(review._id)} style={[styles.reviewCard, { borderBottomColor: colors.border }]}>
              <View style={styles.reviewHeader}>
                <View style={[styles.reviewAvatar, { backgroundColor: colors.accent }]}>
                  <Text style={styles.avatarText}>{name[0].toUpperCase()}</Text>
                </View>
                <View style={styles.reviewMeta}>
                  <Text style={[styles.reviewerName, { color: colors.text }]}>{name}</Text>
                  <Text style={[styles.reviewDate, { color: colors.muted }]}>
                    {formatReviewDate(review.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.reviewStars, { color: colors.accent }]}>
                  {'★'.repeat(stars)}
                  <Text style={{ color: colors.border }}>{'★'.repeat(5 - stars)}</Text>
                </Text>
              </View>
              <Text style={[styles.reviewComment, { color: colors.text }]}>{review.comment}</Text>
              {photo ? (
                <Image source={{ uri: photo }} style={[styles.reviewPhoto, { backgroundColor: colors.imageBg }]} />
              ) : null}
            </View>
          );
        })
      )}

      {reviews.length > PREVIEW_LIMIT ? (
        <Text style={[styles.moreHint, { color: colors.muted }]}>
          Showing {PREVIEW_LIMIT} of {reviews.length} reviews
        </Text>
      ) : null}

      <Modal
        visible={showWriteReview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWriteReview(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          <KeyboardAvoidingView
            style={styles.modalFlex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Write a review</Text>
              <Pressable onPress={() => setShowWriteReview(false)} hitSlop={8}>
                <Text style={[styles.modalClose, { color: colors.muted }]}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.ratingLabel, { color: colors.text }]}>Your rating</Text>
              <StarSelector value={rating} onChange={setRating} colors={colors} />

              <Text style={[styles.ratingLabel, { color: colors.text, marginTop: 20 }]}>
                Your review
              </Text>
              <TextInput
                style={[
                  styles.reviewInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.inputBg,
                  },
                ]}
                placeholder="Share your experience with this product..."
                placeholderTextColor={colors.muted}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  { backgroundColor: colors.primaryBtn },
                  pressed && { backgroundColor: colors.primaryBtnPressed },
                  submitting && styles.submitBtnDisabled,
                ]}
                onPress={submitReview}
                disabled={submitting}
              >
                <Text style={[styles.submitBtnText, { color: colors.primaryBtnText }]}>
                  {submitting ? 'Submitting…' : 'Submit review'}
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderTopWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  writeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  writeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  ratingSummary: {
    flexDirection: 'row',
    gap: 16,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  avgBlock: {
    alignItems: 'center',
    gap: 4,
    minWidth: 70,
  },
  avgNumber: {
    fontSize: 40,
    fontWeight: '800',
  },
  avgStars: {
    fontSize: 16,
  },
  avgTotal: {
    fontSize: 11,
  },
  distBars: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distLabel: {
    fontSize: 11,
    width: 24,
    textAlign: 'right',
  },
  distBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  distFill: {
    height: '100%',
    borderRadius: 3,
  },
  distCount: {
    fontSize: 11,
    width: 18,
    textAlign: 'right',
  },
  loadingText: {
    textAlign: 'center',
    padding: 16,
  },
  emptyReviews: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubText: {
    fontSize: 13,
    marginTop: 4,
  },
  reviewCard: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  reviewMeta: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewDate: {
    fontSize: 11,
    marginTop: 1,
  },
  reviewStars: {
    fontSize: 14,
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
  },
  reviewPhoto: {
    marginTop: 10,
    width: '100%',
    height: 160,
    borderRadius: 8,
  },
  moreHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
  },
  modalFlex: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalClose: {
    fontSize: 18,
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
  },
  starPick: {
    fontSize: 32,
  },
  reviewInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    minHeight: 120,
    marginBottom: 20,
  },
  submitBtn: {
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
