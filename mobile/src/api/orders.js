import api from '../services/api';
import { endpoints } from './endpoints';

export const ordersAPI = {
  requestReturn: (orderId, reason) =>
    api.post(endpoints.orderReturn(orderId), { reason }),
};
