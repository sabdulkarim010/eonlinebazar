import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  addressIdOf,
  addressesAPI,
  extractAddresses,
  formatAddressLine,
} from '../api/addresses';
import { extractDistricts, storeAPI } from '../api/store';
import AddressForm from '../components/AddressForm';
import EmptyState from '../components/EmptyState';
import { OrderCardSkeleton } from '../components/SkeletonBox';
import { resolveDistrictName, resolveUpazilaName } from '../data/bdLocations';
import useAuthStore from '../store/useAuthStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;
const EMPTY_FORM = {
  id: '',
  label: 'Home',
  phone: '',
  fullAddress: '',
  district: '',
  upazilaOrThana: '',
  postalCode: '',
  isDefault: false,
};

function toForm(addr) {
  if (!addr) return { ...EMPTY_FORM };
  const district = resolveDistrictName(addr.district || '');
  const rawUpazila = addr.upazilaOrThana || addr.upazila || addr.thana || '';
  return {
    id: addressIdOf(addr),
    label: addr.label || 'Home',
    phone: addr.phone || '',
    fullAddress: addr.fullAddress || '',
    district,
    upazilaOrThana: resolveUpazilaName(district, rawUpazila) || rawUpazila,
    postalCode: '',
    isDefault: Boolean(addr.isDefault),
  };
}

function toPayload(form) {
  const street = [form.fullAddress.trim(), form.postalCode.trim()].filter(Boolean).join(', ');
  const district = resolveDistrictName(form.district.trim()) || form.district.trim();
  const upazila = resolveUpazilaName(district, form.upazilaOrThana.trim()) || form.upazilaOrThana.trim();
  return {
    label: form.label.trim() || 'Home',
    phone: form.phone.replace(/\D/g, ''),
    fullAddress: street,
    district,
    upazilaOrThana: upazila,
    upazila,
    isDefault: Boolean(form.isDefault),
  };
}

