import { useState } from 'react';
import { formatTime } from '../utils/helpers';

/**
 * Admin chat bubble alignment (agent perspective):
 * - AGENT (current staff) → RIGHT
 * - USER / BOT / others → LEFT
 */
export default function MessageBubble({ message, currentAgentId }) {
  const [expanded, setExpanded] = useState(null);
  const type = String(message?.sender_type || 'USER').toUpperCase();
  const time = formatTime(message?.createdAt || message?.timestamp || message?.created_at);
  const attachments = message?.attachments || [];
  const quickReplies = message?.quick_replies || message?.quickReplies || [];

  if (type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-3">
        <p className="text-xs italic text-slate-400 text-center max-w-[80%]">
          {message.message}
        </p>
      </div>
    );
  }

  const isUser = type === 'USER' || type === 'CUSTOMER' || type === 'GUEST';
  const isBot = type === 'BOT' || type === 'AI';
  const isAgent = type === 'AGENT' || type === 'HUMAN' || type === 'SUPPORT';

  // Agent/staff messages on the right; customer + bot on the left
  const alignRight =
    isAgent &&
    (!currentAgentId ||
      String(message?.sender_id || '') === String(currentAgentId) ||
      !message?.sender_id);

  return (
    <div
      className={`flex mb-3 ${alignRight ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[75%] flex flex-col ${
          alignRight ? 'items-end' : 'items-start'
        }`}
      >
        {(isBot || isAgent) && (
          <span className="text-[10px] font-medium text-slate-500 mb-1 px-1">
            {isBot ? '🤖 AI' : message.sender_name || 'Agent'}
          </span>
        )}

        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
            alignRight
              ? 'bg-blue-600 text-white rounded-br-md'
              : isBot
                ? 'bg-slate-200 text-slate-800 rounded-bl-md'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
          }`}
        >
          {message.message && (
            <p className="whitespace-pre-wrap break-words">{message.message}</p>
          )}

          {attachments.length > 0 && (
            <div className={`${message.message ? 'mt-2' : ''} flex flex-wrap gap-2`}>
              {attachments.map((att, i) => {
                const url = typeof att === 'string' ? att : att.url || att.data;
                if (!url) return null;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setExpanded(url)}
                    className="block overflow-hidden rounded-lg border border-black/10"
                  >
                    <img
                      src={url}
                      alt="attachment"
                      className="h-24 w-24 object-cover hover:opacity-90 transition"
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
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200"
              >
                {typeof qr === 'string' ? qr : qr.label || qr.text}
              </span>
            ))}
          </div>
        )}

        {time && (
          <span className="text-[10px] text-slate-400 mt-1 px-1">{time}</span>
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
            className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
