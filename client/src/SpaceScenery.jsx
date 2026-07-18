import mountainMorningBackground from './assets/space-mountain-morning.png'
import oceanNightBackground from './assets/space-ocean-night.png'
import rainyCityBackground from './assets/space-rainy-city.png'
import sakuraRoomBackground from './assets/space-sakura-room.png'
import { resolveListeningSpace } from './listeningSpaces'

function OceanScene() {
  return (
    <svg className="space-scenery-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="ocean-moon" cx="78%" cy="18%" r="12%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="70%" stopColor="#fde68a" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ocean-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c4a6e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#082f49" />
        </linearGradient>
      </defs>
      <circle cx="920" cy="120" r="52" fill="url(#ocean-moon)" />
      <circle cx="920" cy="120" r="28" fill="#fef9c3" opacity="0.95" />
      <path
        d="M0 520 Q200 500 400 530 T800 520 T1200 540 L1200 800 L0 800 Z"
        fill="url(#ocean-water)"
      />
      <path
        className="space-wave space-wave-1"
        d="M0 500 Q150 480 300 500 T600 490 T900 505 T1200 495 L1200 560 L0 560 Z"
        fill="rgba(56,189,248,0.18)"
      />
      <path
        className="space-wave space-wave-2"
        d="M0 515 Q180 530 360 515 T720 525 T1200 510 L1200 580 L0 580 Z"
        fill="rgba(125,211,252,0.12)"
      />
      <path d="M0 560 L1200 560 L1200 800 L0 800 Z" fill="#041018" opacity="0.55" />
      <ellipse cx="600" cy="600" rx="420" ry="18" fill="rgba(56,189,248,0.15)" />
    </svg>
  )
}

function RainyCityScene() {
  return (
    <svg className="space-scenery-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="city-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#0f0f1a" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#city-sky)" />
      {/* distant buildings */}
      <path
        d="M0 520 L80 520 L80 380 L120 380 L120 520 L200 520 L200 300 L260 300 L260 520 L340 520 L340 420 L400 420 L400 520 L500 520 L500 280 L560 280 L560 520 L640 520 L640 360 L700 360 L700 520 L800 520 L800 320 L860 320 L860 520 L940 520 L940 400 L1000 400 L1000 520 L1100 520 L1100 340 L1160 340 L1160 520 L1200 520 L1200 800 L0 800 Z"
        fill="#0c0a14"
        opacity="0.95"
      />
      {/* neon signs */}
      <rect x="220" y="440" width="48" height="8" rx="2" fill="#818cf8" opacity="0.85" />
      <rect x="540" y="380" width="36" height="6" rx="2" fill="#f472b6" opacity="0.75" />
      <rect x="780" y="420" width="56" height="8" rx="2" fill="#38bdf8" opacity="0.8" />
      <rect x="1020" y="460" width="40" height="6" rx="2" fill="#a78bfa" opacity="0.7" />
      {/* wet street reflection */}
      <rect x="0" y="560" width="1200" height="240" fill="rgba(99,102,241,0.08)" />
      <ellipse cx="300" cy="620" rx="80" ry="6" fill="rgba(129,140,248,0.25)" />
      <ellipse cx="700" cy="640" rx="120" ry="8" fill="rgba(244,114,182,0.2)" />
      {/* window frame */}
      <rect x="60" y="80" width="1080" height="520" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="12" rx="4" />
      <line x1="600" y1="80" x2="600" y2="600" stroke="rgba(148,163,184,0.1)" strokeWidth="6" />
      <line x1="60" y1="340" x2="1140" y2="340" stroke="rgba(148,163,184,0.1)" strokeWidth="6" />
    </svg>
  )
}

function MountainScene() {
  return (
    <svg className="space-scenery-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="mountain-sun" cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mountain-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#64748b" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#334155" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="mountain-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>
      <ellipse cx="600" cy="720" rx="500" ry="180" fill="url(#mountain-sun)" />
      <circle cx="600" cy="180" r="48" fill="#fde68a" opacity="0.9" />
      <circle cx="600" cy="180" r="70" fill="#fbbf24" opacity="0.25" />
      {/* far peaks */}
      <path
        d="M0 480 L200 280 L380 420 L520 240 L700 400 L860 260 L1040 440 L1200 320 L1200 800 L0 800 Z"
        fill="url(#mountain-far)"
        opacity="0.7"
      />
      {/* near peaks */}
      <path
        d="M0 560 L160 400 L320 520 L480 340 L640 500 L800 380 L960 540 L1120 420 L1200 480 L1200 800 L0 800 Z"
        fill="url(#mountain-near)"
      />
      {/* mist */}
      <ellipse className="space-mist space-mist-1" cx="400" cy="520" rx="280" ry="40" fill="rgba(248,250,252,0.12)" />
      <ellipse className="space-mist space-mist-2" cx="800" cy="560" rx="320" ry="50" fill="rgba(248,250,252,0.1)" />
    </svg>
  )
}

