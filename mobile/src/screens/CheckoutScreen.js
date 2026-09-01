import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  extractDeliveryCharge,
  extractDistricts,
  storeAPI,
} from '../api/store';
import useAuthStore from '../store/useAuthStore';
import useCartStore from '../store/useCartStore';
import useOrderStore from '../store/useOrderStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;
const PAYMENT_COD = { code: 'cod', name: 'Cash on Delivery' };
const FALLBACK_DELIVERY_CHARGE = 60;
const FALLBACK_DISTRICTS = [
  'Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur',
  'Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', 'Cumilla', "Cox's Bazar",
  'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati',
  'Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur',
  'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail',
  'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira',
  'Bogura', 'Joypurhat', 'Naogaon', 'Natore', 'Chapainawabganj', 'Pabna', 'Rajshahi', 'Sirajganj',
  'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Rangpur', 'Thakurgaon',
  'Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet',
  'Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur',
];

function formatBdt(price) {
  return `৳${Number(price).toLocaleString('en-US')}`;
}

export default function CheckoutScreen({ navigation }) {
  const { colors } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore((state) => state.getTotalPrice());
  const createOrder = useOrderStore((state) => state.createOrder);
  const isLoading = useOrderStore((state) => state.isLoading);
  const showToast = useToastStore((state) => state.showToast);

  const defaultName = useMemo(
    () =>
      user?.name
      || [user?.firstName, user?.lastName].filter(Boolean).join(' ')
      || '',
    [user]
  );

  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(user?.mobile || '');
  const [address, setAddress] = useState(user?.address || '');
  const [districts, setDistricts] = useState(FALLBACK_DISTRICTS);
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [districtQuery, setDistrictQuery] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [loadingDelivery, setLoadingDelivery] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_COD.code);
  const [error, setError] = useState('');

  const orderTotal = subtotal + deliveryCharge;

  const filteredDistricts = useMemo(() => {
    const needle = districtQuery.trim().toLowerCase();
    if (!needle) return districts;
    return districts.filter((name) => name.toLowerCase().includes(needle));
  }, [districts, districtQuery]);

  useEffect(() => {
    let cancelled = false;
    storeAPI.getDistricts()
      .then((res) => {
        if (cancelled) return;
        const list = extractDistricts(res.data);
        if (list.length) setDistricts(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const onDistrictChange = useCallback((districtName) => {
    setSelectedDistrict(districtName);
    setPickerOpen(false);
    setDistrictQuery('');
    if (!districtName) setDeliveryCharge(0);
  }, []);

  useEffect(() => {
    if (!selectedDistrict) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setLoadingDelivery(true);
        const { data } = await storeAPI.getShippingQuote(selectedDistrict, subtotal);
        if (cancelled) return;
        if (data?.success !== false) {
          setDeliveryCharge(extractDeliveryCharge(data));
        }
      } catch {
        if (!cancelled) setDeliveryCharge(FALLBACK_DELIVERY_CHARGE);
      } finally {
        if (!cancelled) setLoadingDelivery(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDistrict, subtotal]);

  const handlePlaceOrder = async () => {
    setError('');
    const customerName = name.trim();
    const customerPhone = phone.replace(/\D/g, '');
    const customerAddress = address.trim();
    const shippingDistrict = selectedDistrict.trim();

    if (!customerName || !customerPhone || !customerAddress) {
      setError('Name, phone number, and delivery address are required.');
      return;
    }
    if (!BD_MOBILE_RE.test(customerPhone)) {
      setError('Please enter a valid Bangladesh mobile number (01XXXXXXXXX).');
      return;
    }
    if (!shippingDistrict) {
      setError('Please select your shipping district.');
      return;
    }
    if (!items.length) {
      setError('Your cart is empty.');
      return;
    }

    const result = await createOrder({
      customerName,
      customerPhone,
      customerAddress,
      shippingDistrict,
      paymentMethod,
      deliveryCharge,
      totalAmount: orderTotal,
    });

    if (!result.success) {
      setError(result.message || 'Failed to place order.');
      showToast(result.message || 'Failed to place order.', 'error');
      return;
    }

    showToast('Order placed successfully');
    navigation.navigate('Main', { screen: 'Orders' });
  };

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.bg }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Your cart is empty</Text>
        <Text style={[styles.emptyBody, { color: colors.muted }]}>Add products before checking out.</Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
          ]}
          onPress={() => navigation.navigate('Main', { screen: 'Cart' })}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>Back to cart</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Shipping</Text>

        <Text style={[styles.label, { color: colors.text }]}>Full name</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder="Full name"
          placeholderTextColor={colors.muted}
        />

        <Text style={[styles.label, { color: colors.text }]}>Phone number</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="01XXXXXXXXX"
          placeholderTextColor={colors.muted}
        />

        <Text style={[styles.label, { color: colors.text }]}>Delivery address</Text>
        <TextInput
          style={[
            styles.input,
            styles.addressInput,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={address}
          onChangeText={setAddress}
          multiline
          textAlignVertical="top"
          placeholder="House, road, area"
          placeholderTextColor={colors.muted}
        />

        <Text style={[styles.label, { color: colors.text }]}>District *</Text>
        <Pressable
          style={[
            styles.input,
            styles.pickerButton,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
          onPress={() => setPickerOpen(true)}
        >
          <Text
            style={[
              styles.pickerButtonText,
              { color: selectedDistrict ? colors.text : colors.muted },
            ]}
          >
            {selectedDistrict || 'Select district...'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment</Text>
        <Pressable
          style={[
            styles.methodCard,
            { backgroundColor: colors.card, borderColor: colors.border },
            paymentMethod === PAYMENT_COD.code && { borderColor: colors.accent },
          ]}
          onPress={() => setPaymentMethod(PAYMENT_COD.code)}
        >
          <View
            style={[
              styles.radio,
              { borderColor: colors.muted },
              paymentMethod === PAYMENT_COD.code && { borderColor: colors.accent, backgroundColor: colors.accent },
            ]}
          />
          <View style={styles.methodBody}>
            <Text style={[styles.methodName, { color: colors.text }]}>{PAYMENT_COD.name}</Text>
            <Text style={[styles.methodHint, { color: colors.muted }]}>Pay in cash when your parcel arrives.</Text>
          </View>
        </Pressable>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Order summary</Text>
        {items.map((item) => (
          <View key={String(item.key || item.id)} style={styles.summaryRow}>
            <Text style={[styles.summaryName, { color: colors.text }]} numberOfLines={1}>
              {item.name} × {item.quantity}
            </Text>
            <Text style={[styles.summaryPrice, { color: colors.text }]}>
              {formatBdt(Number(item.price) * Number(item.quantity))}
            </Text>
          </View>
        ))}
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryName, { color: colors.muted }]}>Subtotal</Text>
          <Text style={[styles.summaryPrice, { color: colors.text }]}>{formatBdt(subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryName, { color: colors.muted }]}>Delivery</Text>
          {loadingDelivery ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text
              style={[
                styles.summaryPrice,
                { color: deliveryCharge === 0 && selectedDistrict ? colors.success : colors.text },
              ]}
            >
              {!selectedDistrict
                ? '—'
                : (deliveryCharge === 0 ? 'FREE' : formatBdt(deliveryCharge))}
            </Text>
          )}
        </View>
        <View style={[styles.summaryRow, styles.summaryTotalRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.summaryTotalLabel, { color: colors.text }]}>Total</Text>
          <Text style={[styles.summaryTotal, { color: colors.price }]}>{formatBdt(orderTotal)}</Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.price }]}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
            isLoading && styles.btnDisabled,
          ]}
          onPress={handlePlaceOrder}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>Place order</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select district</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
              <Text style={[styles.modalClose, { color: colors.link }]}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            style={[
              styles.search,
              { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
            ]}
            value={districtQuery}
            onChangeText={setDistrictQuery}
            placeholder="Search district"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            data={filteredDistricts}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = item === selectedDistrict;
              return (
                <Pressable
                  style={[
                    styles.districtRow,
                    { borderBottomColor: colors.border },
                    selected && { backgroundColor: colors.card },
                  ]}
                  onPress={() => onDistrictChange(item)}
                >
                  <Text style={[styles.districtName, { color: colors.text }]}>{item}</Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={20} color={colors.accent} />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.emptySearch, { color: colors.muted }]}>No district matches that search.</Text>
            }
          />
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#eaeded',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  empty: {
    flex: 1,
    backgroundColor: '#eaeded',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '700',
  },
  emptyBody: {
    color: '#565959',
    fontSize: 15,
    marginTop: 8,
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
  },
  label: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d5d9d9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111111',
    marginBottom: 14,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerButtonText: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  addressInput: {
    minHeight: 88,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d5d9d9',
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
    gap: 12,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#8a8a8a',
  },
  methodBody: {
    flex: 1,
  },
  methodName: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
  },
  methodHint: {
    color: '#565959',
    fontSize: 13,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  summaryName: {
    flex: 1,
    color: '#111111',
    fontSize: 14,
  },
  summaryPrice: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#d5d9d9',
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  summaryTotalLabel: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
  summaryTotal: {
    color: '#b12704',
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    color: '#b12704',
    fontSize: 14,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#ffd814',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  primaryBtnPressed: {
    backgroundColor: '#f7ca00',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
  modal: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '600',
  },
  search: {
    margin: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  districtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  districtName: {
    fontSize: 16,
  },
  emptySearch: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 15,
  },
});
