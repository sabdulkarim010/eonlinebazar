/**
 * Bangladesh districts (BBS codes as IDs) and cascading upazila/thana lists.
 * Names match backend/src/utils/bangladeshDistricts.js so shipping and register stay in sync.
 */

export const DISTRICT_ALIASES = {
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
  khagrachhari: 'khagrachhari',
  jhalokathi: 'jhalokati',
  netrakona: 'netrokona',
};

export const BD_DISTRICTS = [
  { id: 4, name: 'Barguna', aliases: [], upazilas: ['Amtali', 'Bamna', 'Barguna Sadar', 'Betagi', 'Patharghata', 'Taltali'] },
  { id: 6, name: 'Barishal', aliases: ['Barisal'], upazilas: ['Agailjhara', 'Babuganj', 'Bakerganj', 'Banaripara', 'Barishal Sadar', 'Gournadi', 'Hizla', 'Mehendiganj', 'Muladi', 'Wazirpur'] },
  { id: 9, name: 'Bhola', aliases: [], upazilas: ['Bhola Sadar', 'Burhanuddin', 'Char Fasson', 'Daulatkhan', 'Lalmohan', 'Manpura', 'Tazumuddin'] },
  { id: 42, name: 'Jhalokati', aliases: ['Jhalokathi'], upazilas: ['Jhalokati Sadar', 'Kathalia', 'Nalchity', 'Rajapur'] },
  { id: 78, name: 'Patuakhali', aliases: [], upazilas: ['Bauphal', 'Dashmina', 'Dumki', 'Galachipa', 'Kalapara', 'Mirzaganj', 'Patuakhali Sadar', 'Rangabali'] },
  { id: 79, name: 'Pirojpur', aliases: [], upazilas: ['Bhandaria', 'Kawkhali', 'Mathbaria', 'Nazirpur', 'Nesarabad', 'Pirojpur Sadar', 'Zianagar'] },
  { id: 3, name: 'Bandarban', aliases: [], upazilas: ['Ali Kadam', 'Bandarban Sadar', 'Lama', 'Naikhongchhari', 'Rowangchhari', 'Ruma', 'Thanchi'] },
  { id: 12, name: 'Brahmanbaria', aliases: [], upazilas: ['Akhaura', 'Ashuganj', 'Bancharampur', 'Brahmanbaria Sadar', 'Kasba', 'Nabinagar', 'Nasirnagar', 'Sarail'] },
  { id: 13, name: 'Chandpur', aliases: [], upazilas: ['Chandpur Sadar', 'Faridganj', 'Haimchar', 'Hajiganj', 'Kachua', 'Matlab Dakshin', 'Matlab Uttar', 'Shahrasti'] },
  { id: 15, name: 'Chattogram', aliases: ['Chittagong', 'CTG'], upazilas: ['Anwara', 'Banshkhali', 'Boalkhali', 'Chandanaish', 'Fatikchhari', 'Hathazari', 'Karnaphuli', 'Lohagara', 'Mirsharai', 'Patiya', 'Rangunia', 'Raozan', 'Sandwip', 'Satkania', 'Sitakunda'] },
  { id: 19, name: 'Cumilla', aliases: ['Comilla'], upazilas: ['Barura', 'Brahmanpara', 'Burichang', 'Chandina', 'Chauddagram', 'Cumilla Sadar Dakshin', 'Cumilla Sadar Uttar', 'Daudkandi', 'Debidwar', 'Homna', 'Laksam', 'Monohorgonj', 'Meghna', 'Muradnagar', 'Nangalkot', 'Titas'] },
  { id: 22, name: "Cox's Bazar", aliases: ['Coxs Bazar', 'Cox Bazar'], upazilas: ['Chakaria', "Cox's Bazar Sadar", 'Eidgaon', 'Kutubdia', 'Maheshkhali', 'Pekua', 'Ramu', 'Teknaf', 'Ukhiya'] },
  { id: 30, name: 'Feni', aliases: [], upazilas: ['Chhagalnaiya', 'Daganbhuiyan', 'Feni Sadar', 'Fulgazi', 'Parshuram', 'Sonagazi'] },
  { id: 46, name: 'Khagrachhari', aliases: ['Khagrachari'], upazilas: ['Dighinala', 'Khagrachhari Sadar', 'Lakshmichhari', 'Mahalchhari', 'Manikchhari', 'Matiranga', 'Panchhari', 'Ramgarh'] },
  { id: 51, name: 'Lakshmipur', aliases: [], upazilas: ['Kamalnagar', 'Lakshmipur Sadar', 'Raipur', 'Ramganj', 'Ramgati'] },
  { id: 75, name: 'Noakhali', aliases: [], upazilas: ['Begumganj', 'Chatkhil', 'Companiganj', 'Hatiya', 'Kabirhat', 'Noakhali Sadar', 'Senbagh', 'Sonaimuri', 'Subarnachar'] },
  { id: 84, name: 'Rangamati', aliases: [], upazilas: ['Baghaichhari', 'Barkal', 'Belaichhari', 'Juraichhari', 'Kaptai', 'Kawkhali', 'Langadu', 'Naniarchar', 'Panchhari', 'Rangamati Sadar', 'Rajasthali'] },
  { id: 26, name: 'Dhaka', aliases: [], upazilas: ['Dhamrai', 'Dohar', 'Keraniganj', 'Nawabganj', 'Savar', 'Dhaka City'] },
  { id: 29, name: 'Faridpur', aliases: [], upazilas: ['Alfadanga', 'Bhanga', 'Boalmari', 'Charbhadrasan', 'Faridpur Sadar', 'Madukhali', 'Nagarkanda', 'Sadarpur', 'Saltha'] },
  { id: 33, name: 'Gazipur', aliases: [], upazilas: ['Gazipur Sadar', 'Kaliakair', 'Kaliganj', 'Kapasia', 'Sreepur'] },
  { id: 35, name: 'Gopalganj', aliases: [], upazilas: ['Gopalganj Sadar', 'Kashiani', 'Kotalipara', 'Muksudpur', 'Tungipara'] },
  { id: 48, name: 'Kishoreganj', aliases: [], upazilas: ['Austagram', 'Bajitpur', 'Bhairab', 'Hossainpur', 'Itna', 'Karimganj', 'Katiadi', 'Kishoreganj Sadar', 'Kuliarchar', 'Mithamain', 'Nikli', 'Pakundia', 'Tarail'] },
  { id: 54, name: 'Madaripur', aliases: [], upazilas: ['Kalkini', 'Madaripur Sadar', 'Rajoir', 'Shibchar'] },
  { id: 56, name: 'Manikganj', aliases: [], upazilas: ['Daulatpur', 'Ghior', 'Harirampur', 'Manikganj Sadar', 'Saturia', 'Shivalaya', 'Singair'] },
  { id: 59, name: 'Munshiganj', aliases: [], upazilas: ['Gazaria', 'Lohajang', 'Munshiganj Sadar', 'Sirajdikhan', 'Sreenagar', 'Tongibari'] },
  { id: 67, name: 'Narayanganj', aliases: [], upazilas: ['Araihazar', 'Bandar', 'Narayanganj Sadar', 'Rupganj', 'Sonargaon'] },
  { id: 68, name: 'Narsingdi', aliases: [], upazilas: ['Belabo', 'Monohardi', 'Narsingdi Sadar', 'Palash', 'Raipura', 'Shibpur'] },
  { id: 82, name: 'Rajbari', aliases: [], upazilas: ['Baliakandi', 'Goalanda', 'Kalukhali', 'Pangsha', 'Rajbari Sadar'] },
  { id: 86, name: 'Shariatpur', aliases: [], upazilas: ['Bhedarganj', 'Damudya', 'Gosairhat', 'Naria', 'Shariatpur Sadar', 'Zanjira'] },
  { id: 93, name: 'Tangail', aliases: [], upazilas: ['Basail', 'Bhuapur', 'Delduar', 'Dhanbari', 'Ghatail', 'Gopalpur', 'Kalihati', 'Madhupur', 'Mirzapur', 'Nagarpur', 'Sakhipur', 'Tangail Sadar'] },
  { id: 1, name: 'Bagerhat', aliases: [], upazilas: ['Bagerhat Sadar', 'Chitalmari', 'Fakirhat', 'Kachua', 'Mollahat', 'Mongla', 'Morrelganj', 'Rampal', 'Sarankhola'] },
  { id: 18, name: 'Chuadanga', aliases: [], upazilas: ['Alamdanga', 'Chuadanga Sadar', 'Damurhuda', 'Jibannagar'] },
  { id: 41, name: 'Jashore', aliases: ['Jessore'], upazilas: ['Abhaynagar', 'Bagherpara', 'Chaugachha', 'Jhikargachha', 'Jashore Sadar', 'Keshabpur', 'Manirampur', 'Sharsha'] },
  { id: 44, name: 'Jhenaidah', aliases: [], upazilas: ['Harinakunda', 'Jhenaidah Sadar', 'Kaliganj', 'Kotchandpur', 'Maheshpur', 'Shailkupa'] },
  { id: 47, name: 'Khulna', aliases: [], upazilas: ['Batiaghata', 'Dacope', 'Dighalia', 'Dumuria', 'Koyra', 'Paikgachha', 'Phultala', 'Rupsa', 'Terokhada', 'Khulna City'] },
  { id: 50, name: 'Kushtia', aliases: [], upazilas: ['Bheramara', 'Daulatpur', 'Khoksa', 'Kumarkhali', 'Kushtia Sadar', 'Mirpur'] },
  { id: 55, name: 'Magura', aliases: [], upazilas: ['Magura Sadar', 'Mohammadpur', 'Shalikha', 'Sreepur'] },
  { id: 57, name: 'Meherpur', aliases: [], upazilas: ['Gangni', 'Meherpur Sadar', 'Mujibnagar'] },
  { id: 65, name: 'Narail', aliases: [], upazilas: ['Kalia', 'Lohagara', 'Narail Sadar'] },
  { id: 87, name: 'Satkhira', aliases: [], upazilas: ['Assasuni', 'Debhata', 'Kalaroa', 'Kaliganj', 'Satkhira Sadar', 'Shyamnagar', 'Tala'] },
  { id: 10, name: 'Bogura', aliases: ['Bogra'], upazilas: ['Adamdighi', 'Bogura Sadar', 'Dhunat', 'Dhupchanchia', 'Gabtali', 'Kahaloo', 'Nandigram', 'Sariakandi', 'Shajahanpur', 'Sherpur', 'Sonatala'] },
  { id: 38, name: 'Joypurhat', aliases: ['Jaipurhat'], upazilas: ['Akkelpur', 'Joypurhat Sadar', 'Kalai', 'Khetlal', 'Panchbibi'] },
  { id: 64, name: 'Naogaon', aliases: [], upazilas: ['Atrai', 'Badalgachhi', 'Dhamoirhat', 'Manda', 'Mohadevpur', 'Naogaon Sadar', 'Niamatpur', 'Patnitala', 'Porsha', 'Raninagar', 'Sapahar'] },
  { id: 69, name: 'Natore', aliases: [], upazilas: ['Bagatipara', 'Baraigram', 'Gurudaspur', 'Lalpur', 'Natore Sadar', 'Singra'] },
  { id: 70, name: 'Chapainawabganj', aliases: ['Chapai Nawabganj', 'Nawabganj'], upazilas: ['Bholahat', 'Chapainawabganj Sadar', 'Gomastapur', 'Nachole', 'Shibganj'] },
  { id: 76, name: 'Pabna', aliases: [], upazilas: ['Atgharia', 'Bera', 'Bhangura', 'Chatmohar', 'Faridpur', 'Ishwardi', 'Pabna Sadar', 'Santhia', 'Sujanagar'] },
  { id: 81, name: 'Rajshahi', aliases: [], upazilas: ['Bagha', 'Bagmara', 'Charghat', 'Durgapur', 'Godagari', 'Mohanpur', 'Paba', 'Puthia', 'Tanore', 'Rajshahi City'] },
  { id: 88, name: 'Sirajganj', aliases: [], upazilas: ['Belkuchi', 'Chauhali', 'Kamarkhanda', 'Kazipur', 'Raiganj', 'Shahjadpur', 'Sirajganj Sadar', 'Tarash', 'Ullahpara'] },
  { id: 27, name: 'Dinajpur', aliases: [], upazilas: ['Birampur', 'Birganj', 'Bochaganj', 'Chirirbandar', 'Dinajpur Sadar', 'Fulbari', 'Ghoraghat', 'Hakimpur', 'Kaharole', 'Khansama', 'Nawabganj', 'Parbatipur'] },
  { id: 32, name: 'Gaibandha', aliases: [], upazilas: ['Fulchhari', 'Gaibandha Sadar', 'Gobindaganj', 'Palashbari', 'Sadullapur', 'Sundarganj'] },
  { id: 49, name: 'Kurigram', aliases: [], upazilas: ['Bhurungamari', 'Chilmari', 'Fulbari', 'Kurigram Sadar', 'Nageshwari', 'Phulbari', 'Rajarhat', 'Raumari', 'Ulipur'] },
  { id: 52, name: 'Lalmonirhat', aliases: [], upazilas: ['Aditmari', 'Hatibandha', 'Kaliganj', 'Lalmonirhat Sadar', 'Patgram'] },
  { id: 73, name: 'Nilphamari', aliases: [], upazilas: ['Dimla', 'Domar', 'Jaldhaka', 'Kishoreganj', 'Nilphamari Sadar', 'Saidpur'] },
  { id: 77, name: 'Panchagarh', aliases: [], upazilas: ['Atwari', 'Boda', 'Debiganj', 'Panchagarh Sadar', 'Tetulia'] },
  { id: 85, name: 'Rangpur', aliases: [], upazilas: ['Badarganj', 'Gangachhara', 'Kaunia', 'Mithapukur', 'Pirgachha', 'Pirganj', 'Rangpur Sadar', 'Taraganj'] },
  { id: 94, name: 'Thakurgaon', aliases: [], upazilas: ['Baliadangi', 'Haripur', 'Pirganj', 'Ranisankail', 'Thakurgaon Sadar'] },
  { id: 36, name: 'Habiganj', aliases: [], upazilas: ['Ajmiriganj', 'Bahubal', 'Baniachang', 'Chunarughat', 'Habiganj Sadar', 'Lakhai', 'Madhabpur', 'Nabiganj', 'Shaistaganj'] },
  { id: 58, name: 'Moulvibazar', aliases: ['Srimangal'], upazilas: ['Barlekha', 'Juri', 'Kamalganj', 'Kulaura', 'Moulvibazar Sadar', 'Rajnagar', 'Sreemangal'] },
  { id: 90, name: 'Sunamganj', aliases: [], upazilas: ['Bishwamvarpur', 'Chhatak', 'Derai', 'Dharampasha', 'Dowarabazar', 'Jagannathpur', 'Jamalganj', 'Sulla', 'Sunamganj Sadar', 'Tahirpur'] },
  { id: 91, name: 'Sylhet', aliases: [], upazilas: ['Balaganj', 'Beanibazar', 'Bishwanath', 'Companiganj', 'Fenchuganj', 'Golapganj', 'Gowainghat', 'Jaintiapur', 'Kanaighat', 'Osmani Nagar', 'Sylhet Sadar', 'Zakiganj'] },
  { id: 39, name: 'Jamalpur', aliases: [], upazilas: ['Bakshiganj', 'Dewanganj', 'Islampur', 'Jamalpur Sadar', 'Madarganj', 'Melandaha', 'Sarishabari'] },
  { id: 61, name: 'Mymensingh', aliases: [], upazilas: ['Bhaluka', 'Dhobaura', 'Fulbaria', 'Gaffargaon', 'Gauripur', 'Haluaghat', 'Ishwarganj', 'Muktagachha', 'Mymensingh Sadar', 'Nandail', 'Phulpur', 'Trishal'] },
  { id: 72, name: 'Netrokona', aliases: ['Netrakona'], upazilas: ['Atpara', 'Barhatta', 'Durgapur', 'Kalmakanda', 'Kendua', 'Madan', 'Mohanganj', 'Netrokona Sadar', 'Purbadhala'] },
  { id: 89, name: 'Sherpur', aliases: [], upazilas: ['Jhenaigati', 'Nakla', 'Nalitabari', 'Sherpur Sadar', 'Sreebardi'] },
];

