import { useEffect, useState } from 'react'
import { pokeArtUrls, pokeNameJa } from './pokeZukan'

export function PokeSprite({ id, name = '', className = '' }) {
  const urls = pokeArtUrls(id)
  const [i, setI] = useState(0)
  useEffect(() => {
    setI(0)
  }, [id])
  const src = urls[i] || ''
  const label = name || pokeNameJa(id)
  if (!src) return <span className={`hana-chat-poke-slot ${className}`.trim()}>?</span>
  return (
    <img
      className={className}
      src={src}
      alt={label}
      draggable={false}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setI((n) => n + 1)}
    />
  )
}

export function WorldScene({ place, night = false }) {
  if (place === 'park') return <ParkScene />
  if (place === 'cafe') return <CafeScene />
  if (place === 'gym') return <GymScene />
  return <HomeScene night={night} />
}

export function SleepNest({ kind = 'futon' }) {
  const type = String(kind || 'futon')
  const sheet = type === 'pond' ? '#9fd0ea'
    : type === 'hearth' ? '#f4c4a8'
    : type === 'leaf' ? '#c5e8b8'
    : type === 'cushion' ? '#ffd6e8'
    : type === 'cave' ? '#cfc4b4'
    : type === 'silk' ? '#f4ead2'
    : type === 'shadow' ? '#c4b5e8'
    : type === 'pillow' ? '#fffaf2'
    : type === 'rag' ? '#efe0a8'
    : type === 'star' ? '#ddd6fe'
    : type === 'nest' ? '#e8c89a'
    : '#fff4ea'
  return (
    <svg className={`hana-chat-poke-nest is-${type}`} viewBox="0 0 200 100" aria-hidden="true">
      <ellipse cx="100" cy="94" rx="88" ry="6" fill="#1a1210" opacity=".32" />
      <rect x="18" y="58" width="14" height="32" rx="4" fill="#6a4434" />
      <rect x="168" y="58" width="14" height="32" rx="4" fill="#6a4434" />
      <rect x="8" y="50" width="184" height="28" rx="10" fill="#8b5a32" />
      <rect x="14" y="26" width="172" height="44" rx="16" fill={sheet} />
      <rect x="20" y="48" width="160" height="18" rx="8" fill="#fff" opacity=".22" />
      <ellipse cx="48" cy="38" rx="28" ry="16" fill="#fffaf2" />
      <ellipse cx="46" cy="36" rx="20" ry="10" fill="#fff" opacity=".9" />
      {type === 'nest' ? <path d="M24 54c14-16 32-20 76-20s62 4 76 20" fill="none" stroke="#5a3824" strokeWidth="3" /> : null}
      {type === 'hearth' ? <ellipse cx="110" cy="56" rx="22" ry="6" fill="#f59e0b" opacity=".45" /> : null}
    </svg>
  )
}

