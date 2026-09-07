import { useState } from 'react';
import { avatarColor, getInitials } from '../utils/helpers';

const SIZE_CLASS = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-20 h-20 text-2xl',
};

/**
 * Renders agent profile photo or initials fallback.
 */
export default function AgentAvatar({
  name = 'Agent',
  avatar = null,
  size = 'md',
  className = '',
}) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.md;
  const showImage = Boolean(avatar) && !failed;

  return (
    <div
      className={`rounded-full shrink-0 overflow-hidden flex items-center justify-center font-semibold text-white ${sizeClass} ${avatarColor(
        name
      )} ${className}`}
    >
      {showImage ? (
        <img
          src={avatar}
          alt={name || 'Agent'}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        getInitials(name || 'A')
      )}
    </div>
  );
}