export const UPAZILAS_BY_DISTRICT_ID = BD_DISTRICTS.reduce((map, district) => {
  map[district.id] = district.upazilas;
  return map;
}, {});

export const DISTRICT_NAMES = BD_DISTRICTS.map((district) => district.name);

export function normalizeDistrictName(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!raw) return '';
  return DISTRICT_ALIASES[raw] || raw;
}

function namesMatch(left, right) {
  return normalizeDistrictName(left) === normalizeDistrictName(right);
}

export function getDistrictById(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  return BD_DISTRICTS.find((district) => district.id === numericId) || null;
}

export function getDistrictByName(value) {
  const normalized = normalizeDistrictName(value);
  if (!normalized) return null;
  return BD_DISTRICTS.find((district) => {
    if (namesMatch(district.name, normalized)) return true;
    return (district.aliases || []).some((alias) => namesMatch(alias, normalized));
  }) || null;
}

export function getUpazilasForDistrict(districtIdOrName) {
  if (districtIdOrName == null || districtIdOrName === '') return [];
  const byId = getDistrictById(districtIdOrName);
  if (byId) return byId.upazilas.slice();
  const byName = getDistrictByName(districtIdOrName);
  return byName ? byName.upazilas.slice() : [];
}

export function resolveDistrictName(value) {
  return getDistrictByName(value)?.name || String(value || '').trim();
}

export function resolveUpazilaName(districtIdOrName, value) {
  const needle = String(value || '').trim().toLowerCase();
  if (!needle) return '';
  const list = getUpazilasForDistrict(districtIdOrName);
  const match = list.find((item) => item.toLowerCase() === needle);
  return match || String(value || '').trim();
}

export function mergeDistrictNames(extra = []) {
  const seen = new Map();
  BD_DISTRICTS.forEach((district) => {
    seen.set(normalizeDistrictName(district.name), district.name);
  });
  extra.forEach((item) => {
    const name = String(item || '').trim();
    const key = normalizeDistrictName(name);
    if (name && key && !seen.has(key)) seen.set(key, name);
  });
  return Array.from(seen.values());
}
