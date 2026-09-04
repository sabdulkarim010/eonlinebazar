import { endpoints } from './endpoints';
import api from '../services/api';

export const notesAPI = {
  list(params = {}) {
    return api.get(endpoints.notes, { params: { limit: 200, ...params } });
  },

  create(payload) {
    return api.post(endpoints.notes, payload);
  },

  update(id, payload) {
    return api.put(`${endpoints.notes}/${id}`, payload);
  },

  remove(id) {
    return api.delete(`${endpoints.notes}/${id}`);
  },
};

export function extractNotes(payload) {
  if (Array.isArray(payload?.notes)) return payload.notes;
  if (Array.isArray(payload?.data?.notes)) return payload.data.notes;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
