/**
 * Bangladesh district list for checkout / shipping selectors.
 */
const BD_DISTRICTS = [
    'Bagerhat', 'Bandarban', 'Barguna', 'Barishal', 'Bhola',
    'Bogura', 'Brahmanbaria', 'Chandpur', 'Chapai Nawabganj',
    'Chattogram', 'Chuadanga', "Cox's Bazar", 'Cumilla',
    'Dhaka', 'Dinajpur', 'Faridpur', 'Feni', 'Gaibandha',
    'Gazipur', 'Gopalganj', 'Habiganj', 'Jamalpur', 'Jashore',
    'Jhalokathi', 'Jhenaidah', 'Joypurhat', 'Khagrachari',
    'Khulna', 'Kishoreganj', 'Kurigram', 'Kushtia', 'Lakshmipur',
    'Lalmonirhat', 'Madaripur', 'Magura', 'Manikganj', 'Meherpur',
    'Moulvibazar', 'Munshiganj', 'Mymensingh', 'Naogaon', 'Narail',
    'Narayanganj', 'Narsingdi', 'Natore', 'Netrokona', 'Nilphamari',
    'Noakhali', 'Pabna', 'Panchagarh', 'Patuakhali', 'Pirojpur',
    'Rajbari', 'Rajshahi', 'Rangamati', 'Rangpur', 'Satkhira',
    'Shariatpur', 'Sherpur', 'Sirajganj', 'Sunamganj', 'Sylhet',
    'Tangail', 'Thakurgaon'
];

window.BD_DISTRICTS = BD_DISTRICTS;

window.BANGLADESH_DISTRICTS = [
    'Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur',
    'Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', 'Cumilla', "Cox's Bazar",
    'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati',
    'Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur',
    'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail',
    'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira',
    'Bogura', 'Joypurhat', 'Naogaon', 'Natore', 'Chapainawabganj', 'Pabna', 'Rajshahi', 'Sirajganj',
    'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Rangpur', 'Thakurgaon',
    'Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet',
    'Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'
];

window.normalizeDistrictName = function normalizeDistrictName(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!raw) return '';
    const aliases = {
        chittagong: 'chattogram',
        ctg: 'chattogram',
        comilla: 'cumilla',
        'coxs bazar': "cox's bazar",
        'cox bazar': "cox's bazar",
        barisal: 'barishal',
        jessore: 'jashore',
        bogra: 'bogura',
        'chapai nawabganj': 'chapainawabganj',
        chapainawabganj: 'chapainawabganj',
        nawabganj: 'chapainawabganj',
        khagrachari: 'khagrachhari',
        khagrachhari: 'khagrachhari'
    };
    return aliases[raw] || raw;
};

function initDistrictSearch(inputId, hiddenInputId, listId) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenInputId);
    const list = document.getElementById(listId);

    if (!input || !list) return;

    input.addEventListener('focus', () => {
        renderList(input.value);
        list.style.display = 'block';
    });

    input.addEventListener('input', () => {
        renderList(input.value);
        list.style.display = 'block';
        if (hidden) hidden.value = '';
        input.classList.remove('has-value');
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
        }
    });

    function renderList(query) {
        const filtered = BD_DISTRICTS.filter((d) =>
            d.toLowerCase().includes(String(query || '').toLowerCase())
        );
        list.innerHTML = filtered.map((d) => {
            const safe = d.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `<div class="district-option" onclick="selectDistrict('${safe}', '${inputId}', '${hiddenInputId}', '${listId}')">${d}</div>`;
        }).join('') || '<div class="district-option-empty">No district found</div>';
    }
}

function selectDistrict(district, inputId, hiddenInputId, listId) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenInputId);
    const listEl = document.getElementById(listId);
    if (input) {
        input.value = district;
        input.classList.toggle('has-value', Boolean(district));
    }
    if (hidden) {
        hidden.value = district;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (listEl) listEl.style.display = 'none';
}

window.selectDistrict = selectDistrict;
window.initDistrictSearch = initDistrictSearch;

window.districtsMatch = function districtsMatch(customerDistrict, shopHomeCity) {
    const left = window.normalizeDistrictName(customerDistrict);
    const right = window.normalizeDistrictName(shopHomeCity);
    return Boolean(left && right && left === right);
};

/**
 * Reusable searchable select: text filter + dropdown, value in hidden input.
 * @returns {{ getValue, setValue, setOptions, setDisabled, destroy, hiddenInput, root }}
 */
