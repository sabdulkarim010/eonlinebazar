export default function ResolveModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-80 border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolve-modal-title"
      >
        <h3
          id="resolve-modal-title"
          className="font-semibold text-slate-800 dark:text-white mb-2"
        >
          Resolve this chat?
        </h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 leading-bn">
          The customer will be notified that their issue has been resolved.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm transition-colors"
          >
            Yes, resolve
          </button>
        </div>
      </div>
    </div>
  );
}
