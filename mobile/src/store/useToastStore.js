import { create } from 'zustand';

let hideTimer = null;

const useToastStore = create((set) => ({
  message: '',
  type: 'success',
  visible: false,

  showToast: (message, type = 'success') => {
    if (hideTimer) clearTimeout(hideTimer);
    set({
      message: String(message || ''),
      type: type === 'error' ? 'error' : 'success',
      visible: true,
    });
    hideTimer = setTimeout(() => {
      set({ visible: false });
    }, 2400);
  },

  hideToast: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ visible: false });
  },
}));

export default useToastStore;
