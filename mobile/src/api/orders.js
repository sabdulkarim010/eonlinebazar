import api from '../services/api';
import { endpoints } from './endpoints';

export const ordersAPI = {
  requestReturn: (orderId, reason) =>
    api.post(endpoints.orderReturn(orderId), { reason }),
  requestReturnItems: (orderId, payload) =>
    api.post(endpoints.orderReturnItems(orderId), payload),
  downloadInvoice: (orderId) =>
    api.get(endpoints.orderInvoice(orderId), { responseType: 'arraybuffer' }),
};
