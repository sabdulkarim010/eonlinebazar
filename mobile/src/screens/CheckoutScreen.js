import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { addressIdOf, addressesAPI, extractAddresses } from '../api/addresses';
import { couponsAPI, extractCouponDiscount, extractHasActiveCoupon } from '../api/coupons';
import {
  computeProcessingFee,
  extractPaymentMethods,
  formatFeeHint,
  needsTransactionId,
  paymentsAPI,
} from '../api/payments';
import {
  extractDeliveryCharge,
  extractDistricts,
  storeAPI,
} from '../api/store';
import DistrictUpazilaPicker from '../components/DistrictUpazilaPicker';
import { resolveDistrictName, resolveUpazilaName } from '../data/bdLocations';
import useAuthStore from '../store/useAuthStore';
import useCartStore from '../store/useCartStore';
import useOrderStore from '../store/useOrderStore';
import { useTheme } from '../theme/tokens';
import useToastStore from '../store/useToastStore';
import { haptic } from '../utils/haptics';
import { resolveMediaUrl } from '../utils/normalizeProduct';

const BD_MOBILE_RE = /^01[3-9]\d{8}$/;
const FALLBACK_DELIVERY_CHARGE = 60;

function formatBdt(price) {
  return `৳${Number(price).toLocaleString('en-US')}`;
}

function checkoutItemProductId(item) {
  return item.product?._id || item.product?.id || item.productId || item.id;
}

function checkoutItemImageUri(item) {
  return item.image || item.product?.image || item.product?.images?.[0] || '';
}

function checkoutVariantLabel(item) {
  const color = item.variant?.color || item.selectedColor;
  const size = item.variant?.size || item.selectedSize;
  return [color, size].filter(Boolean).join(' · ');
}

function formatSavedAddressCardLine(addr = {}) {
  const locality = [
    addr.upazilaOrThana || addr.upazila || addr.thana,
    addr.district,
  ].filter(Boolean).join(', ');
  const street = String(addr.fullAddress || '').trim();
  return [street, locality].filter(Boolean).join(' — ');
}

function buildCompleteDeliveryAddress(streetText, upazilaVal, districtVal) {
  return [streetText, upazilaVal, districtVal].filter(Boolean).join(', ');
}

