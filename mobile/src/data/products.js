export const PRODUCTS = [
  {
    id: 'p1',
    name: 'Wireless Bluetooth Earbuds',
    category: 'Electronics',
    price: 2490,
    image: 'https://picsum.photos/seed/earbuds/400/400',
    description:
      'Compact true-wireless earbuds with Bluetooth 5.3, up to 24 hours of total playback with the charging case, and IPX4 splash resistance. Includes silicone ear tips in three sizes for a secure fit during commutes and workouts.',
  },
  {
    id: 'p2',
    name: 'Cotton Panjabi',
    category: 'Fashion',
    price: 1850,
    image: 'https://picsum.photos/seed/panjabi/400/400',
    description:
      'Breathable cotton panjabi with a regular fit, mandarin collar, and full-button front. Soft hand-feel fabric suited to Eid, Friday prayers, and everyday wear. Machine washable; available in a classic cut.',
  },
  {
    id: 'p3',
    name: 'Smart Watch Series 5',
    category: 'Electronics',
    price: 4290,
    image: 'https://picsum.photos/seed/smartwatch/400/400',
    description:
      '1.8-inch color display smartwatch with heart-rate tracking, step counting, sleep monitoring, and message notifications. Water-resistant design with a magnetic charging cable and a battery that lasts up to 5 days on a typical charge.',
  },
  {
    id: 'p4',
    name: 'Leather Wallet',
    category: 'Accessories',
    price: 890,
    image: 'https://picsum.photos/seed/wallet/400/400',
    description:
      'Slim bifold wallet in genuine leather with six card slots, a cash compartment, and a clear ID window. Compact enough for a front pocket while keeping cards and notes organized.',
  },
  {
    id: 'p5',
    name: 'Running Shoes',
    category: 'Fashion',
    price: 3190,
    image: 'https://picsum.photos/seed/shoes/400/400',
    description:
      'Lightweight running shoes with a cushioned midsole, breathable mesh upper, and rubber outsole for grip on pavement. Designed for daily jogs and all-day walking comfort.',
  },
  {
    id: 'p6',
    name: 'Ceramic Coffee Mug',
    category: 'Home',
    price: 450,
    image: 'https://picsum.photos/seed/mug/400/400',
    description:
      '350 ml glazed ceramic mug with a comfortable handle and a wide base that sits stably on a desk. Microwave and dishwasher safe. A simple everyday mug for tea, coffee, or milk.',
  },
  {
    id: 'p7',
    name: 'USB-C Fast Charger',
    category: 'Electronics',
    price: 790,
    image: 'https://picsum.photos/seed/charger/400/400',
    description:
      '20W USB-C wall charger with fast-charge support for phones and earbuds. Compact foldable-plug design for travel. Includes over-voltage and short-circuit protection.',
  },
  {
    id: 'p8',
    name: 'Canvas Tote Bag',
    category: 'Accessories',
    price: 650,
    image: 'https://picsum.photos/seed/tote/400/400',
    description:
      'Heavy-duty canvas tote with reinforced handles and an inner zip pocket. Spacious enough for a laptop, books, and daily errands. Durable stitching for regular market and campus use.',
  },
];

export function getProductById(id) {
  return PRODUCTS.find((product) => product.id === id) || null;
}