function SakuraRoomScene() {
  return (
    <svg className="space-scenery-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="room-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d2838" />
          <stop offset="100%" stopColor="#1f1420" />
        </linearGradient>
        <linearGradient id="room-outside" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fce7f3" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fbcfe8" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#room-wall)" />
      {/* window */}
      <rect x="280" y="120" width="640" height="480" fill="#1a1018" rx="6" />
      <rect x="300" y="140" width="600" height="440" fill="url(#room-outside)" rx="4" />
      <line x1="600" y1="140" x2="600" y2="580" stroke="#2a1824" strokeWidth="8" />
      <line x1="300" y1="360" x2="900" y2="360" stroke="#2a1824" strokeWidth="8" />
      {/* sakura tree silhouette */}
      <path
        d="M600 580 L600 320 Q520 300 480 260 Q460 220 500 200 Q540 180 600 220 Q660 180 700 200 Q740 220 720 260 Q680 300 600 320 Z"
        fill="#4a2038"
        opacity="0.85"
      />
      <circle cx="480" cy="240" r="28" fill="#f9a8d4" opacity="0.5" />
      <circle cx="540" cy="210" r="22" fill="#fbcfe8" opacity="0.45" />
      <circle cx="620" cy="200" r="26" fill="#f9a8d4" opacity="0.5" />
      <circle cx="700" cy="230" r="24" fill="#fbcfe8" opacity="0.45" />
      <circle cx="660" cy="270" r="20" fill="#f9a8d4" opacity="0.4" />
      {/* floor / sill */}
      <rect x="0" y="600" width="1200" height="200" fill="#1a1018" />
      <rect x="260" y="580" width="680" height="28" fill="#2a1824" rx="2" />
      {/* warm lamp glow */}
      <ellipse cx="180" cy="520" rx="100" ry="60" fill="rgba(251,191,36,0.15)" />
      <path d="M140 600 L140 480 Q140 440 180 440 Q220 440 220 480 L220 600 Z" fill="#2a1824" />
      <ellipse cx="180" cy="440" rx="50" ry="12" fill="#fde68a" opacity="0.7" />
    </svg>
  )
}

const SCENE_MAP = {
  'ocean-night': OceanScene,
  'rainy-city': RainyCityScene,
  'mountain-morning': MountainScene,
  'sakura-room': SakuraRoomScene,
}

const DEFAULT_BACKGROUND_MAP = {
  'ocean-night': oceanNightBackground,
  'rainy-city': rainyCityBackground,
  'mountain-morning': mountainMorningBackground,
  'sakura-room': sakuraRoomBackground,
}

export function SpaceSceneryPreview({ spaceId, className = '', backgroundUrl = null }) {
  const Scene = SCENE_MAP[spaceId] || OceanScene
  const resolvedBackgroundUrl = backgroundUrl || DEFAULT_BACKGROUND_MAP[spaceId]
  return (
    <span className={`space-scenery-preview space-scenery-preview--${spaceId} ${className}`.trim()}>
      {resolvedBackgroundUrl ? (
        <img className="space-scenery-photo space-scenery-photo--preview" src={resolvedBackgroundUrl} alt="" />
      ) : (
        <Scene />
      )}
    </span>
  )
}

export default function SpaceScenery({ spaceId, className = '', variant = 'full', backgroundUrl = null }) {
  resolveListeningSpace(spaceId)
  const Scene = SCENE_MAP[spaceId] || OceanScene
  const resolvedBackgroundUrl = backgroundUrl || DEFAULT_BACKGROUND_MAP[spaceId]

  return (
    <div
      className={`space-scenery space-scenery--${spaceId} space-scenery--${variant}${resolvedBackgroundUrl ? ' has-photo' : ''} ${className}`.trim()}
      aria-hidden="true"
    >
      {resolvedBackgroundUrl ? (
        <img className="space-scenery-photo" src={resolvedBackgroundUrl} alt="" />
      ) : (
        <Scene />
      )}
    </div>
  )
}