window.createSearchableSelect = function createSearchableSelect(config) {
    const {
        mountEl,
        id = '',
        name = '',
        placeholder = 'Select...',
        options = [],
        value = '',
        disabled = false,
        onChange = null,
        ariaLabel = ''
    } = config || {};

    let nativeSelect = null;
    let wrapper = mountEl;
    if (mountEl && mountEl.tagName === 'SELECT') {
        nativeSelect = mountEl;
        wrapper = mountEl.parentElement;
    } else if (mountEl) {
        nativeSelect = mountEl.querySelector('select');
    }

    const hiddenId = id || (nativeSelect && nativeSelect.id) || '';
    const hiddenName = name || (nativeSelect && nativeSelect.name) || '';

    if (nativeSelect) {
        if (hiddenId) nativeSelect.removeAttribute('id');
        nativeSelect.removeAttribute('name');
        nativeSelect.removeAttribute('required');
        nativeSelect.setAttribute('aria-hidden', 'true');
        nativeSelect.tabIndex = -1;
        nativeSelect.style.display = 'none';
    }

    const root = document.createElement('div');
    root.className = 'searchable-select';
    if (disabled) root.classList.add('is-disabled');

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    if (hiddenId) hiddenInput.id = hiddenId;
    if (hiddenName) hiddenInput.name = hiddenName;

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'searchable-select-input';
    textInput.placeholder = placeholder;
    textInput.autocomplete = 'off';
    textInput.setAttribute('role', 'combobox');
    textInput.setAttribute('aria-autocomplete', 'list');
    textInput.setAttribute('aria-expanded', 'false');
    if (ariaLabel) textInput.setAttribute('aria-label', ariaLabel);
    if (disabled) textInput.disabled = true;

    const dropdown = document.createElement('ul');
    dropdown.className = 'searchable-select-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.hidden = true;

    root.appendChild(hiddenInput);
    root.appendChild(textInput);
    root.appendChild(dropdown);

    if (nativeSelect) {
        nativeSelect.insertAdjacentElement('afterend', root);
    } else if (wrapper) {
        wrapper.appendChild(root);
    }

    let allOptions = normalizeSelectOptions(options);
    let selectedValue = value || '';
    let isOpen = false;
    let highlightedIndex = -1;
    let isDisabled = disabled;

    function normalizeSelectOptions(opts) {
        return (opts || []).map((item) => (
            typeof item === 'string' ? { value: item, label: item } : item
        ));
    }

    function syncNativeSelect(val) {
        if (!nativeSelect) return;
        nativeSelect.value = val || '';
    }

    function updatePlaceholderState() {
        root.classList.toggle('searchable-select--placeholder', !hiddenInput.value);
    }

    function setDisplayFromValue(val) {
        const match = allOptions.find((item) => item.value === val);
        textInput.value = match ? match.label : '';
        hiddenInput.value = val || '';
        syncNativeSelect(val);
        updatePlaceholderState();
    }

    function filterOptions(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return allOptions;
        return allOptions.filter((item) => item.label.toLowerCase().includes(q));
    }

    function renderDropdown(items) {
        dropdown.innerHTML = '';
        if (!items.length) {
            const empty = document.createElement('li');
            empty.className = 'searchable-select-option searchable-select-option--empty';
            empty.textContent = 'No matches found';
            empty.setAttribute('role', 'presentation');
            dropdown.appendChild(empty);
            return;
        }

        items.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'searchable-select-option';
            li.dataset.value = item.value;
            li.textContent = item.label;
            li.setAttribute('role', 'option');
            if (item.value === selectedValue) li.classList.add('is-selected');
            if (index === highlightedIndex) li.classList.add('is-highlighted');

            const pick = (event) => {
                event.preventDefault();
                selectOption(item.value);
            };
            li.addEventListener('mousedown', pick);
            li.addEventListener('touchend', pick);
            dropdown.appendChild(li);
        });
    }

    function openDropdown() {
        if (isDisabled) return;
        isOpen = true;
        dropdown.hidden = false;
        textInput.setAttribute('aria-expanded', 'true');
        root.classList.add('is-open');
        highlightedIndex = -1;
        renderDropdown(filterOptions(textInput.value));
    }

    function closeDropdown() {
        isOpen = false;
        dropdown.hidden = true;
        textInput.setAttribute('aria-expanded', 'false');
        root.classList.remove('is-open');
        setDisplayFromValue(selectedValue);
    }

    function selectOption(val) {
        selectedValue = val || '';
        setDisplayFromValue(selectedValue);
        closeDropdown();
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof onChange === 'function') onChange(selectedValue);
    }

    textInput.addEventListener('focus', () => {
        if (isDisabled) return;
        openDropdown();
    });

    textInput.addEventListener('input', () => {
        if (!isOpen) openDropdown();
        highlightedIndex = -1;
        renderDropdown(filterOptions(textInput.value));
    });

    textInput.addEventListener('keydown', (event) => {
        const items = filterOptions(textInput.value);
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!isOpen) openDropdown();
            highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
            renderDropdown(items);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            renderDropdown(items);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                selectOption(items[highlightedIndex].value);
            }
        } else if (event.key === 'Escape') {
            closeDropdown();
        }
    });

    document.addEventListener('click', (event) => {
        if (!root.contains(event.target)) closeDropdown();
    });

    const api = {
        getValue() {
            return hiddenInput.value;
        },
        setValue(val) {
            selectedValue = val || '';
            setDisplayFromValue(selectedValue);
        },
        setOptions(opts, newValue) {
            allOptions = normalizeSelectOptions(opts);
            if (newValue !== undefined) selectedValue = newValue || '';
            setDisplayFromValue(selectedValue);
            if (isOpen) renderDropdown(filterOptions(textInput.value));
        },
        setDisabled(flag) {
            isDisabled = Boolean(flag);
            textInput.disabled = isDisabled;
            root.classList.toggle('is-disabled', isDisabled);
            if (isDisabled) closeDropdown();
        },
        destroy() {
            document.removeEventListener('click', closeDropdown);
            root.remove();
            if (nativeSelect) {
                nativeSelect.style.display = '';
                if (hiddenId) nativeSelect.id = hiddenId;
            }
        },
        hiddenInput,
        textInput,
        root
    };

    root._searchableSelectApi = api;
    if (nativeSelect) nativeSelect._searchableSelectApi = api;

    setDisplayFromValue(selectedValue);
    return api;
};

