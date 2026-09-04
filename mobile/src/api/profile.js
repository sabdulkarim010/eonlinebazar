import { endpoints } from './endpoints';
import api from '../services/api';

export const profileAPI = {
  uploadAvatar(formData) {
    return api.post(endpoints.updateAvatar, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  convertPoints(points) {
    return api.post(endpoints.convertPoints, { points });
  },

  requestContactOtp(type, value) {
    return api.post(endpoints.requestContactOtp, { type, value });
  },

  verifyContactOtp(otp) {
    return api.post(endpoints.verifyContactOtp, { otp });
  },

  getSessions() {
    return api.get(endpoints.sessions);
  },

  deleteSession(id) {
    return api.delete(endpoints.sessionById(id));
  },

  logoutOtherSessions() {
    return api.post(endpoints.logoutOtherSessions);
  },
};
