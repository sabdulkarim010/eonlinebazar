const DEFAULT_WHATSAPP = '8801712345678';
const DEFAULT_SUPPORT_PHONE = '+8801712345678';
const DEFAULT_SUPPORT_EMAIL = 'support@eonlinebazar.com';

export function normalizeWhatsAppNumber(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return DEFAULT_WHATSAPP;
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
  if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;
  return digits;
}

export function buildWhatsAppUrl(phone, message) {
  const normalized = normalizeWhatsAppNumber(phone || DEFAULT_WHATSAPP);
  const text = encodeURIComponent(message || 'Hello EOnlineBazar, I need help with my order.');
  return `https://wa.me/${normalized}?text=${text}`;
}

export const SUPPORT = {
  email: DEFAULT_SUPPORT_EMAIL,
  phone: DEFAULT_SUPPORT_PHONE,
  whatsapp: DEFAULT_WHATSAPP,
};

export const SUPPORT_FAQ = [
  {
    id: 'track-order',
    question: 'How do I track my order?',
    answer: 'Open the Orders tab, select your order, and view live status updates including processing, shipped, and delivered states.',
  },
  {
    id: 'returns',
    question: 'How do returns and refunds work?',
    answer: 'Eligible returns can be requested from your order details while the return window is open. Approved refunds are credited to your EOnlineBazar wallet.',
  },
  {
    id: 'wallet',
    question: 'How do I use wallet balance at checkout?',
    answer: 'During checkout, enable “Apply wallet balance”. Your wallet covers part or all of the order total before you choose COD or online payment.',
  },
  {
    id: 'phone-change',
    question: 'How do I change my phone number?',
    answer: 'Go to Profile → Personal Info, enter your new mobile number, and verify the SMS code sent to that number.',
  },
  {
    id: 'points',
    question: 'How do loyalty points convert to wallet?',
    answer: 'Open Profile → Wallet, enter points in multiples shown on screen, and tap Convert to wallet. Rates are set by store reward settings.',
  },
];