window.initSearchableSelectFromNative = function initSearchableSelectFromNative(selectEl, extraConfig) {
    if (!selectEl) return null;
    if (selectEl._searchableSelectApi) return selectEl._searchableSelectApi;

    const options = Array.from(selectEl.options || [])
        .filter((opt) => opt.value)
        .map((opt) => ({ value: opt.value, label: opt.textContent.trim() }));

    const placeholderOption = selectEl.options && selectEl.options[0];
    const placeholder = (placeholderOption && !placeholderOption.value)
        ? placeholderOption.textContent.trim()
        : 'Select...';

    return window.createSearchableSelect({
        mountEl: selectEl,
        id: selectEl.id,
        name: selectEl.name,
        placeholder,
        options,
        value: selectEl.value,
        disabled: selectEl.disabled,
        ariaLabel: selectEl.getAttribute('aria-label') || '',
        ...(extraConfig || {})
    });
};

window.getSearchableSelectInstance = function getSearchableSelectInstance(elOrId) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return null;
    if (el._searchableSelectApi) return el._searchableSelectApi;
    const root = el.closest && el.closest('.searchable-select');
    if (root && root._searchableSelectApi) return root._searchableSelectApi;
    const parent = el.parentElement;
    if (parent) {
        const hidden = parent.querySelector('.searchable-select');
        if (hidden && hidden._searchableSelectApi) return hidden._searchableSelectApi;
    }
    return null;
};

/**
 * District → upazila cascading searchable pair.
 */
window.initDistrictUpazilaPair = function initDistrictUpazilaPair(config) {
    const {
        districtSelectId,
        upazilaSelectId,
        districtPlaceholder = 'Select district',
        upazilaPlaceholder = 'Select upazila / thana',
        initialDistrict = '',
        initialUpazila = '',
        onDistrictChange,
        onUpazilaChange
    } = config || {};

    const districtEl = document.getElementById(districtSelectId);
    const upazilaEl = document.getElementById(upazilaSelectId);
    if (!districtEl || !upazilaEl) return null;

    function populateUpazila(district, selectedUpazila) {
        const upazilas = typeof window.getUpazilasForDistrict === 'function'
            ? window.getUpazilasForDistrict(district)
            : [];

        if (!district || upazilas.length === 0) {
            upazilaSelect.setOptions([], '');
            upazilaSelect.setDisabled(true);
            return;
        }

        upazilaSelect.setOptions(upazilas, selectedUpazila || '');
        upazilaSelect.setDisabled(false);
    }

    const upazilaSelect = window.initSearchableSelectFromNative(upazilaEl, {
        placeholder: upazilaPlaceholder,
        options: [],
        value: initialUpazila,
        disabled: !initialDistrict,
        onChange: (val) => {
            if (typeof onUpazilaChange === 'function') onUpazilaChange(val);
        }
    });

    const districtSelect = window.initSearchableSelectFromNative(districtEl, {
        placeholder: districtPlaceholder,
        options: window.BANGLADESH_DISTRICTS || [],
        value: initialDistrict,
        onChange: (val) => {
            populateUpazila(val, '');
            if (typeof onDistrictChange === 'function') onDistrictChange(val);
        }
    });

    populateUpazila(initialDistrict, initialUpazila);

    return { districtSelect, upazilaSelect, populateUpazila };
};
