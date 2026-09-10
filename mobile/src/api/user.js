import { endpoints } from './endpoints';
import api from '../services/api';

export const userAPI = {
  // GET /api/customer/referral — signed-in customer's referral code, link & stats.
  getReferral() {
    return api.get(endpoints.referral);
  },
};

export default userAPI;
