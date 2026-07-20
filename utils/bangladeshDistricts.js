/********************************************************************
 * Project: EonlineBazar
 * File: bangladeshDistricts.js
 * Location: utils/bangladeshDistricts.js
 * Description: Bangladesh district list and normalization helpers.
 ********************************************************************/

const BANGLADESH_DISTRICTS = [
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

const DISTRICT_ALIASES = {
    chittagong: 'chattogram',
    ctg: 'chattogram',
    comilla: 'cumilla',
    'coxs bazar': "cox's bazar",
    'cox bazar': "cox's bazar",
    barisal: 'barishal',
    jessore: 'jashore',
    bogra: 'bogura',
    'chapai nawabganj': 'chapainawabganj',
    nawabganj: 'chapainawabganj',
    moulvibazar: 'moulvibazar',
    netrokona: 'netrokona',
    srimangal: 'moulvibazar'
};

function normalizeDistrict(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!raw) return '';
    return DISTRICT_ALIASES[raw] || raw;
}

function districtsMatch(customerDistrict, shopHomeCity) {
    const left = normalizeDistrict(customerDistrict);
    const right = normalizeDistrict(shopHomeCity);
    return Boolean(left && right && left === right);
}

function isValidDistrict(value) {
    const normalized = normalizeDistrict(value);
    return BANGLADESH_DISTRICTS.some((district) => normalizeDistrict(district) === normalized);
}

function resolveDistrictLabel(value) {
    const normalized = normalizeDistrict(value);
    if (!normalized) return '';
    const match = BANGLADESH_DISTRICTS.find((district) => normalizeDistrict(district) === normalized);
    return match || String(value || '').trim();
}

module.exports = {
    BANGLADESH_DISTRICTS,
    normalizeDistrict,
    districtsMatch,
    isValidDistrict,
    resolveDistrictLabel
};
