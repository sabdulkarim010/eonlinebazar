/**
 * Bangladesh district list for checkout / shipping selectors.
 */
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
        nawabganj: 'chapainawabganj'
    };
    return aliases[raw] || raw;
};

window.districtsMatch = function districtsMatch(customerDistrict, shopHomeCity) {
    const left = window.normalizeDistrictName(customerDistrict);
    const right = window.normalizeDistrictName(shopHomeCity);
    return Boolean(left && right && left === right);
};