export function SleepCover({ kind = 'futon' }) {
  const type = String(kind || 'futon')
  const quilt = type === 'pond' ? '#5aa8d4'
    : type === 'hearth' ? '#c45c4a'
    : type === 'leaf' ? '#4c9a4c'
    : type === 'cushion' ? '#e89aaa'
    : type === 'cave' ? '#7a6a58'
    : type === 'silk' ? '#e8d7b0'
    : type === 'shadow' ? '#5b4578'
    : type === 'pillow' ? '#f2d2c4'
    : type === 'rag' ? '#e8d48a'
    : type === 'star' ? '#7c5ea8'
    : type === 'nest' ? '#7a4a2a'
    : '#e89aaa'
  const stitch = type === 'shadow' || type === 'star' || type === 'hearth' ? '#fff6ea' : '#fffaf2'
  return (
    <svg className={`hana-chat-poke-cover is-${type}`} viewBox="0 0 160 80" aria-hidden="true">
      <path d="M18 10h132c8 0 10 6 10 14v40c0 10-10 16-22 16H40c-14 0-22-8-22-18V22c0-8 4-12 0-12z" fill={quilt} />
      <path d="M26 20h118" stroke={stitch} strokeWidth="3" opacity=".5" strokeLinecap="round" />
      <path d="M30 34h110" stroke={stitch} strokeWidth="2" opacity=".35" />
      <path d="M34 48h102" stroke={stitch} strokeWidth="2" opacity=".28" />
      <path d="M18 16c12-10 26-8 32 4" fill="none" stroke={stitch} strokeWidth="3" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

function HomeScene({ night = false }) {
  return (
    <svg className="hana-chat-poke-set" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="180" fill={night ? '#1a2032' : '#f4e4d2'} />
      <rect y="118" width="320" height="62" fill={night ? '#2a2430' : '#c89a6e'} />
      <path d="M0 118h320" stroke={night ? '#3a3240' : '#a87a52'} strokeWidth="3" />
      <g stroke={night ? '#46384a' : '#b8885c'} strokeWidth="1.4">
        <path d="M0 132h320M0 146h320M0 160h320M0 174h320" />
      </g>
      <rect x="18" y="22" width="78" height="58" rx="4" fill={night ? '#1a2a58' : '#8ec8e8'} />
      <rect x="18" y="22" width="78" height="58" rx="4" fill="none" stroke="#6a4434" strokeWidth="4" />
      <path d="M57 22v58" stroke="#6a4434" strokeWidth="3" />
      {night ? (
        <>
          <circle cx="76" cy="42" r="9" fill="#fff6cc" />
          <circle cx="72" cy="40" r="8" fill="#1a2a58" />
          <circle cx="32" cy="36" r="1.4" fill="#fff" opacity=".85" />
          <circle cx="44" cy="48" r="1" fill="#fff" opacity=".7" />
          <circle cx="88" cy="58" r="1.2" fill="#fff" opacity=".8" />
        </>
      ) : (
        <circle cx="70" cy="52" r="10" fill="#fff7c2" opacity=".55" />
      )}
      <path d="M18 22c8 14 22 18 38 8" fill={night ? '#4a3048' : '#f2c8c4'} />
      <path d="M96 22c-8 16-20 20-38 8" fill={night ? '#4a3048' : '#f2c8c4'} />
      <ellipse cx="162" cy="148" rx="72" ry="16" fill={night ? '#4a3038' : '#d96b6b'} />
      <ellipse cx="162" cy="146" rx="58" ry="11" fill={night ? '#5a3840' : '#e88888'} />
      <rect x="236" y="54" width="10" height="66" fill="#6a4434" />
      {night ? (
        <ellipse cx="241" cy="48" rx="8" ry="6" fill="#3a3428" />
      ) : (
        <g className="hana-chat-poke-glow">
          <ellipse cx="241" cy="48" rx="22" ry="14" fill="#ffe7a0" />
          <ellipse cx="241" cy="48" rx="14" ry="8" fill="#fff6cc" />
        </g>
      )}
      <rect x="268" y="86" width="28" height="34" rx="3" fill={night ? '#355a38' : '#7cb86a'} />
      <ellipse cx="282" cy="78" rx="18" ry="22" fill={night ? '#2d5a32' : '#5aa05a'} />
      <ellipse cx="274" cy="70" rx="10" ry="14" fill={night ? '#3a6a3a' : '#6fbc6f'} />
      <rect x="248" y="28" width="36" height="28" rx="3" fill={night ? '#3a3430' : '#fffaf2'} stroke="#6a4434" strokeWidth="2" />
      <circle cx="266" cy="42" r="7" fill={night ? '#7a4a58' : '#e89aaa'} />
    </svg>
  )
}

function ParkScene() {
  return (
    <svg className="hana-chat-poke-set" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="180" fill="#8ec5e8" />
      <circle className="hana-chat-poke-sun" cx="268" cy="28" r="18" fill="#ffe28a" />
      <g className="hana-chat-poke-cloud">
        <ellipse cx="52" cy="36" rx="28" ry="12" fill="#fff" opacity=".9" />
        <ellipse cx="78" cy="42" rx="22" ry="10" fill="#fff" opacity=".85" />
      </g>
      <g className="hana-chat-poke-cloud is-slow">
        <ellipse cx="196" cy="30" rx="26" ry="11" fill="#fff" opacity=".8" />
      </g>
      <ellipse cx="40" cy="108" rx="70" ry="28" fill="#7dbe6a" />
      <ellipse cx="280" cy="112" rx="64" ry="26" fill="#6fb05e" />
      <rect y="122" width="320" height="58" fill="#6aa85a" />
      <path d="M70 180c40-44 140-44 180 0" fill="#c4a07a" />
      <path d="M90 180c32-28 108-28 140 0" fill="#d4b48a" />
      <rect x="28" y="88" width="10" height="42" fill="#7a4a2a" />
      <circle cx="33" cy="78" r="22" fill="#3f8a3f" />
      <circle cx="20" cy="88" r="14" fill="#4c9a4c" />
      <circle cx="48" cy="86" r="13" fill="#357c35" />
      <rect x="262" y="92" width="10" height="38" fill="#7a4a2a" />
      <circle cx="267" cy="82" r="20" fill="#3f8a3f" />
      <circle cx="254" cy="90" r="12" fill="#4c9a4c" />
      <g className="hana-chat-poke-bloom">
        <circle cx="48" cy="148" r="4" fill="#f2a0b4" />
        <circle cx="62" cy="154" r="3.4" fill="#f6d15b" />
        <circle cx="250" cy="150" r="4" fill="#e89aaa" />
        <circle cx="266" cy="156" r="3.2" fill="#fff" />
      </g>
    </svg>
  )
}

function CafeScene() {
  return (
    <svg className="hana-chat-poke-set" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="180" fill="#f3d7c4" />
      <rect y="108" width="320" height="72" fill="#8b4d3a" />
      <g fill="#f6eadc">
        <rect x="0" y="108" width="20" height="14" />
        <rect x="40" y="108" width="20" height="14" />
        <rect x="80" y="108" width="20" height="14" />
        <rect x="120" y="108" width="20" height="14" />
        <rect x="160" y="108" width="20" height="14" />
        <rect x="200" y="108" width="20" height="14" />
        <rect x="240" y="108" width="20" height="14" />
        <rect x="280" y="108" width="20" height="14" />
      </g>
      <rect x="18" y="28" width="70" height="50" rx="4" fill="#9fd0ea" stroke="#6a4434" strokeWidth="3" />
      <path d="M18 54h70" stroke="#6a4434" strokeWidth="2" />
      <rect x="118" y="8" width="8" height="22" fill="#6a4434" />
      <ellipse className="hana-chat-poke-glow" cx="122" cy="32" rx="16" ry="8" fill="#ffe7a0" />
      <rect x="178" y="8" width="8" height="22" fill="#6a4434" />
      <ellipse className="hana-chat-poke-glow is-late" cx="182" cy="32" rx="16" ry="8" fill="#ffe7a0" />
      <rect x="36" y="62" width="248" height="58" rx="8" fill="#6a4434" />
      <rect x="42" y="56" width="236" height="10" rx="3" fill="#c89a6e" />
      <rect x="48" y="68" width="224" height="40" rx="6" fill="#cfe8f4" opacity=".55" />
      <rect x="56" y="76" width="28" height="22" rx="6" fill="#fff6ea" />
      <path d="M64 76c4-8 12-8 16 0" fill="none" stroke="#f2c24a" strokeWidth="2" />
      <ellipse cx="70" cy="72" rx="5" ry="4" fill="#f6d15b" />
      <rect x="92" y="78" width="22" height="18" rx="4" fill="#d8f0d0" />
      <path d="M98 78v-6" stroke="#7a4a2a" strokeWidth="2" />
      <ellipse cx="98" cy="70" rx="6" ry="4" fill="#c5e8b8" />
      <rect x="122" y="78" width="22" height="18" rx="4" fill="#f4ead2" />
      <path d="M128 78v-6" stroke="#7a4a2a" strokeWidth="2" />
      <ellipse cx="133" cy="70" rx="6" ry="4" fill="#e8d7b0" />
      <rect x="152" y="74" width="18" height="24" rx="8" fill="#f9a8d4" />
      <ellipse cx="161" cy="76" rx="7" ry="4" fill="#fff" opacity=".7" />
      <rect x="178" y="80" width="26" height="16" rx="8" fill="#86efac" />
      <circle cx="186" cy="86" r="3" fill="#fb7185" />
      <circle cx="196" cy="88" r="2.4" fill="#fbbf24" />
      <path d="M214 96l8-16 8 16z" fill="#f6eadc" />
      <ellipse cx="222" cy="96" rx="9" ry="5" fill="#f6eadc" />
      <path d="M222 80c6 4 6 10 0 14-6-4-6-10 0-14z" fill="#5aa05a" />
      <ellipse cx="248" cy="92" rx="12" ry="10" fill="#fffaf2" />
      <path d="M240 88h16" stroke="#f2a0b4" strokeWidth="3" />
      <circle cx="248" cy="84" r="3" fill="#f2a0b4" />
      <ellipse cx="278" cy="64" rx="14" ry="18" fill="#5aa05a" />
      <rect x="270" y="80" width="16" height="18" fill="#c45c4a" />
      <g className="hana-chat-poke-steam">
        <ellipse cx="70" cy="58" rx="4" ry="6" fill="#fff" opacity=".4" />
        <ellipse cx="133" cy="58" rx="4" ry="6" fill="#fff" opacity=".32" />
      </g>
      <rect x="44" y="128" width="52" height="8" rx="2" fill="#c89a6e" />
      <rect x="56" y="136" width="10" height="22" fill="#6a4434" />
      <rect x="74" y="136" width="10" height="22" fill="#6a4434" />
    </svg>
  )
}

function GymScene() {
  return (
    <svg className="hana-chat-poke-set" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="180" fill="#efe0cc" />
      <rect y="118" width="320" height="62" fill="#c89a6e" />
      <path d="M0 118h320" stroke="#a87a52" strokeWidth="3" />
      <g stroke="#b8885c" strokeWidth="1.4">
        <path d="M0 132h320M0 146h320M0 160h320M0 174h320" />
      </g>
      <rect x="16" y="22" width="70" height="52" rx="4" fill="#8ec8e8" />
      <rect x="16" y="22" width="70" height="52" rx="4" fill="none" stroke="#6a4434" strokeWidth="4" />
      <path d="M51 22v52" stroke="#6a4434" strokeWidth="3" />
      <circle cx="68" cy="40" r="9" fill="#ffe28a" />
      <rect x="234" y="22" width="70" height="52" rx="4" fill="#8ec8e8" />
      <rect x="234" y="22" width="70" height="52" rx="4" fill="none" stroke="#6a4434" strokeWidth="4" />
      <path d="M269 22v52" stroke="#6a4434" strokeWidth="3" />
      <ellipse cx="250" cy="38" rx="12" ry="6" fill="#fff" opacity=".85" />
      <rect x="88" y="8" width="144" height="10" rx="3" fill="#6a4434" />
      <rect x="122" y="8" width="8" height="18" fill="#6a4434" />
      <ellipse cx="126" cy="32" rx="13" ry="7" fill="#ffe7a0" />
      <rect x="190" y="8" width="8" height="18" fill="#6a4434" />
      <ellipse cx="194" cy="32" rx="13" ry="7" fill="#ffe7a0" />
      <circle cx="160" cy="40" r="11" fill="#fffaf2" stroke="#6a4434" strokeWidth="2" />
      <path d="M149 40h22" stroke="#c45c4a" strokeWidth="11" />
      <circle cx="160" cy="40" r="3.5" fill="#6a4434" />
      <g className="hana-chat-poke-bag">
        <line x1="98" y1="12" x2="98" y2="48" stroke="#6a4434" strokeWidth="3" />
        <ellipse cx="98" cy="74" rx="17" ry="24" fill="#c8895a" />
        <ellipse cx="98" cy="74" rx="11" ry="17" fill="#e0a878" />
        <rect x="85" y="58" width="26" height="7" rx="2" fill="#f6eadc" />
        <circle cx="92" cy="72" r="2" fill="#6a4434" />
        <circle cx="104" cy="72" r="2" fill="#6a4434" />
        <path d="M93 80c3 2.6 6.4 2.6 9.4 0" fill="none" stroke="#6a4434" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <ellipse cx="160" cy="150" rx="84" ry="18" fill="#d96b6b" />
      <ellipse cx="160" cy="148" rx="64" ry="12" fill="#f6eadc" />
      <ellipse cx="160" cy="148" rx="12" ry="3.5" fill="#e8c4b0" />
      <rect x="24" y="132" width="38" height="7" rx="3" fill="#6a4434" />
      <circle cx="24" cy="135.5" r="8" fill="#c45c4a" />
      <circle cx="62" cy="135.5" r="8" fill="#c45c4a" />
      <circle cx="24" cy="135.5" r="3.5" fill="#f6eadc" />
      <circle cx="62" cy="135.5" r="3.5" fill="#f6eadc" />
      <rect x="276" y="96" width="12" height="40" rx="4" fill="#8b5a32" />
      <rect x="264" y="108" width="10" height="28" rx="3" fill="#a06a3c" />
      <rect x="292" y="112" width="10" height="24" rx="3" fill="#8b5a32" />
      <rect x="260" y="134" width="46" height="8" rx="2" fill="#6a4434" />
    </svg>
  )
}
