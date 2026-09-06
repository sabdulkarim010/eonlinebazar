const COURIER_TRACKING_BASE = {
  steadfast: 'https://steadfast.com.bd/track?invoice=',
  pathao: 'https://pathao.com/tracking?trackingId=',
  redx: 'https://redx.com.bd/track-parcel/?trackingId=',
};

function normalizeCourierSlug(provider) {
  return String(provider || '').trim().toLowerCase();
}

export function resolveOrderTracking(order = {}) {
  const trackingNumber = String(
    order.trackingNumber
    || order.courierTrackingId
    || order.trackingId
    || ''
  ).trim();
  const courierName = String(
    order.courierName
    || order.courierProvider
    || order.courier
    || ''
  ).trim();
  const trackingUrl = String(order.trackingUrl || '').trim()
    || buildCourierTrackingUrl(courierName, trackingNumber);

  return { trackingNumber, courierName, trackingUrl };
}

export function buildCourierTrackingUrl(courierName, trackingNumber) {
  const code = String(trackingNumber || '').trim();
  if (!code) return '';

  const slug = normalizeCourierSlug(courierName);
  const base = COURIER_TRACKING_BASE[slug];
  if (base) return `${base}${encodeURIComponent(code)}`;

  if (slug.includes('pathao')) {
    return `${COURIER_TRACKING_BASE.pathao}${encodeURIComponent(code)}`;
  }
  if (slug.includes('redx')) {
    return `${COURIER_TRACKING_BASE.redx}${encodeURIComponent(code)}`;
  }
  if (slug.includes('steadfast')) {
    return `${COURIER_TRACKING_BASE.steadfast}${encodeURIComponent(code)}`;
  }

  return `https://eonlinebazar.com/track?id=${encodeURIComponent(code)}`;
}
