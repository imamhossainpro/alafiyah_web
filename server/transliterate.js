// backend/transliterate.js
// ==================================================
// ✅ Bengali → English Name Transliteration (CommonJS)
// ==================================================
// Same as frontend, but CommonJS export for Node.js
// ==================================================

const NAME_DICTIONARY = {
  // --- Doctor honorifics ---
  'ডাঃ': 'Dr.',
  'ডা.': 'Dr.',
  'ডাক্তার': 'Dr.',

  // --- Common honorifics ---
  'মোঃ': 'Md.',
  'মুহাম্মদ': 'Muhammad',
  'মুহাম্মাদ': 'Muhammad',
  'মোছাঃ': 'Mst.',
  'মিসেস': 'Mrs.',
  'মিস্টার': 'Mr.',
  'শ্রী': 'Sri',
  'মিস': 'Miss',

  // --- Common first names (male) ---
  'আব্দুল্লাহ': 'Abdullah',
  'আবদুল্লাহ': 'Abdullah',
  'আব্দুল': 'Abdul',
  'আবদুল': 'Abdul',
  'আহম্মদ': 'Ahmed',
  'আহমেদ': 'Ahmed',
  'আহমদ': 'Ahmed',
  'রায়হান': 'Raihan',
  'রাইহান': 'Raihan',
  'রহমান': 'Rahman',
  'রাহমান': 'Rahman',
  'হাসান': 'Hasan',
  'হোসেন': 'Hossain',
  'হুসেন': 'Hussain',
  'হোসাইন': 'Hossain',
  'কামরুল': 'Kamrul',
  'কামাল': 'Kamal',
  'মাহমুদ': 'Mahmud',
  'মাহমুদা': 'Mahmuda',
  'সাদিক': 'Sadik',
  'সাদিকুর': 'Sadikur',
  'সাব্বির': 'Sabbir',
  'সাকিব': 'Sakib',
  'সাইফুল': 'Saiful',
  'সাইফ': 'Saif',
  'মাসুদ': 'Masud',
  'মনির': 'Monir',
  'মুন্না': 'Munna',
  'রফিক': 'Rafiq',
  'রফিকুল': 'Rafiqul',
  'রাশেদ': 'Rashed',
  'রাকিব': 'Rakib',
  'রনি': 'Rony',
  'শাহিন': 'Shahin',
  'শাকিল': 'Shakil',
  'শাকিব': 'Shakib',
  'শামীম': 'Shamim',
  'শারমিন': 'Sharmin',
  'শারমিনা': 'Sharmina',
  'সাজিদ': 'Sajid',
  'সুমন': 'Sumon',
  'সোহেল': 'Sohel',
  'ইমরান': 'Imran',
  'মেহেদী': 'Mehedi',
  'মেহেদি': 'Mehedi',
  'তানভীর': 'Tanvir',
  'তানভির': 'Tanvir',
  'রুবেল': 'Rubel',
  'রাসেল': 'Rasel',
  'রাজু': 'Raju',
  'রাজীব': 'Rajib',
  'রাজিব': 'Rajib',
  'রিপন': 'Ripon',
  'রিয়াদ': 'Riyad',
  'রিয়াজ': 'Riaz',
  'রেজাউল': 'Rezaul',
  'রেজা': 'Reza',
  'মিজানুর': 'Mizanur',
  'মিজান': 'Mizan',
  'মিঠুন': 'Mithun',
  'মিলন': 'Milon',
  'মুকুল': 'Mukul',
  'মুসলিম': 'Muslim',
  'মুস্তাফা': 'Mustafa',
  'মুস্তাক': 'Mustaq',
  'মুবিন': 'Mubin',
  'মাহবুব': 'Mahbub',
  'মাহবুবা': 'Mahbuba',
  'মাহফুজ': 'Mahfuz',
  'মাহফুজা': 'Mahfuza',
  'মাসুদা': 'Masuda',
  'মনিরুল': 'Monirul',
  'মনিরা': 'Monira',
  'মনজুর': 'Manzur',
  'মনসুর': 'Mansur',
  'মুক্তার': 'Muktar',
  'মেহরাব': 'Mehrab',
  'মেহজাবিন': 'Mehjabin',
  'মেহনাজ': 'Mehnaz',
  'মেহেরুন': 'Meherun',

  // --- Common female names ---
  'সামসুন': 'Samsun',
  'শামসুন': 'Shamsun',
  'সামছুন': 'Samchun',
  'নাহার': 'Nahar',
  'নাহিদ': 'Nahid',
  'নাজমা': 'Najma',
  'নাজনিন': 'Naznin',
  'নুসরাত': 'Nusrat',
  'নূর': 'Nur',
  'নুর': 'Nur',
  'নূরজাহান': 'Nurjahan',
  'নূরুন': 'Nurun',
  'নাফিসা': 'Nafisa',
  'নাফিস': 'Nafis',
  'নাজমুল': 'Nazmul',
  'ফাতেমা': 'Fatema',
  'ফাতিমা': 'Fatima',
  'ফরিদা': 'Farida',
  'ফিরোজা': 'Firoza',
  'ফাহমিদা': 'Fahmida',
  'ফারজানা': 'Farzana',
  'ফারহানা': 'Farhana',
  'ফারুক': 'Faruk',
  'ফারুকী': 'Faruki',
  'রুবিনা': 'Rubina',
  'রুমা': 'Ruma',
  'রেখা': 'Rekha',
  'রোজিনা': 'Rozina',
  'রেহানা': 'Rehana',
  'রেহনুমা': 'Rehnuma',
  'লাভলী': 'Lovely',
  'লিপি': 'Lipi',
  'লাকী': 'Lucky',
  'লুৎফা': 'Lutfa',
  'লুৎফুননাহার': 'Lutfunnahar',
  'লাইজু': 'Laiju',
  'রোকসানা': 'Roksana',
  'রওশন': 'Roshon',
  'রিজিয়া': 'Rizia',
  'রিমা': 'Rima',
  'রীনা': 'Rina',
  'রুবি': 'Rubi',
  'সাবিনা': 'Sabina',
  'সালমা': 'Salma',
  'সুমাইয়া': 'Sumaiya',
  'সুলতানা': 'Sultana',
  'সোহানা': 'Sohana',
  'সোনিয়া': 'Sonia',
  'সাদিয়া': 'Sadia',
  'সাবরিনা': 'Sabrina',
  'সাইমা': 'Saima',
  'সানজিদা': 'Sanjida',
  'সানজু': 'Sanju',
  'সিতারা': 'Sitara',
  'সুরাইয়া': 'Suraiya',
  'সুফিয়া': 'Sufia',
  'সালেহা': 'Saleha',
  'সাহানা': 'Sahana',
  'শাহানা': 'Shahana',
  'শাহিদা': 'Shahida',
  'সাজেদা': 'Sajeda',
  'শিরিন': 'Shirin',
  'শিলা': 'Shila',
  'শেফালি': 'Shefali',
  'শেফালী': 'Shefali',
  'শাহনাজ': 'Shahnaz',
  'শাহনুর': 'Shahnur',
  'শিরিনা': 'Shirina',
  'সুপ্রিয়া': 'Supriya',
  'সুমি': 'Sumi',
  'সুমনা': 'Sumona',
  'সুইটি': 'Sweety',
  'সাথী': 'Sathi',

  // --- Surnames / family names ---
  'মিয়া': 'Mia',
  'মিঞা': 'Mia',
  'খাতুন': 'Khatun',
  'বেগম': 'Begum',
  'বিবি': 'Bibi',
  'আক্তার': 'Akter',
  'আখতার': 'Akhtar',
  'সরকার': 'Sarker',
  'শেখ': 'Sheikh',
  'মোল্লা': 'Molla',
  'হক': 'Haque',
  'ইসলাম': 'Islam',
  'আলী': 'Ali',
  'আলি': 'Ali',
  'উল্লাহ': 'Ullah',
  'উদ্দিন': 'Uddin',
  'উদ্দীন': 'Uddin',
  'হুদা': 'Huda',
  'চৌধুরী': 'Chowdhury',
  'চৌধুরি': 'Chowdhury',
  'তালুকদার': 'Talukder',
  'মজুমদার': 'Majumder',
  'বিশ্বাস': 'Biswas',
  'দাস': 'Das',
  'রায়': 'Roy',
  'সাহা': 'Saha',
  'সেন': 'Sen',
  'বর্মন': 'Barman',
  'বর্মণ': 'Barman',
  'ঘোষ': 'Ghosh',
  'পাল': 'Pal',
  'মন্ডল': 'Mondal',
  'মণ্ডল': 'Mondal',
  'হালদার': 'Haldar',
  'নন্দী': 'Nandi',
  'কুন্ডু': 'Kundu',

  // --- Cities / Places ---
  'ঢাকা': 'Dhaka',
  'চট্টগ্রাম': 'Chattogram',
  'খুলনা': 'Khulna',
  'রাজশাহী': 'Rajshahi',
  'সিলেট': 'Sylhet',
  'বরিশাল': 'Barishal',
  'রংপুর': 'Rangpur',
  'ময়মনসিংহ': 'Mymensingh',
  'কুমিল্লা': 'Cumilla',
  'নারায়ণগঞ্জ': 'Narayanganj',
  'গাজীপুর': 'Gazipur',
  'বগুড়া': 'Bogura',
  'যশোর': 'Jashore',
  'দিনাজপুর': 'Dinajpur',
  'ফেনী': 'Feni',
  'নোয়াখালী': 'Noakhali',
  'কক্সবাজার': 'Coxs Bazar',

  // --- Common words ---
  'হাসপাতাল': 'Hospital',
  'ডাক্তার': 'Doctor',
  'রোগী': 'Patient',
  'সিরিয়াল': 'Serial',
  'বুকিং': 'Booking',
  'মেডিসিন': 'Medicine',
  'সার্জারি': 'Surgery',
  'কার্ডিওলজি': 'Cardiology',
  'অর্থোপেডিক': 'Orthopedic',
  'গাইনী': 'Gynecology',
  'শিশু': 'Child',
};