export default function AddressesScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);
  const selectMode = Boolean(route.params?.selectMode);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [districts, setDistricts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const loadAddresses = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      setAddresses([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { data } = await addressesAPI.list();
      const list = extractAddresses(data);
      list.sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));
      setAddresses(list);
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to load addresses.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast, token]);

  useFocusEffect(
    useCallback(() => {
      loadAddresses();
      storeAPI.getDistricts()
        .then((res) => {
          const list = extractDistricts(res.data);
          if (list.length) setDistricts(list);
        })
        .catch(() => {});
    }, [loadAddresses])
  );

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      phone: user?.mobile || '',
      isDefault: addresses.length === 0,
    });
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (addr) => {
    setForm(toForm(addr));
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormError('');
    setForm(EMPTY_FORM);
  };

  const saveForm = async () => {
    const payload = toPayload(form);
    setFormError('');
    if (!payload.district) {
      setFormError('Please select a district.');
      return;
    }
    if (!payload.upazilaOrThana) {
      setFormError('Please select an upazila / thana.');
      return;
    }
    if (!payload.fullAddress) {
      setFormError('Street / house details are required.');
      return;
    }
    if (payload.phone && !BD_MOBILE_RE.test(payload.phone)) {
      setFormError('Please enter a valid Bangladesh mobile number (01XXXXXXXXX).');
      return;
    }

    setSaving(true);
    try {
      const { data } = form.id
        ? await addressesAPI.update(form.id, payload)
        : await addressesAPI.add(payload);
      if (data?.success === false) {
        setFormError(data.message || 'Could not save address.');
        return;
      }
      setAddresses(extractAddresses(data).length ? extractAddresses(data) : addresses);
      showToast(data?.message || 'Address saved.');
      closeForm();
      loadAddresses({ silent: true });
    } catch (error) {
      setFormError(error.response?.data?.message || 'Could not save address.');
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (addr) => {
    const payload = { ...toPayload(toForm(addr)), isDefault: true };
    try {
      const { data } = await addressesAPI.update(addressIdOf(addr), payload);
      if (data?.success === false) {
        showToast(data.message || 'Could not set default address.', 'error');
        return;
      }
      showToast(data?.message || 'Default address updated.');
      loadAddresses({ silent: true });
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not set default address.', 'error');
    }
  };

  const removeAddress = (addr) => {
    Alert.alert('Delete address?', formatAddressLine(addr) || 'This address will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data } = await addressesAPI.remove(addressIdOf(addr));
            if (data?.success === false) {
              showToast(data.message || 'Could not delete address.', 'error');
              return;
            }
            showToast(data?.message || 'Address deleted.');
            loadAddresses({ silent: true });
          } catch (error) {
            showToast(error.response?.data?.message || 'Could not delete address.', 'error');
          }
        },
      },
    ]);
  };

  const useAddress = (addr) => {
    navigation.navigate({
      name: 'Checkout',
      params: { selectedAddress: addr },
      merge: true,
    });
  };

  if (!token) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in to manage addresses</Text>
        <Text style={[styles.emptyBody, { color: colors.muted }]}>
          Saved addresses are available after you log in.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
          ]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const renderCard = ({ item }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardLabel, { color: colors.text }]}>{item.label || 'Address'}</Text>
        {item.isDefault ? (
          <View style={[styles.badge, { backgroundColor: colors.qtyBg, borderColor: colors.accent }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>Default</Text>
          </View>
        ) : null}
      </View>
      {item.phone ? (
        <Text style={[styles.cardPhone, { color: colors.muted }]}>{item.phone}</Text>
      ) : null}
      <Text style={[styles.cardAddress, { color: colors.text }]}>{formatAddressLine(item)}</Text>
      <View style={styles.cardActions}>
        <Pressable onPress={() => useAddress(item)} hitSlop={6}>
          <Text style={[styles.actionText, { color: colors.link }]}>Use</Text>
        </Pressable>
        <Pressable onPress={() => openEdit(item)} hitSlop={6}>
          <Text style={[styles.actionText, { color: colors.link }]}>Edit</Text>
        </Pressable>
        {!item.isDefault ? (
          <Pressable onPress={() => setDefault(item)} hitSlop={6}>
            <Text style={[styles.actionText, { color: colors.link }]}>Set default</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => removeAddress(item)} hitSlop={6}>
          <Text style={[styles.actionText, { color: colors.price }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {loading && !addresses.length ? (
        <View style={styles.skeletonList}>
          <OrderCardSkeleton />
          <OrderCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item, index) => addressIdOf(item) || String(index)}
          contentContainerStyle={styles.list}
          renderItem={renderCard}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadAddresses({ silent: true });
              }}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={(
            <EmptyState
              type="addresses"
              onAction={openCreate}
              style={styles.emptyState}
            />
          )}
          ListHeaderComponent={
            selectMode ? (
              <Text style={[styles.hint, { color: colors.muted }]}>
                Choose an address to use at checkout.
              </Text>
            ) : null
          }
        />
      )}

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
          ]}
          onPress={openCreate}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>+ Add new address</Text>
        </Pressable>
      </View>

      <Modal visible={formOpen} animationType="slide" onRequestClose={closeForm}>
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.bg }]}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {form.id ? 'Edit address' : 'Add address'}
              </Text>
              <Pressable onPress={closeForm} hitSlop={8}>
                <Text style={[styles.modalClose, { color: colors.link }]}>Close</Text>
              </Pressable>
            </View>
            <AddressForm
              form={form}
              extraDistricts={districts}
              colors={colors}
              error={formError}
              saving={saving}
              onChange={(fields) => setForm((current) => ({ ...current, ...fields }))}
              onSave={saveForm}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 24 },
  skeletonList: { paddingTop: 8, paddingBottom: 24 },
  emptyState: { minHeight: 320 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 16 },
  hint: { fontSize: 14, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardLabel: { fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardPhone: { fontSize: 13, marginTop: 6 },
  cardAddress: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  actionText: { fontSize: 14, fontWeight: '700' },
  footer: { padding: 12, paddingBottom: 20, borderTopWidth: 1 },
  primaryBtn: { borderRadius: 24, paddingVertical: 14, alignItems: 'center', width: '100%' },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalClose: { fontSize: 16, fontWeight: '600' },
});
