import { useEffect, useState } from 'react';
import { avatarColor, getInitials, resolveAssetUrl } from '../utils/helpers';

const SIZE_CLASS = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-sm',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-xl',
};

/**
 * Customer profile photo or colorful initials fallback (sidebar, header, context).
 */
export default function CustomerAvatar({
  name = 'Customer',
  avatar = null,
  size = 'md',
  className = '',
  ringClass = 'ring-2 ring-white dark:ring-slate-900',
  showLiveDot = false,
  showWaitingDot = false,
}) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.md;
  const resolvedAvatar = resolveAssetUrl(avatar);
  const showImage = Boolean(resolvedAvatar) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [avatar]);

  return (
    <div className={`relative flex-shrink-0 ${sizeClass} ${className}`}>
      <div
        className={`w-full h-full rounded-full flex items-center justify-center font-semibold text-white ${avatarColor(
          name
        )}`}
      >
        {getInitials(name)}
      </div>
      {showImage && (
        <img
          src={resolvedAvatar}
          alt={name}
          className={`w-full h-full rounded-full object-cover absolute inset-0 ${ringClass}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {showLiveDot && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-white dark:ring-slate-900 z-10" />
      )}
      {showWaitingDot && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-danger animate-pulseDot ring-2 ring-sidebar z-10" />
      )}
    </div>
  );
}
