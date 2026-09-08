export default function LogoutModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-80 border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </div>
          <div>
            <p
              id="logout-modal-title"
              className="font-semibold text-slate-800 dark:text-white text-sm"
            >
              Sign out of EonlineBazar?
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              You will need to log in again to access the admin panel.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
