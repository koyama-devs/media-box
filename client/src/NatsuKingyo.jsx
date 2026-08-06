/** Japanese goldfish (kingyo) silhouette — faces right to match swim scaleX. */
export default function NatsuKingyo({ gradientId = 'kingyo' }) {
  const bodyId = `${gradientId}-body`
  const tailId = `${gradientId}-tail`
  const shineId = `${gradientId}-shine`

  return (
    <svg className="natsu-kingyo-svg" viewBox="0 0 80 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={bodyId} x1="8%" y1="35%" x2="92%" y2="70%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="28%" stopColor="#f97316" />
          <stop offset="62%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#fb923c" />
        </linearGradient>
        <linearGradient id={tailId} x1="100%" y1="20%" x2="0%" y2="80%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="45%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={shineId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff7ed" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff7ed" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fantail — flowing lobes on the left */}
      <g className="natsu-kingyo-tail">
        <path
          fill={`url(#${tailId})`}
          opacity="0.92"
          d="M34 20c-4-7-12-12-22-14 3 5 4 9 3.5 14 .5 5-.5 9-3.5 14 10-2 18-7 22-14z"
        />
        <path
          fill="#f97316"
          opacity="0.55"
          d="M32 20c-3-5-9-8-16-9 2.5 3.5 3 6.5 2.8 9 .2 2.5-.4 5.5-2.8 9 7-1 13-4.5 16-9z"
        />
        <path
          fill="#fbbf24"
          opacity="0.4"
          d="M30 14c-5-4-11-6-17-6 4 3 6 5 7 8 2-1 5-2 10-2z"
        />
        <path
          fill="#fbbf24"
          opacity="0.35"
          d="M30 26c-5 4-11 6-17 6 4-3 6-5 7-8 2 1 5 2 10 2z"
        />
      </g>

      {/* Dorsal fin */}
      <path
        fill="#fb923c"
        opacity="0.88"
        d="M42 9c5-7 14-9 22-6-4 2.5-9 4.5-15 5.5-2.2.4-4.5.5-7 .5z"
      />

      {/* Pelvic / anal fins */}
      <path fill="#f59e0b" opacity="0.82" d="M44 28c3 4 8 7 14 7.5-4-2-8-4.5-10-7.5-1-1.4-2.2-1.6-4 0z" />
      <path fill="#fb923c" opacity="0.7" d="M50 29c2.5 3 6 5 10 5.5-3-1.5-5.5-3-7-5.5-.8-1.2-1.8-1.2-3 0z" />

      {/* Plump body */}
      <ellipse cx="52" cy="20" rx="18" ry="10.5" fill={`url(#${bodyId})`} />
      <ellipse cx="48" cy="17" rx="9" ry="5" fill={`url(#${shineId})`} />

      {/* Soft belly */}
      <ellipse cx="50" cy="24.5" rx="11" ry="4.2" fill="#fff7ed" opacity="0.22" />

      {/* Gill line */}
      <path
        fill="none"
        stroke="#9a3412"
        strokeWidth="0.9"
        strokeOpacity="0.4"
        d="M58 12.8c2.4 1.8 2.5 10.6 0 12.6"
      />

      {/* Head taper + mouth */}
      <path fill="#ea580c" opacity="0.35" d="M66 17c3.5 1 4.5 3.2 4.2 5.2-1.8-1.2-3.5-2.2-4.2-5.2z" />

      {/* Eye */}
      <circle cx="64.5" cy="17.5" r="2.7" fill="#fffaf5" />
      <circle cx="65.1" cy="17.7" r="1.55" fill="#1c1917" />
      <circle cx="65.7" cy="17.1" r="0.5" fill="#fff" />
    </svg>
  )
}