function SavedAddressCard({ addr, selected, onSelect, T }) {
  const label = String(addr.label || 'Address').trim();
  const line = formatSavedAddressCardLine(addr);
  const phone = String(addr.phone || '').trim();
  const isDefault = Boolean(addr.isDefault);

  return (
    <Pressable
      style={[
        styles.savedAddressCard,
        { backgroundColor: T.card, borderColor: T.border },
        selected && { borderColor: T.accent, backgroundColor: T.qtyBg },
        isDefault && !selected && styles.savedAddressCardDefault,
      ]}
      onPress={() => onSelect(addr)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View
        style={[
          styles.radio,
          { borderColor: T.muted },
          selected && { borderColor: T.accent, backgroundColor: T.accent },
        ]}
      />
      <View style={styles.savedAddressBody}>
        <View style={styles.savedAddressTitleRow}>
          <Text style={[styles.savedAddressLabel, { color: T.text }]}>{label}</Text>
          {isDefault ? (
            <View style={[styles.defaultBadge, { backgroundColor: T.accent }]}>
              <Text style={styles.defaultBadgeText}>DEFAULT</Text>
            </View>
          ) : null}
        </View>
        {line ? (
          <Text style={[styles.savedAddressLine, { color: T.muted }]} numberOfLines={2}>
            {line}
          </Text>
        ) : null}
        {phone ? (
          <View style={styles.savedAddressPhoneRow}>
            <Ionicons name="call-outline" size={13} color={T.muted} />
            <Text style={[styles.savedAddressPhone, { color: T.text }]}>{phone}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function CheckoutScreen({ navigation, route }) {
  const T = useTheme();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const allCartItems = useCartStore((state) => state.items);
  const checkoutItems = useMemo(
    () => allCartItems.filter((item) => item.selected !== false),
    [allCartItems]
  );
  const subtotal = useMemo(
    () => checkoutItems.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.quantity || 1),
      0
    ),
    [checkoutItems]
  );
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
  const [phone, setPhone] = useState(user?.mobile || user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState('');
  const [courierNote, setCourierNote] = useState('');
  const [saveAddress, setSaveAddress] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [loadingDelivery, setLoadingDelivery] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [paymentsError, setPaymentsError] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [couponsAvailable, setCouponsAvailable] = useState(false);
  const [upazila, setUpazila] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [error, setError] = useState('');

  const baseTotal = Math.max(0, subtotal + deliveryCharge - couponDiscount);
  const processingFee = computeProcessingFee(selectedMethod, baseTotal);
  const orderTotal = Math.max(0, baseTotal + processingFee);
  const showTransactionId = needsTransactionId(selectedMethod);
  const addressesInitializedRef = useRef(false);

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
    if (!districtName) setDeliveryCharge(0);
    setSelectedSavedAddressId(null);
  }, []);

  const clearSavedAddressSelection = useCallback(() => {
    setSelectedSavedAddressId(null);
  }, []);

  const revertToProfileDefaults = useCallback(() => {
    const district = resolveDistrictName(user?.district) || String(user?.district || '').trim();
    const rawUpazila = user?.upazila || user?.thana || '';
    setName(defaultName);
    setPhone(String(user?.mobile || user?.phone || ''));
    setEmail(String(user?.email || ''));
    setAddress(String(user?.fullAddress || '').trim());
    setSelectedDistrict(district);
    setUpazila(resolveUpazilaName(district, rawUpazila) || String(rawUpazila || '').trim());
    setSaveAddress(false);
  }, [defaultName, user]);

  const applySavedAddress = useCallback((addr) => {
    if (!addr) return;

    setSelectedSavedAddressId(addressIdOf(addr));
    setSaveAddress(false);

    const profileName = user?.name
      || [user?.firstName, user?.lastName].filter(Boolean).join(' ')
      || defaultName;
    if (profileName) setName(profileName);
    if (addr.phone) setPhone(String(addr.phone));

    const street = String(addr.fullAddress || addr.streetAddress || addr.street || '').trim();
    setAddress(street);

    const nextDistrict = resolveDistrictName(addr.district) || String(addr.district || '').trim();
    const rawUpazila = addr.upazilaOrThana || addr.upazila || addr.thana || '';
    const nextUpazila = resolveUpazilaName(nextDistrict, rawUpazila) || String(rawUpazila || '').trim();

    setSelectedDistrict(nextDistrict);
    setUpazila(nextUpazila);
  }, [defaultName, user]);

  const loadSavedAddresses = useCallback(async (autoSelectDefault = true) => {
    if (!token) {
      setSavedAddresses([]);
      setSelectedSavedAddressId(null);
      return;
    }
    try {
      setLoadingAddresses(true);
      const { data } = await addressesAPI.list();
      const list = extractAddresses(data);
      setSavedAddresses(list);
      if (autoSelectDefault && list.length) {
        const defaultAddr = list.find((item) => item.isDefault) || list[0];
        if (defaultAddr) applySavedAddress(defaultAddr);
      }
    } catch {
      setSavedAddresses([]);
    } finally {
      setLoadingAddresses(false);
    }
  }, [applySavedAddress, token]);

  useFocusEffect(
    useCallback(() => {
      const selected = route.params?.selectedAddress;
      if (selected) {
        applySavedAddress(selected);
        navigation.setParams({ selectedAddress: undefined });
        return undefined;
      }
      if (token) {
        const shouldAutoSelect = !addressesInitializedRef.current;
        addressesInitializedRef.current = true;
        loadSavedAddresses(shouldAutoSelect);
      }
      return undefined;
    }, [applySavedAddress, loadSavedAddresses, navigation, route.params?.selectedAddress, token])
  );

  const loadPaymentMethods = useCallback(async () => {
    try {
      setLoadingPayments(true);
      setPaymentsError('');
      const { data } = await paymentsAPI.getMethods();
      const methods = extractPaymentMethods(data);
      setPaymentMethods(methods);
      setSelectedMethod((prev) => {
        if (prev && methods.some((method) => String(method.id) === String(prev.id))) {
          return prev;
        }
        return methods[0] || null;
      });
    } catch {
      setPaymentMethods([]);
      setSelectedMethod(null);
      setPaymentsError('Could not load payment methods. Pull to refresh or try again.');
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  const refreshCouponAvailability = useCallback(async () => {
    try {
      const { data } = await couponsAPI.activeCheck();
      const available = extractHasActiveCoupon(data);
      setCouponsAvailable(available);
      if (!available) {
        setCouponCode('');
        setCouponDiscount(0);
        setCouponMsg('');
      }
    } catch {
      setCouponsAvailable(false);
      setCouponCode('');
      setCouponDiscount(0);
      setCouponMsg('');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPaymentMethods();
      refreshCouponAvailability();
    }, [loadPaymentMethods, refreshCouponAvailability])
  );

  const selectPaymentMethod = useCallback((method) => {
    setSelectedMethod(method);
    setTransactionId('');
  }, []);

  const applyCoupon = useCallback(async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    try {
      setApplyingCoupon(true);
      setCouponMsg('');
      const { data } = await couponsAPI.apply(code, subtotal);
      if (data?.success === false) {
        setCouponDiscount(0);
        useCartStore.getState().clearAppliedCoupon();
        setCouponMsg(data.message || 'Invalid coupon');
        return;
      }
      const discount = extractCouponDiscount(data);
      setCouponCode(code);
      setCouponDiscount(discount);
      useCartStore.getState().setAppliedCoupon({ code, discount });
      setCouponMsg(data?.message || `Coupon applied. You save ${formatBdt(discount)}`);
    } catch (err) {
      setCouponDiscount(0);
      setCouponMsg(err.response?.data?.message || 'Invalid coupon');
    } finally {
      setApplyingCoupon(false);
    }
  }, [couponCode, subtotal]);

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

  const handleOrderSuccess = useCallback((order) => {
    const isLoggedIn = Boolean(useAuthStore.getState().token);

    if (isLoggedIn) {
      navigation.reset({
        index: 0,
        routes: [{
          name: 'Main',
          state: { routes: [{ name: 'Orders' }] },
        }],
      });
      return;
    }

    navigation.replace('OrderSuccess', {
      orderId: order?._id,
      orderNumber: order?.orderId || order?.orderNumber,
      total: order?.grandTotal ?? order?.totalAmount ?? orderTotal,
    });
  }, [navigation, orderTotal]);

  const handlePlaceOrder = async () => {
    setError('');
    const customerName = name.trim();
    const customerPhone = phone.replace(/\D/g, '');
    const customerAddress = address.trim();
    const shippingDistrict = resolveDistrictName(selectedDistrict.trim()) || selectedDistrict.trim();
    const shippingUpazila = resolveUpazilaName(shippingDistrict, upazila.trim()) || upazila.trim();
    const completeAddress = buildCompleteDeliveryAddress(
      customerAddress,
      shippingUpazila,
      shippingDistrict
    );

    if (!customerName || customerName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!customerPhone || !BD_MOBILE_RE.test(customerPhone)) {
      setError('Please enter a valid 11-digit Bangladesh mobile number (01XXXXXXXXX).');
      return;
    }
    if (!customerAddress) {
      setError('Please enter your full delivery address.');
      return;
    }
    if (!shippingDistrict) {
      setError('Please select your shipping district.');
      return;
    }
    if (!upazila.trim()) {
      setError('Please select your upazila / thana.');
      return;
    }
    if (!checkoutItems.length) {
      setError('Select at least one cart item to checkout.');
      return;
    }
    if (!selectedMethod) {
      setError('Please select a payment method.');
      return;
    }
    const trx = transactionId.trim();
    if (showTransactionId && !trx) {
      setError('Please enter your payment transaction ID.');
      return;
    }

    const orderNote = courierNote.trim()
      || (trx && !token ? `Payment TRX: ${trx}` : '');

    const result = await createOrder({
      customerName,
      customerPhone,
      customerEmail: email.trim(),
      customerAddress: completeAddress,
      shippingDistrict,
      shippingUpazila,
      shippingStreetAddress: customerAddress,
      paymentMethodId: selectedMethod.id,
      paymentMethod: selectedMethod.code || selectedMethod.name,
      deliveryCharge,
      totalAmount: orderTotal,
      couponCode: couponCode.trim() || undefined,
      discount: couponDiscount,
      note: orderNote || undefined,
      saveAddressToProfile: saveAddress && !selectedSavedAddressId,
      saveAddressAsDefault: saveAddress && !selectedSavedAddressId,
      addressLabel: 'Home',
    }, checkoutItems);

    if (!result.success) {
      setError(result.message || 'Failed to place order.');
      showToast(result.message || 'Failed to place order.', 'error');
      return;
    }

    const order = result.order;
    const orderMongoId = order?._id;
    const publicOrderId = order?.orderId || order?.orderNumber;

    if (trx && token && orderMongoId) {
      try {
        await paymentsAPI.submitProof(orderMongoId, trx);
      } catch {
        showToast('Order placed. Submit your transaction ID from order details.');
      }
    }

    if (selectedMethod.type === 'automated' && publicOrderId) {
      try {
        const { data } = await paymentsAPI.initiate(publicOrderId, selectedMethod.id);
        const redirectUrl = data?.data?.redirectUrl || data?.redirectUrl;
        if (data?.success && redirectUrl) {
          await Linking.openURL(redirectUrl);
          haptic.success();
          showToast('Order placed. Complete payment on the gateway.');
          handleOrderSuccess(order);
          return;
        }
      } catch {
        // Order is placed; gateway redirect can be completed later.
      }
    }

    haptic.success();
    showToast('Order placed successfully');
    handleOrderSuccess(order);
  };

  if (allCartItems.length === 0 || checkoutItems.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: T.bg }]}>
        <Text style={[styles.emptyTitle, { color: T.text }]}>
          {allCartItems.length === 0 ? 'Your cart is empty' : 'No items selected'}
        </Text>
        <Text style={[styles.emptyBody, { color: T.muted }]}>
          {allCartItems.length === 0
            ? 'Add products before checking out.'
            : 'Go back to cart and select items to checkout.'}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: T.primaryBtn },
            pressed && { backgroundColor: T.primaryBtnPressed },
          ]}
          onPress={() => navigation.navigate('Main', { screen: 'Cart' })}
        >
          <Text style={[styles.primaryBtnText, { color: T.primaryBtnText }]}>Back to cart</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: T.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionTitle, { color: T.text }]}>Shipping information</Text>

        {token && savedAddresses.length > 0 ? (
          <View style={styles.savedAddressSection}>
            <Text style={[styles.savedAddressHeading, { color: T.text }]}>
              Select a delivery address
            </Text>
            <Text style={[styles.savedAddressSubheading, { color: T.muted }]}>
              Choose a saved address to auto-fill your shipping details instantly.
            </Text>
            {loadingAddresses ? (
              <ActivityIndicator color={T.accent} style={styles.savedAddressLoader} />
            ) : (
              savedAddresses.map((addr) => (
                <SavedAddressCard
                  key={addressIdOf(addr)}
                  addr={addr}
                  selected={selectedSavedAddressId === addressIdOf(addr)}
                  T={T}
                  onSelect={(item) => {
                    const id = addressIdOf(item);
                    if (selectedSavedAddressId === id) {
                      clearSavedAddressSelection();
                      revertToProfileDefaults();
                      return;
                    }
                    applySavedAddress(item);
                  }}
                />
              ))
            )}
            <Pressable
              style={styles.manageAddressesLink}
              onPress={() => navigation.navigate('Addresses')}
            >
              <Text style={[styles.manageAddressesText, { color: T.link }]}>
                Manage saved addresses
              </Text>
              <Ionicons name="chevron-forward" size={16} color={T.link} />
            </Pressable>
          </View>
        ) : null}

        <DistrictUpazilaPicker
          district={selectedDistrict}
          upazila={upazila}
          extraDistricts={districts}
          colors={T}
          onDistrictChange={onDistrictChange}
          onUpazilaChange={(value) => {
            setUpazila(value);
            setSelectedSavedAddressId(null);
          }}
        />
        <Text style={[styles.fieldHint, { color: T.muted }]}>
          Delivery charge is calculated automatically from your district.
        </Text>

        <Text style={[styles.label, { color: T.text }]}>
          Full Name <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
          ]}
          value={name}
          onChangeText={(value) => {
            setName(value);
            clearSavedAddressSelection();
          }}
          autoCapitalize="words"
          placeholder="Enter your full name"
          placeholderTextColor={T.muted}
          maxLength={50}
        />

        <Text style={[styles.label, { color: T.text }]}>
          Mobile Number <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
          ]}
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            clearSavedAddressSelection();
          }}
          keyboardType="phone-pad"
          placeholder="e.g. 01XXXXXXXXX"
          placeholderTextColor={T.muted}
          maxLength={11}
        />

        <Text style={[styles.label, { color: T.text }]}>
          Email Address <Text style={[styles.optionalTag, { color: T.muted }]}>(Optional)</Text>
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
          ]}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="For order confirmation (optional)"
          placeholderTextColor={T.muted}
          maxLength={120}
        />
        <Text style={[styles.fieldHint, { color: T.muted }]}>
          We&apos;ll send your order confirmation here if provided.
        </Text>

        <Text style={[styles.label, { color: T.text }]}>
          Full Delivery Address <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={[
            styles.input,
            styles.addressInput,
            { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
          ]}
          value={address}
          onChangeText={(value) => {
            setAddress(value);
            clearSavedAddressSelection();
          }}
          multiline
          textAlignVertical="top"
          placeholder="House, road, village, area"
          placeholderTextColor={T.muted}
        />
        <Text style={[styles.fieldHint, { color: T.muted }]}>
          Street details are combined with your selected upazila for dispatch.
        </Text>

        <Text style={[styles.label, { color: T.text }]}>
          Note for Courier <Text style={[styles.optionalTag, { color: T.muted }]}>(Optional)</Text>
        </Text>
        <TextInput
          style={[
            styles.input,
            styles.noteInput,
            { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
          ]}
          value={courierNote}
          onChangeText={setCourierNote}
          multiline
          textAlignVertical="top"
          placeholder="Any specific instructions for delivery man"
          placeholderTextColor={T.muted}
        />

        {token ? (
          <Pressable
            style={[
              styles.saveAddressRow,
              selectedSavedAddressId && styles.saveAddressRowDisabled,
            ]}
            onPress={() => {
              if (selectedSavedAddressId) return;
              setSaveAddress((prev) => !prev);
            }}
            disabled={Boolean(selectedSavedAddressId)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: saveAddress, disabled: Boolean(selectedSavedAddressId) }}
          >
            <Ionicons
              name={saveAddress ? 'checkbox' : 'square-outline'}
              size={22}
              color={selectedSavedAddressId ? T.muted : T.accent}
            />
            <View style={styles.saveAddressCopy}>
              <Text style={[styles.saveAddressTitle, { color: T.text }]}>
                Save this address to my profile
              </Text>
              <Text style={[styles.saveAddressHint, { color: T.muted }]}>
                For faster checkout on future orders
              </Text>
            </View>
          </Pressable>
        ) : null}

        {couponsAvailable ? (
          <>
            <Text style={[styles.sectionTitle, { color: T.text }]}>Coupon</Text>
            <View style={styles.couponRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.couponInput,
                  { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
                ]}
                placeholder="Enter coupon code"
                placeholderTextColor={T.muted}
                value={couponCode}
                onChangeText={(value) => {
                  setCouponCode(value);
                  setCouponDiscount(0);
                  setCouponMsg('');
                }}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.couponBtn,
                  { backgroundColor: T.primaryBtn },
                  pressed && { backgroundColor: T.primaryBtnPressed },
                  applyingCoupon && styles.btnDisabled,
                ]}
                onPress={applyCoupon}
                disabled={applyingCoupon}
              >
                {applyingCoupon ? (
                  <ActivityIndicator color={T.primaryBtnText} />
                ) : (
                  <Text style={[styles.couponBtnText, { color: T.primaryBtnText }]}>Apply</Text>
                )}
              </Pressable>
            </View>
            {couponMsg ? (
              <Text style={[styles.couponMsg, { color: couponDiscount > 0 ? T.success : T.price }]}>
                {couponMsg}
              </Text>
            ) : null}
          </>
        ) : null}

        <Text style={[styles.sectionTitle, { color: T.text }]}>Payment</Text>
        {loadingPayments ? (
          <View style={styles.paymentLoading}>
            <ActivityIndicator color={T.accent} />
            <Text style={[styles.paymentLoadingText, { color: T.muted }]}>Loading payment methods…</Text>
          </View>
        ) : null}
        {!loadingPayments && paymentsError ? (
          <Text style={[styles.paymentsError, { color: T.price }]}>{paymentsError}</Text>
        ) : null}
        {!loadingPayments && !paymentMethods.length && !paymentsError ? (
          <Text style={[styles.paymentsError, { color: T.muted }]}>
            No payment methods are available right now. Please contact support.
          </Text>
        ) : null}
        {!loadingPayments && paymentMethods.map((method) => {
          const isSelected = String(selectedMethod?.id) === String(method.id);
          const logoUri = resolveMediaUrl(method.logoUrl);
          const feeHint = formatFeeHint(method);
          return (
            <Pressable
              key={String(method.id || method.code)}
              style={[
                styles.methodCard,
                { backgroundColor: T.card, borderColor: T.border },
                isSelected && { borderColor: T.accent },
              ]}
              onPress={() => selectPaymentMethod(method)}
            >
              <View
                style={[
                  styles.radio,
                  { borderColor: T.muted },
                  isSelected && { borderColor: T.accent, backgroundColor: T.accent },
                ]}
              />
              <View style={styles.methodBody}>
                <Text style={[styles.methodName, { color: T.text }]}>{method.name}</Text>
                <Text style={[styles.methodHint, { color: T.muted }]}>
                  {method.description
                    || (method.type === 'automated' ? 'Secure gateway checkout' : 'Pay using this method')}
                </Text>
                {feeHint ? (
                  <Text style={[styles.methodFee, { color: T.accent }]}>{feeHint}</Text>
                ) : null}
              </View>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.methodLogo} resizeMode="contain" />
              ) : (
                <View style={[styles.methodLogoFallback, { backgroundColor: T.qtyBg }]}>
                  <Ionicons
                    name={method.type === 'automated' ? 'shield-checkmark-outline' : 'wallet-outline'}
                    size={20}
                    color={T.muted}
                  />
                </View>
              )}
            </Pressable>
          );
        })}
        {selectedMethod ? (
          <View style={[styles.instructionsBox, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.instructionsTitle, { color: T.text }]}>
              {selectedMethod.type === 'automated'
                ? 'Secure gateway payment'
                : `${selectedMethod.name} instructions`}
            </Text>
            {selectedMethod.type === 'automated' ? (
              <Text style={[styles.instructionsCopy, { color: T.muted }]}>
                You will be redirected to a secure payment gateway to complete your payment for{' '}
                {selectedMethod.name}.
              </Text>
            ) : (
              <>
                {selectedMethod.accountNumber ? (
                  <View style={[styles.accountChip, { backgroundColor: T.qtyBg }]}>
                    <Text style={[styles.accountChipLabel, { color: T.muted }]}>Account</Text>
                    <Text style={[styles.accountChipValue, { color: T.text }]}>
                      {selectedMethod.accountNumber}
                    </Text>
                  </View>
                ) : null}
                <Text style={[styles.instructionsCopy, { color: T.muted }]}>
                  {selectedMethod.instructions
                    || `Follow the payment steps for ${selectedMethod.name} and keep your transaction reference.`}
                </Text>
              </>
            )}
            <Text style={[styles.instructionsNote, { color: T.muted }]}>
              Our team verifies payments shortly after you place the order.
            </Text>
          </View>
        ) : null}
        {showTransactionId ? (
          <>
            <Text style={[styles.label, { color: T.text }]}>Transaction ID / TRX ID</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
              ]}
              value={transactionId}
              onChangeText={setTransactionId}
              placeholder="e.g. 8N7A2X9K4P"
              placeholderTextColor={T.muted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </>
        ) : null}

        <Text style={[styles.sectionTitle, { color: T.text }]}>Order summary</Text>
        {checkoutItems.map((item, idx) => {
          const variantText = checkoutVariantLabel(item);
          const imageUri = checkoutItemImageUri(item);
          const productId = checkoutItemProductId(item);
          return (
            <Pressable
              key={String(item.key || item.id || idx)}
              style={[styles.summaryItem, { borderBottomColor: T.border }]}
              onPress={() => {
                if (productId) {
                  navigation.navigate('ProductDetails', { productId });
                }
              }}
            >
              <Image
                source={imageUri ? { uri: imageUri } : undefined}
                style={[styles.summaryItemImg, { backgroundColor: T.imageBg }]}
              />
              <View style={styles.summaryItemInfo}>
                <Text style={[styles.summaryItemName, { color: T.text }]} numberOfLines={1}>
                  {item.name || item.product?.name}
                </Text>
                {variantText ? (
                  <Text style={[styles.summaryItemVariant, { color: T.muted, backgroundColor: T.qtyBg }]}>
                    {variantText}
                  </Text>
                ) : null}
                <Text style={[styles.summaryItemQty, { color: T.muted }]}>
                  ×{item.quantity}
                </Text>
              </View>
              <Text style={[styles.summaryItemPrice, { color: T.accent }]}>
                {formatBdt(Number(item.price) * Number(item.quantity))}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryName, { color: T.muted }]}>Subtotal</Text>
          <Text style={[styles.summaryPrice, { color: T.text }]}>{formatBdt(subtotal)}</Text>
        </View>
        {couponDiscount > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryName, { color: T.muted }]}>Coupon</Text>
            <Text style={[styles.summaryPrice, { color: T.success }]}>
              −{formatBdt(couponDiscount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryName, { color: T.muted }]}>Delivery</Text>
          {loadingDelivery ? (
            <ActivityIndicator size="small" color={T.accent} />
          ) : (
            <Text
              style={[
                styles.summaryPrice,
                { color: deliveryCharge === 0 && selectedDistrict ? T.success : T.text },
              ]}
            >
              {!selectedDistrict
                ? '—'
                : (deliveryCharge === 0 ? 'FREE' : formatBdt(deliveryCharge))}
            </Text>
          )}
        </View>
        {processingFee > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryName, { color: T.muted }]}>
              Processing fee{selectedMethod?.name ? ` · ${selectedMethod.name}` : ''}
            </Text>
            <Text style={[styles.summaryPrice, { color: T.text }]}>{formatBdt(processingFee)}</Text>
          </View>
        ) : null}
        <View style={[styles.summaryRow, styles.summaryTotalRow, { borderTopColor: T.border }]}>
          <Text style={[styles.summaryTotalLabel, { color: T.text }]}>Total</Text>
          <Text style={[styles.summaryTotal, { color: T.price }]}>{formatBdt(orderTotal)}</Text>
        </View>

        {error ? <Text style={[styles.error, { color: T.price }]}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: T.primaryBtn },
            pressed && { backgroundColor: T.primaryBtnPressed },
            isLoading && styles.btnDisabled,
          ]}
          onPress={handlePlaceOrder}
          disabled={isLoading || loadingPayments || !selectedMethod}
        >
          {isLoading ? (
            <ActivityIndicator color={T.primaryBtnText} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: T.primaryBtnText }]}>Place order</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 15,
    marginTop: 8,
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  requiredStar: {
    color: '#ef4444',
  },
  optionalTag: {
    fontWeight: '500',
    fontSize: 12,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 14,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  addressInput: {
    minHeight: 88,
  },
  noteInput: {
    minHeight: 72,
  },
  savedAddressSection: {
    marginBottom: 16,
    gap: 10,
  },
  savedAddressHeading: {
    fontSize: 15,
    fontWeight: '700',
  },
  savedAddressSubheading: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  savedAddressLoader: {
    marginVertical: 12,
  },
  savedAddressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 12,
    marginBottom: 8,
  },
  savedAddressCardDefault: {
    borderStyle: 'dashed',
  },
  savedAddressBody: {
    flex: 1,
    gap: 4,
  },
  savedAddressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  savedAddressLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  defaultBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  savedAddressLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  savedAddressPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  savedAddressPhone: {
    fontSize: 13,
    fontWeight: '600',
  },
  manageAddressesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  manageAddressesText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
    paddingVertical: 4,
  },
  saveAddressRowDisabled: {
    opacity: 0.55,
  },
  saveAddressCopy: {
    flex: 1,
    gap: 2,
  },
  saveAddressTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  saveAddressHint: {
    fontSize: 12,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  savedRowText: {
    fontSize: 14,
    fontWeight: '700',
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  couponInput: {
    flex: 1,
    marginBottom: 0,
  },
  couponBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  couponBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  couponMsg: {
    fontSize: 13,
    marginBottom: 12,
  },
  paymentLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  paymentLoadingText: {
    fontSize: 14,
  },
  paymentsError: {
    fontSize: 14,
    marginBottom: 14,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
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
  },
  methodBody: {
    flex: 1,
  },
  methodName: {
    fontSize: 15,
    fontWeight: '700',
  },
  methodHint: {
    fontSize: 13,
    marginTop: 2,
  },
  methodFee: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  methodLogo: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  methodLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionsBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  instructionsCopy: {
    fontSize: 13,
    lineHeight: 20,
  },
  instructionsNote: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  accountChip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  accountChipLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  accountChipValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  summaryItemImg: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  summaryItemInfo: {
    flex: 1,
    gap: 2,
  },
  summaryItemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryItemVariant: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  summaryItemQty: {
    fontSize: 12,
  },
  summaryItemPrice: {
    fontSize: 14,
    fontWeight: '700',
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
    fontSize: 14,
  },
  summaryPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryTotal: {
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    fontSize: 14,
    marginBottom: 10,
  },
  primaryBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
