export default function LogoMark({ size = 48, className = '' }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Jornada Supera"
    >
      <defs>
        <linearGradient id="logo-mark-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0BC4AA" />
          <stop offset="100%" stopColor="#08B59C" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logo-mark-bg)" />
      <path
        d="M32 49.5 C 18.5 41, 13 31, 17.5 24 C 21.5 18, 28.5 18.5, 32 24 C 35.5 18.5, 42.5 18, 46.5 24 C 51 31, 45.5 41, 32 49.5 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
