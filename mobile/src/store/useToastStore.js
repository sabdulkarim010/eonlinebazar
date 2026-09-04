import { create } from 'zustand';
import { haptic } from '../utils/haptics';

let hideTimer = null;

const VALID_TYPES = new Set(['success', 'error', 'warning', 'info', 'cart']);

function normalizeToastInput(messageOrOpts, type = 'success') {
  if (messageOrOpts && typeof messageOrOpts === 'object') {
    return {
      message: String(messageOrOpts.message || ''),
      title: messageOrOpts.title ? String(messageOrOpts.title) : '',
      type: VALID_TYPES.has(messageOrOpts.type) ? messageOrOpts.type : 'success',
    };
  }

  return {
    message: String(messageOrOpts || ''),
    title: '',
    type: VALID_TYPES.has(type) ? type : 'success',
  };
}

const useToastStore = create((set) => ({
  message: '',
  title: '',
  type: 'success',
  visible: false,

  showToast: (messageOrOpts, type = 'success') => {
    const { message, title, type: toastType } = normalizeToastInput(messageOrOpts, type);
    if (!message) return;

    if (toastType === 'error') haptic.error();
    else if (toastType === 'warning') haptic.warning();

    if (hideTimer) clearTimeout(hideTimer);
    set({
      message,
      title,
      type: toastType,
      visible: true,
    });
    hideTimer = setTimeout(() => {
      set({ visible: false });
    }, 2500);
  },

  hideToast: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ visible: false });
  },
}));

export default useToastStore;
