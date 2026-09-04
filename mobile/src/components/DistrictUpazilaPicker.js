import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getDistrictByName,
  getUpazilasForDistrict,
  mergeDistrictNames,
  resolveDistrictName,
  resolveUpazilaName,
} from '../data/bdLocations';

const DistrictModalHostContext = createContext(null);

export function DistrictModalHost({ children, style }) {
  const [modalNode, setModalNode] = useState(null);
  return (
    <DistrictModalHostContext.Provider value={setModalNode}>
      <View style={style || styles.host} collapsable={false} pointerEvents="box-none">
        {children}
        {modalNode}
      </View>
    </DistrictModalHostContext.Provider>
  );
}

function filterOptions(options, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return options;
  return options.filter((name) => name.toLowerCase().includes(needle));
}

function PickerSelectionModal({
  visible,
  open,
  colors,
  query,
  onQueryChange,
  filtered,
  onClose,
  onSelect,
  districtLabel,
  upazilaLabel,
  canonicalDistrict,
  selectedUpazila,
  upazilasLength,
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modal, { backgroundColor: colors.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {open === 'district'
              ? `Select ${districtLabel.toLowerCase()}`
              : `Select ${upazilaLabel.toLowerCase()}`}
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.modalClose, { color: colors.link }]}>Close</Text>
          </Pressable>
        </View>
        <TextInput
          style={[
            styles.search,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          value={query}
          onChangeText={onQueryChange}
          placeholder={open === 'district' ? 'Search district' : 'Search upazila / thana'}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
        />
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          renderItem={({ item }) => {
            const selected = open === 'district'
              ? item === canonicalDistrict
              : item.toLowerCase() === String(selectedUpazila || '').toLowerCase();
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => onSelect(item)}
              >
                <Text style={[styles.rowLabel, { color: colors.text }]}>{item}</Text>
                {selected ? (
                  <Ionicons name="checkmark" size={20} color={colors.accent} />
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.muted }]}>
              {open === 'upazila' && !upazilasLength
                ? 'No upazilas found for this district.'
                : 'No matches for that search.'}
            </Text>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

export default function DistrictUpazilaPicker({
  district = '',
  upazila = '',
  onDistrictChange,
  onUpazilaChange,
  colors,
  extraDistricts = [],
  required = true,
  districtLabel = 'District',
  upazilaLabel = 'Upazila / thana',
  districtPlaceholder = 'Select district...',
  upazilaPlaceholder = 'Select upazila / thana...',
}) {
  const setHostModal = useContext(DistrictModalHostContext);
  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState('');
  const onDistrictChangeRef = useRef(onDistrictChange);
  const onUpazilaChangeRef = useRef(onUpazilaChange);
  onDistrictChangeRef.current = onDistrictChange;
  onUpazilaChangeRef.current = onUpazilaChange;

  const districts = useMemo(() => mergeDistrictNames(extraDistricts), [extraDistricts]);
  const canonicalDistrict = resolveDistrictName(district);
  const upazilas = useMemo(() => {
    const list = getUpazilasForDistrict(canonicalDistrict || district);
    const current = String(upazila || '').trim();
    if (!current) return list;
    const exists = list.some((item) => item.toLowerCase() === current.toLowerCase());
    return exists ? list : [current, ...list];
  }, [canonicalDistrict, district, upazila]);

  const upazilaEnabled = Boolean(canonicalDistrict || district);
  const selectedUpazila = resolveUpazilaName(canonicalDistrict || district, upazila) || upazila;
  const options = open === 'district' ? districts : upazilas;
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);

  const closeModal = useCallback(() => {
    setOpen(null);
    setQuery('');
  }, []);

  const handleSelect = useCallback((value) => {
    if (open === 'district') {
      const record = getDistrictByName(value);
      const nextName = record?.name || value;
      onDistrictChangeRef.current?.(nextName);
      const nextUpazilas = getUpazilasForDistrict(nextName);
      const stillValid = nextUpazilas.some(
        (item) => item.toLowerCase() === String(upazila || '').trim().toLowerCase()
      );
      if (!stillValid) onUpazilaChangeRef.current?.('');
    } else {
      onUpazilaChangeRef.current?.(value);
    }
    closeModal();
  }, [open, upazila, closeModal]);

  const openDistrict = () => {
    setQuery('');
    setOpen('district');
  };

  const openUpazila = () => {
    if (!upazilaEnabled) return;
    setQuery('');
    setOpen('upazila');
  };

  const modal = (
    <PickerSelectionModal
      visible={Boolean(open)}
      open={open}
      colors={colors}
      query={query}
      onQueryChange={setQuery}
      filtered={filtered}
      onClose={closeModal}
      onSelect={handleSelect}
      districtLabel={districtLabel}
      upazilaLabel={upazilaLabel}
      canonicalDistrict={canonicalDistrict}
      selectedUpazila={selectedUpazila}
      upazilasLength={upazilas.length}
    />
  );

  useLayoutEffect(() => {
    if (!setHostModal) return undefined;
    setHostModal(modal);
    return () => setHostModal(null);
  }, [
    setHostModal,
    open,
    query,
    filtered,
    colors?.bg,
    colors?.text,
    colors?.border,
    colors?.inputBg,
    colors?.muted,
    colors?.link,
    colors?.accent,
    canonicalDistrict,
    selectedUpazila,
    districtLabel,
    upazilaLabel,
    upazilas.length,
    closeModal,
    handleSelect,
  ]);

  return (
    <View>
      <Text style={[styles.label, { color: colors.text }]}>
        {districtLabel}{required ? ' *' : ''}
      </Text>
      <Pressable
        style={[
          styles.input,
          styles.pickerButton,
          { backgroundColor: colors.inputBg, borderColor: colors.border },
        ]}
        onPress={openDistrict}
      >
        <Text style={{ color: canonicalDistrict ? colors.text : colors.muted, fontSize: 16, flex: 1 }}>
          {canonicalDistrict || districtPlaceholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

      <Text style={[styles.label, { color: colors.text }]}>
        {upazilaLabel}{required ? ' *' : ''}
      </Text>
      <Pressable
        style={[
          styles.input,
          styles.pickerButton,
          { backgroundColor: colors.inputBg, borderColor: colors.border },
          !upazilaEnabled && styles.disabled,
        ]}
        onPress={openUpazila}
        disabled={!upazilaEnabled}
      >
        <Text
          style={{
            color: selectedUpazila ? colors.text : colors.muted,
            fontSize: 16,
            flex: 1,
          }}
        >
          {selectedUpazila || (upazilaEnabled ? upazilaPlaceholder : 'Select district first')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

      {setHostModal ? null : modal}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  disabled: {
    opacity: 0.6,
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
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 15,
    paddingHorizontal: 24,
  },
});
