// A watercolor countryside sky behind the hero (DESIGN.md section 8):
// a Sky gradient, soft clouds that drift across slowly, in 120 to 180 s, meadow hills,
// and a little lamp. Painted SVG; no three.js on parent pages.

const clouds = [
  { top: "9%", width: 210, duration: "180s", delay: "-36s" },
  { top: "24%", width: 150, duration: "150s", delay: "-99s" },
  { top: "4%", width: 120, duration: "120s", delay: "-48s" },
];

export function PaintedSky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 720"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="sky-wash" x1="0" y1="0" x2="0" y2="1">
            {/* Pale by the hero label, so #5B6B78 text keeps 4.5:1. */}
            <stop offset="0" stopColor="#7EBDE6" />
            <stop offset="0.1" stopColor="#A9D2EE" />
            <stop offset="0.26" stopColor="#E4EFF3" />
            <stop offset="0.55" stopColor="#F7F1E3" />
          </linearGradient>
          <radialGradient id="sky-light" cx="0.3" cy="0.55" r="0.6">
            <stop offset="0" stopColor="#FFFDF7" stopOpacity="0.85" />
            <stop offset="1" stopColor="#FFFDF7" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="lamp-glow">
            <stop offset="0" stopColor="#F5C35B" stopOpacity="0.55" />
            <stop offset="1" stopColor="#F5C35B" stopOpacity="0" />
          </radialGradient>
          <filter id="watercolor" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7" result="w" />
            <feDisplacementMap in="SourceGraphic" in2="w" scale="14" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <rect width="1440" height="720" fill="url(#sky-wash)" />
        <rect width="1440" height="720" fill="url(#sky-light)" />
        <g filter="url(#watercolor)">
          <path d="M-40 600 C200 540 420 560 640 600 C860 640 1100 560 1480 590 L1480 760 L-40 760 Z" fill="#B5D396" opacity="0.85" />
          <path d="M-40 650 C260 600 520 630 760 660 C1000 690 1220 620 1480 640 L1480 760 L-40 760 Z" fill="#86B562" />
          <path d="M-40 700 C320 676 700 690 1000 704 C1200 712 1360 696 1480 692 L1480 760 L-40 760 Z" fill="#3F6E2E" />
        </g>
        <g transform="translate(1290 560)">
          <circle cx="0" cy="0" r="34" fill="url(#lamp-glow)" />
          <path d="M0 6 L0 64" stroke="#23354A" strokeWidth="3" strokeLinecap="round" />
          <path d="M-8 -2 L8 -2 L5 8 L-5 8 Z" fill="#23354A" />
          <circle cx="0" cy="1" r="5" fill="#F5C35B" />
        </g>
      </svg>
      {clouds.map((cloud) => (
        <svg
          key={cloud.top}
          className="cloud absolute left-0"
          style={{ top: cloud.top, width: cloud.width, animationDuration: cloud.duration, animationDelay: cloud.delay }}
          viewBox="0 0 200 80"
        >
          <g fill="#FFFDF7" opacity="0.88" filter="url(#watercolor)">
            <ellipse cx="62" cy="52" rx="48" ry="22" />
            <ellipse cx="104" cy="38" rx="44" ry="30" />
            <ellipse cx="146" cy="54" rx="42" ry="20" />
          </g>
        </svg>
      ))}
    </div>
  );
}
