import { useState } from 'react';
import { avatarColor, formatTime, getInitials } from '../utils/helpers';

/**
 * Bubble alignment (per product spec):
 * - USER → RIGHT, purple gradient
 * - BOT/AI → LEFT, gray + 🤖
 * - AGENT → LEFT, white card + avatar
 * - SYSTEM → centered pill
 * - INTERNAL → LEFT, yellow + 🔒
 */
export default function MessageBubble({ message }) {
  const [expanded, setExpanded] = useState(null);
  const type = String(message?.sender_type || 'USER').toUpperCase();
  const time = formatTime(
    message?.createdAt || message?.timestamp || message?.created_at
  );
  const attachments = message?.attachments || [];
  const quickReplies = message?.quick_replies || message?.quickReplies || [];

  if (type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-3 animate-fadeIn">
        <p className="text-[11px] italic text-slate-500 dark:text-slate-400 text-center max-w-[85%] px-3 py-1 rounded-full bg-slate-100/90 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
          {message.message}
        </p>
      </div>
    );
  }

  if (type === 'INTERNAL') {
    return (
      <div className="flex justify-start my-3 animate-fadeIn">
        <div className="max-w-[85%] rounded-bubble border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-3.5 py-2.5 text-sm text-amber-900 dark:text-amber-100 shadow-soft">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
            🔒 Internal note · {message.sender_name || 'Agent'}
          </p>
          <p className="whitespace-pre-wrap break-words leading-bn">
            {message.message}
          </p>
          {time && (
            <span className="block text-[10px] text-amber-600/80 mt-1">
              {time}
            </span>
          )}
        </div>
      </div>
    );
  }

  const isUser =
    type === 'USER' || type === 'CUSTOMER' || type === 'GUEST';
  const isBot = type === 'BOT' || type === 'AI';
  const isAgent = type === 'AGENT' || type === 'HUMAN' || type === 'SUPPORT';

  // Spec: USER on the right; BOT/AGENT on the left
  const alignRight = isUser;

  return (
    <div
      className={`flex mb-3 animate-fadeIn ${
        alignRight ? 'justify-end' : 'justify-start'
      }`}
    >
      {isAgent && (
        <div
          className={`w-7 h-7 rounded-full ${avatarColor(
            message.sender_name || 'A'
          )} flex items-center justify-center text-white text-[10px] font-semibold mr-2 mt-5 shrink-0`}
        >
          {getInitials(message.sender_name || 'A')}
        </div>
      )}

      <div
        className={`max-w-[75%] flex flex-col ${
          alignRight ? 'items-end' : 'items-start'
        }`}
      >
        {(isBot || isAgent) && (
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1 px-1">
            {isBot ? '🤖 AI' : message.sender_name || 'Agent'}
          </span>
        )}

        <div
          className={`rounded-bubble px-3.5 py-2.5 text-sm leading-bn shadow-soft ${
            alignRight
              ? 'bg-gradient-to-br from-primary to-primary-600 text-white rounded-br-md'
              : isBot
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-md'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-md'
          }`}
        >
          {message.message && (
            <p className="whitespace-pre-wrap break-words">{message.message}</p>
          )}

          {attachments.length > 0 && (
            <div
              className={`${message.message ? 'mt-2' : ''} flex flex-wrap gap-2`}
            >
              {attachments.map((att, i) => {
                const url = typeof att === 'string' ? att : att.url || att.data;
                const thumb =
                  typeof att === 'object'
                    ? att.thumbnail_url || url
                    : url;
                if (!url) return null;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setExpanded(url)}
                    className="block overflow-hidden rounded-lg border border-black/10"
                  >
                    <img
                      src={thumb}
                      alt="attachment"
                      className="h-24 w-24 object-cover hover:opacity-90 transition duration-200"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5 px-1">
            {quickReplies.map((qr, i) => (
              <span
                key={i}
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
              >
                {typeof qr === 'string' ? qr : qr.label || qr.text}
              </span>
            ))}
          </div>
        )}

        {time && (
          <span className="text-xs text-slate-400 mt-1 px-1">{time}</span>
        )}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setExpanded(null)}
          role="presentation"
        >
          <img
            src={expanded}
            alt="expanded"
            className="max-h-[90vh] max-w-[90vw] rounded-card shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
