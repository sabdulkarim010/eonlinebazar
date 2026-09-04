import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import DistrictUpazilaPicker from './DistrictUpazilaPicker';

export default function AddressForm({
  form,
  onChange,
  onSave,
  saving,
  error,
  colors,
  extraDistricts = [],
}) {
  const patch = (fields) => onChange?.(fields);

  return (
    <ScrollView contentContainerStyle={styles.formBody} keyboardShouldPersistTaps="handled">
      <Text style={[styles.label, { color: colors.text }]}>Label</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
        value={form.label}
        onChangeText={(label) => patch({ label })}
        placeholder="Home, Office"
        placeholderTextColor={colors.muted}
      />

      <Text style={[styles.label, { color: colors.text }]}>Phone</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
        value={form.phone}
        onChangeText={(phone) => patch({ phone })}
        keyboardType="phone-pad"
        placeholder="01XXXXXXXXX"
        placeholderTextColor={colors.muted}
      />

      <Text style={[styles.label, { color: colors.text }]}>Street / house</Text>
      <TextInput
        style={[
          styles.input,
          styles.addressInput,
          { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
        ]}
        value={form.fullAddress}
        onChangeText={(fullAddress) => patch({ fullAddress })}
        multiline
        textAlignVertical="top"
        placeholder="House, road, area"
        placeholderTextColor={colors.muted}
      />

      <DistrictUpazilaPicker
        district={form.district}
        upazila={form.upazilaOrThana}
        extraDistricts={extraDistricts}
        colors={colors}
        onDistrictChange={(district) => patch({ district })}
        onUpazilaChange={(upazilaOrThana) => patch({ upazilaOrThana })}
      />

      <Text style={[styles.label, { color: colors.text }]}>Postal code (optional)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
        value={form.postalCode}
        onChangeText={(postalCode) => patch({ postalCode })}
        keyboardType="number-pad"
        placeholder="Postal code"
        placeholderTextColor={colors.muted}
      />

      <Pressable
        style={styles.defaultRow}
        onPress={() => patch({ isDefault: !form.isDefault })}
      >
        <Ionicons
          name={form.isDefault ? 'checkbox' : 'square-outline'}
          size={22}
          color={form.isDefault ? colors.accent : colors.muted}
        />
        <Text style={[styles.defaultLabel, { color: colors.text }]}>Set as default address</Text>
      </Pressable>

      {error ? <Text style={[styles.error, { color: colors.price }]}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.primaryBtn },
          pressed && { backgroundColor: colors.primaryBtnPressed },
          saving && styles.btnDisabled,
        ]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.primaryBtnText} />
        ) : (
          <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>Save address</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  formBody: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  addressInput: { minHeight: 80 },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  defaultLabel: { fontSize: 15, fontWeight: '600' },
  error: { fontSize: 14, marginBottom: 10 },
  primaryBtn: { borderRadius: 24, paddingVertical: 14, alignItems: 'center', width: '100%' },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.7 },
});
