import { useEffect, useState } from 'react';
import { avatarColor, formatTime, getInitials, resolveAssetUrl } from '../utils/helpers';

const SYSTEM_MESSAGES_EN = {
  agent_joined: (name) => `${name || 'Agent'} has joined the conversation`,
  agent_assigned: (name) => `Chat assigned to ${name || 'Agent'}`,
  chat_started: () => 'Chat session started',
  handover: () => 'Chat transferred to human agent',
  resolved: () => 'Chat marked as resolved',
  waiting: () => 'Customer is waiting for an agent',
};

function getSystemMessage(msg) {
  const key = msg?.event || msg?.systemEvent;
  const agentName = msg?.agentName || msg?.sender_name || 'Agent';

  if (key && SYSTEM_MESSAGES_EN[key]) {
    return SYSTEM_MESSAGES_EN[key](agentName);
  }

  const content = msg?.message || msg?.content || '';
  const isBengali = /[\u0980-\u09FF]/.test(content);
  if (isBengali) {
    if (/যোগ দ/i.test(content)) {
      return SYSTEM_MESSAGES_EN.agent_joined(agentName);
    }
    if (/assigned to/i.test(content)) {
      return SYSTEM_MESSAGES_EN.agent_assigned(agentName);
    }
    if (/অপেক্ষা|waiting/i.test(content)) {
      return SYSTEM_MESSAGES_EN.waiting();
    }
    if (/resolved|সমাধান/i.test(content)) {
      return SYSTEM_MESSAGES_EN.resolved();
    }
    if (/transfer|handover|পাঠানো/i.test(content)) {
      return SYSTEM_MESSAGES_EN.handover();
    }
    return 'System notification';
  }

  return content || 'System notification';
}

function SystemMessageBubble({ message }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex justify-center my-3 animate-fadeIn transition-opacity duration-500">
      <span className="px-3 py-1 rounded-full text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 font-medium">
        {getSystemMessage(message)}
      </span>
    </div>
  );
}

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
  const [avatarFailed, setAvatarFailed] = useState(false);
  const type = String(message?.sender_type || 'USER').toUpperCase();
  const time = formatTime(
    message?.createdAt || message?.timestamp || message?.created_at
  );
  const attachments = message?.attachments || [];
  const quickReplies = message?.quick_replies || message?.quickReplies || [];

  if (type === 'SYSTEM') {
    return <SystemMessageBubble message={message} />;
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
  const agentAvatarRaw =
    message?.sender_avatar ||
    message?.senderAvatar ||
    message?.avatar ||
    null;
  const agentAvatarUrl =
    isAgent && !avatarFailed && agentAvatarRaw
      ? resolveAssetUrl(agentAvatarRaw)
      : null;

  // Spec: USER on the right; BOT/AGENT on the left
  const alignRight = isUser;

  return (
    <div
      className={`flex mb-3 animate-fadeIn ${
        alignRight ? 'justify-end' : 'justify-start'
      }`}
    >
      {isAgent && (
        agentAvatarUrl ? (
          <img
            src={agentAvatarUrl}
            alt={message.sender_name || 'Agent'}
            className="w-7 h-7 rounded-full object-cover mr-2 mt-5 shrink-0 border border-slate-200 dark:border-slate-700"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <div
            className={`w-7 h-7 rounded-full ${avatarColor(
              message.sender_name || 'A'
            )} flex items-center justify-center text-white text-[10px] font-semibold mr-2 mt-5 shrink-0`}
          >
            {getInitials(message.sender_name || 'A')}
          </div>
        )
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
          className={`inline-block max-w-xs lg:max-w-md px-3 py-2 rounded-lg text-sm leading-relaxed break-words shadow-soft ${
            alignRight
              ? 'bg-orange-500 text-white rounded-br-md'
              : isBot
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-md'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-md'
          }`}
          style={{ width: 'fit-content' }}
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
