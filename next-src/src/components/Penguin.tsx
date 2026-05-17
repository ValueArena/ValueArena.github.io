// Inline SVG penguin used for loading + error states across the site.
// No external asset; styled by the `state` prop.

interface Props {
  size?: number;
  state?: 'idle' | 'loading' | 'error';
  className?: string;
}

export function Penguin({ size = 56, state = 'idle', className = '' }: Props) {
  const eyeBlink = state === 'loading' ? 'penguin-blink' : '';
  const wobble = state === 'loading' ? 'penguin-wobble' : '';
  const tearOpacity = state === 'error' ? 1 : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={state === 'error' ? 'error penguin' : 'loading penguin'}
      className={`${wobble} ${className}`}
    >
      {/* Body */}
      <ellipse cx="32" cy="40" rx="20" ry="22" fill="#1b1c20" />
      {/* Belly */}
      <ellipse cx="32" cy="42" rx="12" ry="16" fill="#f5f5f1" />
      {/* Head */}
      <circle cx="32" cy="22" r="14" fill="#1b1c20" />
      {/* Face mask */}
      <ellipse cx="32" cy="25" rx="9" ry="8" fill="#f5f5f1" />
      {/* Eyes */}
      <circle cx="28" cy="22" r="2.2" fill="#1b1c20" className={eyeBlink} />
      <circle cx="36" cy="22" r="2.2" fill="#1b1c20" className={eyeBlink} />
      {/* Beak */}
      <path d="M30 27 L34 27 L32 31 Z" fill="#e8a44a" />
      {/* Feet */}
      <ellipse cx="25" cy="60" rx="4" ry="2" fill="#e8a44a" />
      <ellipse cx="39" cy="60" rx="4" ry="2" fill="#e8a44a" />
      {/* Tear (error only) */}
      <circle cx="28" cy="27" r="1.2" fill="#5fa8d3" opacity={tearOpacity} />
    </svg>
  );
}
