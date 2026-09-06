import { useEffect, useState } from 'react';
import storeAPI, { extractSupportWhatsApp } from '../api/store';
import {
  buildGuestHelpWhatsAppUrl,
  buildProductOrderWhatsAppUrl,
  SUPPORT,
} from '../utils/supportLinks';

export default function useSupportWhatsApp() {
  const [phone, setPhone] = useState(SUPPORT.whatsapp);

  useEffect(() => {
    let active = true;
    storeAPI.getBranding()
      .then(({ data }) => {
        if (!active) return;
        const number = extractSupportWhatsApp(data);
        if (number) setPhone(number);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return {
    phone,
    guestHelpUrl: buildGuestHelpWhatsAppUrl(phone),
    productOrderUrl: (title, price) => buildProductOrderWhatsAppUrl(phone, title, price),
  };
}
