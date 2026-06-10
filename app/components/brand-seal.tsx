/**
 * The Translatarr brand mark: a vermilion seal (hanko) carrying the 訳
 * ("translation") glyph, drawn as a standalone SVG.
 */

export function BrandSeal({ size = 27 }: { size?: number }) {
  return (
    <svg
      className="brand-seal"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="seal-ink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5c3d" />
          <stop offset="1" stopColor="#d0421f" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#seal-ink)" />
      <rect
        x="4"
        y="4"
        width="24"
        height="24"
        rx="5.5"
        fill="none"
        stroke="#f2ecdd"
        strokeOpacity="0.32"
        strokeWidth="1.25"
      />
      <text
        x="16"
        y="16.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#f2ecdd"
        fontFamily="var(--font-serif-stack)"
        fontSize="15.5"
        fontWeight="600"
      >
        訳
      </text>
    </svg>
  );
}
