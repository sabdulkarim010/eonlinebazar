/**
 * Demo catalog used by `POST /api/products/seed-demo` and `npm run seed:products`.
 * Images are public HTTPS URLs so the mobile app can render them without local uploads.
 */
const DEMO_PRODUCT_ID_PREFIX = 'DEMO-';

const DEMO_PRODUCTS = [
  {
    productId: 'DEMO-P1',
    name: 'Wireless Bluetooth Earbuds',
    category: 'Electronics',
    price: 2490,
    buyingPrice: 1800,
    stock: 40,
    stockQuantity: 40,
    description:
      'Compact true-wireless earbuds with Bluetooth 5.3, up to 24 hours of total playback with the charging case, and IPX4 splash resistance.',
    image: 'https://picsum.photos/seed/eob-earbuds/600/600',
    images: ['https://picsum.photos/seed/eob-earbuds/600/600'],
    icon: '🎧',
    status: 'active',
  },
  {
    productId: 'DEMO-P2',
    name: 'Cotton Panjabi',
    category: 'Fashion',
    price: 1850,
    buyingPrice: 1100,
    stock: 25,
    stockQuantity: 25,
    description:
      'Breathable cotton panjabi with a regular fit, mandarin collar, and full-button front. Machine washable; suited to Eid and everyday wear.',
    image: 'https://picsum.photos/seed/eob-panjabi/600/600',
    images: ['https://picsum.photos/seed/eob-panjabi/600/600'],
    icon: '👔',
    status: 'active',
  },
  {
    productId: 'DEMO-P3',
    name: 'Smart Watch Series 5',
    category: 'Electronics',
    price: 4290,
    buyingPrice: 3100,
    stock: 18,
    stockQuantity: 18,
    description:
      '1.8-inch color display smartwatch with heart-rate tracking, step counting, sleep monitoring, and message notifications.',
    image: 'https://picsum.photos/seed/eob-smartwatch/600/600',
    images: ['https://picsum.photos/seed/eob-smartwatch/600/600'],
    icon: '⌚',
    status: 'active',
  },
  {
    productId: 'DEMO-P4',
    name: 'Leather Wallet',
    category: 'Accessories',
    price: 890,
    buyingPrice: 420,
    stock: 60,
    stockQuantity: 60,
    description:
      'Slim bifold wallet in genuine leather with six card slots, a cash compartment, and a clear ID window.',
    image: 'https://picsum.photos/seed/eob-wallet/600/600',
    images: ['https://picsum.photos/seed/eob-wallet/600/600'],
    icon: '👛',
    status: 'active',
  },
  {
    productId: 'DEMO-P5',
    name: 'Running Shoes',
    category: 'Fashion',
    price: 3190,
    buyingPrice: 2100,
    stock: 22,
    stockQuantity: 22,
    description:
      'Lightweight running shoes with a cushioned midsole, breathable mesh upper, and rubber outsole for grip on pavement.',
    image: 'https://picsum.photos/seed/eob-shoes/600/600',
    images: ['https://picsum.photos/seed/eob-shoes/600/600'],
    icon: '👟',
    status: 'active',
  },
  {
    productId: 'DEMO-P6',
    name: 'Ceramic Coffee Mug',
    category: 'Home',
    price: 450,
    buyingPrice: 180,
    stock: 80,
    stockQuantity: 80,
    description:
      '350 ml glazed ceramic mug with a comfortable handle. Microwave and dishwasher safe.',
    image: 'https://picsum.photos/seed/eob-mug/600/600',
    images: ['https://picsum.photos/seed/eob-mug/600/600'],
    icon: '☕',
    status: 'active',
  },
  {
    productId: 'DEMO-P7',
    name: 'USB-C Fast Charger',
    category: 'Electronics',
    price: 790,
    buyingPrice: 350,
    stock: 55,
    stockQuantity: 55,
    description:
      '20W USB-C wall charger with fast-charge support for phones and earbuds. Compact foldable-plug design for travel.',
    image: 'https://picsum.photos/seed/eob-charger/600/600',
    images: ['https://picsum.photos/seed/eob-charger/600/600'],
    icon: '🔌',
    status: 'active',
  },
  {
    productId: 'DEMO-P8',
    name: 'Canvas Tote Bag',
    category: 'Accessories',
    price: 650,
    buyingPrice: 220,
    stock: 45,
    stockQuantity: 45,
    description:
      'Heavy-duty canvas tote with reinforced handles and an inner zip pocket. Spacious enough for a laptop and daily errands.',
    image: 'https://picsum.photos/seed/eob-tote/600/600',
    images: ['https://picsum.photos/seed/eob-tote/600/600'],
    icon: '👜',
    status: 'active',
  },
];

module.exports = {
  DEMO_PRODUCT_ID_PREFIX,
  DEMO_PRODUCTS,
};