// ==================================================
// ✅ Fallback: Advanced phonetic transliteration
// ==================================================
function fallbackTransliterate(word) {
  if (!word) return '';

  const DIGRAPHS = [
    ['ক্ষ', 'kkh'],
    ['জ্ঞ', 'gg'],
    ['ঞ্চ', 'nch'],
    ['ঞ্জ', 'nj'],
    ['ন্ত', 'nt'],
    ['ন্দ', 'nd'],
    ['ম্ব', 'mb'],
    ['ম্প', 'mp'],
    ['ষ্ট', 'sht'],
    ['ষ্ঠ', 'shth'],
    ['ত্র', 'tr'],
    ['ত্ত', 'tt'],
    ['দ্ধ', 'ddh'],
    ['স্ন', 'sn'],
    ['স্থ', 'sth'],
    ['স্ক', 'sk'],
    ['স্প', 'sp'],
    ['স্ব', 'sw'],
    ['হ্ম', 'hm'],
    ['হ্ন', 'hn'],
    ['হ্ল', 'hl'],
  ];

  const CONSONANTS = {
    'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
    'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
    'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
    'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
    'প': 'p', 'ফ': 'ph', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
    'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
    'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't', 'ং': 'ng', 'ঃ': 'h', 'ঁ': '',
  };

  const VOWELS = {
    'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u',
    'ঋ': 'ri', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
  };

  const VOWEL_SIGNS = {
    'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri',
    'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou',
  };

  let result = '';
  let i = 0;
  while (i < word.length) {
    const two = word.slice(i, i + 2);
    const digraph = DIGRAPHS.find(([bn]) => bn === two);
    if (digraph) {
      result += digraph[1];
      i += 2;
      continue;
    }

    const ch = word[i];
    if (CONSONANTS[ch]) {
      const next = word[i + 1];
      if (VOWEL_SIGNS[next]) {
        result += CONSONANTS[ch] + VOWEL_SIGNS[next];
        i += 2;
        continue;
      } else if (next === '্') {
        result += CONSONANTS[ch];
        i += 2;
        continue;
      } else {
        if (i === word.length - 1) {
          result += CONSONANTS[ch];
        } else {
          result += CONSONANTS[ch] + 'a';
        }
        i += 1;
        continue;
      }
    } else if (VOWELS[ch]) {
      result += VOWELS[ch];
      i += 1;
    } else if (VOWEL_SIGNS[ch]) {
      result += VOWEL_SIGNS[ch];
      i += 1;
    } else if (ch === '্') {
      i += 1;
    } else if (ch === '।') {
      result += '.';
      i += 1;
    } else if (/\s/.test(ch)) {
      result += ' ';
      i += 1;
    } else if (/[a-zA-Z0-9.,\-()]/.test(ch)) {
      result += ch;
      i += 1;
    } else {
      i += 1;
    }
  }

  if (result.length > 0) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

// ==================================================
// ✅ Main transliterate function
// ==================================================
function transliterateToEnglish(text) {
  if (!text) return '';
  if (typeof text !== 'string') return String(text);

  const words = text.split(/\s+/);
  const result = words.map((word) => {
    if (/^[a-zA-Z0-9.,\-()]+$/.test(word)) return word;
    if (NAME_DICTIONARY[word]) return NAME_DICTIONARY[word];
    const cleaned = word.trim();
    if (NAME_DICTIONARY[cleaned]) return NAME_DICTIONARY[cleaned];
    return fallbackTransliterate(word);
  });

  return result.join(' ').trim();
}

module.exports = { transliterateToEnglish };