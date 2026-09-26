/**
 * Premium character avatar presets (inline SVG data URLs).
 * Modern anime / chibi aesthetic, rich gradients, expressive details — zero external assets.
 */

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`
}

export const AVATAR_PRESETS = [
  // 1. cool-hoodie
  {
    id: 'cool-hoodie',
    label: 'クール',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-cool-hoodie" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#090d16"/>
        </linearGradient>
        <radialGradient id="glow-cool-hoodie" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-cool-hoodie" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ffe6d6"/>
          <stop offset="100%" stop-color="#f5c7ad"/>
        </linearGradient>
        <linearGradient id="hair-cool-hoodie" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2d3748"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <linearGradient id="hoodie-cool-hoodie" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#243042"/>
          <stop offset="100%" stop-color="#0b111e"/>
        </linearGradient>
        <linearGradient id="iris-cool-hoodie" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
        <clipPath id="clip-cool-hoodie">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-cool-hoodie)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-cool-hoodie)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1.5"/>

      <g clip-path="url(#clip-cool-hoodie)">
        <path d="M26 55 C24 24 44 10 64 10 C84 10 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-cool-hoodie)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#hoodie-cool-hoodie)"/>
        <path d="M53 72 L53 94 L75 94 L75 72 Z" fill="url(#skin-cool-hoodie)"/>
        <path d="M53 72 Q64 83 75 72 L75 80 Q64 89 53 80 Z" fill="#e2ab8e"/>
        <path d="M38 90 C38 82 50 80 64 80 C78 80 90 82 90 90 C90 99 78 105 64 105 C50 105 38 99 38 90 Z" fill="#2c3a50" stroke="#0ea5e9" stroke-width="1.2"/>
        <path d="M51 86 C54 94 64 97 77 86" fill="#090d16"/>
        <path d="M64 96 L64 128" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="2,2"/>
        <path d="M53 99 C52 107 51 115 52 121" stroke="#f1f5f9" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        <rect x="50.5" y="120" width="3" height="5" rx="1" fill="#38bdf8"/>
        <path d="M75 99 C76 107 77 115 76 121" stroke="#f1f5f9" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        <rect x="74.5" y="120" width="3" height="5" rx="1" fill="#38bdf8"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-cool-hoodie)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <circle cx="35" cy="69" r="2" fill="#38bdf8"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-cool-hoodie)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-cool-hoodie)"/>
        <path d="M43 49 Q52 45 59 49" stroke="#1e293b" stroke-width="2.6" stroke-linecap="round" fill="none"/>
        <path d="M69 49 Q76 45 85 48" stroke="#1e293b" stroke-width="2.6" stroke-linecap="round" fill="none"/>
        <path d="M46 53 Q52 51 57 53" stroke="#d49b7e" stroke-width="1" stroke-linecap="round" fill="none"/>
        <path d="M71 53 Q76 51 82 53" stroke="#d49b7e" stroke-width="1" stroke-linecap="round" fill="none"/>
        <path d="M45 57 Q53 53 60 57" stroke="#0f172a" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="61.5" rx="5" ry="5.5" fill="url(#iris-cool-hoodie)"/>
        <circle cx="53" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="51.2" cy="59.5" r="1.8" fill="#ffffff"/>
        <circle cx="54.8" cy="63" r="1" fill="#e0f2fe"/>
        <path d="M48 66 Q53 67.5 58 66" stroke="#0f172a" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M68 57 Q75 53 83 57" stroke="#0f172a" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="61.5" rx="5" ry="5.5" fill="url(#iris-cool-hoodie)"/>
        <circle cx="75" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="73.2" cy="59.5" r="1.8" fill="#ffffff"/>
        <circle cx="76.8" cy="63" r="1" fill="#e0f2fe"/>
        <path d="M70 66 Q75 67.5 80 66" stroke="#0f172a" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M63 66 L65 69 L62 69" stroke="#d49b7e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M59 75 Q65 77 71 73" stroke="#b85848" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M71 72 Q72.5 73.5 72 75" stroke="#b85848" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-cool-hoodie)"/>
        <path d="M57 15 Q63 36 65 51 Q60 44 58 32 Z" fill="url(#hair-cool-hoodie)"/>
        <path d="M47 17 Q53 38 55 50 Q51 43 49 32 Z" fill="url(#hair-cool-hoodie)"/>
        <path d="M71 18 Q76 38 79 49 Q74 43 71 32 Z" fill="url(#hair-cool-hoodie)"/>
        <path d="M37 32 Q40 46 43 54 Q41 45 38 38 Z" fill="url(#hair-cool-hoodie)"/>
        <path d="M91 32 Q88 46 85 54 Q87 45 90 38 Z" fill="url(#hair-cool-hoodie)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round" opacity="0.6" fill="none"/>
      </g>
    </svg>`),
  },

  // 2. sporty-cap
  {
    id: 'sporty-cap',
    label: 'スポーティ',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-sporty-cap" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#059669"/>
          <stop offset="100%" stop-color="#064e3b"/>
        </linearGradient>
        <linearGradient id="skin-sporty-cap" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ffe6d6"/>
          <stop offset="100%" stop-color="#f5c7ad"/>
        </linearGradient>
        <radialGradient id="blush-sporty-cap" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#f87171" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#f87171" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="cap-sporty-cap" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f97316"/>
          <stop offset="100%" stop-color="#c2410c"/>
        </linearGradient>
        <linearGradient id="jersey-sporty-cap" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#065f46"/>
          <stop offset="100%" stop-color="#022c22"/>
        </linearGradient>
        <linearGradient id="iris-sporty-cap" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#b45309"/>
        </linearGradient>
        <clipPath id="clip-sporty-cap">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-sporty-cap)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#34d399" stroke-opacity="0.35" stroke-width="1.5"/>
      <path d="M15 35 L40 15 M25 50 L55 25 M105 100 L120 85" stroke="#6ee7b7" stroke-width="1.5" stroke-linecap="round" opacity="0.25"/>

      <g clip-path="url(#clip-sporty-cap)">
        <path d="M30 55 C28 32 44 24 64 24 C84 24 100 32 98 55 C100 70 94 76 90 78 L90 52 L38 52 L38 78 C34 76 28 70 30 55 Z" fill="#262626"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#jersey-sporty-cap)"/>
        <path d="M44 91 C44 85 52 83 64 83 C76 83 84 85 84 91 L80 97 C76 92 70 90 64 90 C58 90 52 92 48 97 Z" fill="#ea580c"/>
        <path d="M48 95 C52 91 58 89 64 89 C70 89 76 91 80 95" stroke="#ffffff" stroke-width="1.5" fill="none"/>
        <path d="M64 97 L64 128" stroke="#ffffff" stroke-width="1.5" opacity="0.4"/>
        <path d="M53 72 L53 92 L75 92 L75 72 Z" fill="url(#skin-sporty-cap)"/>
        <path d="M53 72 Q64 83 75 72 L75 79 Q64 88 53 79 Z" fill="#e2ab8e"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-sporty-cap)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-sporty-cap)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-sporty-cap)"/>
        <circle cx="44" cy="69" r="7" fill="url(#blush-sporty-cap)"/>
        <circle cx="84" cy="69" r="7" fill="url(#blush-sporty-cap)"/>
        <path d="M43 48 Q51 44 59 48" stroke="#1c1917" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M69 49 Q77 45 85 49" stroke="#1c1917" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M45 56 Q53 52 60 56" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="60.5" rx="5" ry="5.8" fill="url(#iris-sporty-cap)"/>
        <circle cx="53" cy="60.5" r="2.4" fill="#090d16"/>
        <circle cx="51.2" cy="58.2" r="1.8" fill="#ffffff"/>
        <circle cx="54.8" cy="62" r="1.1" fill="#fef08a"/>
        <path d="M48 65 Q53 66.8 58 65" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M69 60 Q76 67 84 60" stroke="#1c1917" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M84 60.5 L86.5 58.5" stroke="#1c1917" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M87 53 L89 50 L91 53 L94 55 L91 57 L89 60 L87 57 L84 55 Z" fill="#fef08a"/>
        <path d="M63 65 L65 68 L62 68" stroke="#d49b7e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M55 73 Q64 84 73 73 Z" fill="#b91c1c"/>
        <path d="M57 73 Q64 78 71 73" fill="#ffffff"/>
        <path d="M35 50 C37 57 38 65 40 70 C38 63 36 56 35 50 Z" fill="#262626"/>
        <path d="M93 50 C91 57 90 65 88 70 C90 63 92 56 93 50 Z" fill="#262626"/>
        <path d="M42 45 Q47 54 50 58 Q49 50 46 44 Z" fill="#262626"/>
        <path d="M50 43 Q55 55 59 58 Q57 49 54 43 Z" fill="#262626"/>
        <path d="M61 43 Q65 53 68 56 Q66 48 63 42 Z" fill="#262626"/>
        <path d="M73 44 Q76 54 81 57 Q78 49 75 43 Z" fill="#262626"/>
        <path d="M30 42 C30 20 45 12 64 12 C83 12 98 20 98 42 C98 46 94 47 92 47 C78 44 50 44 36 47 C34 47 30 46 30 42 Z" fill="url(#cap-sporty-cap)"/>
        <ellipse cx="64" cy="12" rx="4" ry="2.5" fill="#ea580c"/>
        <path d="M64 14 Q64 28 64 43" stroke="#c2410c" stroke-width="1.5" fill="none"/>
        <path d="M64 14 Q48 25 36 44" stroke="#c2410c" stroke-width="1.2" fill="none"/>
        <path d="M64 14 Q80 25 92 44" stroke="#c2410c" stroke-width="1.2" fill="none"/>
        <path d="M64 24 L65.5 28 L70 28.5 L66.5 31.5 L67.5 36 L64 33.5 L60.5 36 L61.5 31.5 L58 28.5 L62.5 28 Z" fill="#ffffff"/>
        <path d="M24 44 C36 38 92 38 104 44 C98 51 76 54 64 54 C52 54 30 51 24 44 Z" fill="#ea580c"/>
        <path d="M26 44 C36 41 92 41 102 44 C98 48 76 51 64 51 C52 51 30 48 26 44 Z" fill="#fb923c"/>
        <path d="M34 48 C44 52 84 52 94 48 C88 54 74 56 64 56 C54 56 40 54 34 48 Z" fill="#000000" opacity="0.18"/>
      </g>
    </svg>`),
  },

  // 3. gentle-smile
  {
    id: 'gentle-smile',
    label: 'やさしい',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-gentle-smile" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#d97706"/>
          <stop offset="100%" stop-color="#78350f"/>
        </linearGradient>
        <radialGradient id="glow-gentle-smile" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stop-color="#fef3c7" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#fef3c7" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-gentle-smile" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#fff0e5"/>
          <stop offset="100%" stop-color="#f8cfb8"/>
        </linearGradient>
        <radialGradient id="blush-gentle-smile" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fb7185" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#fb7185" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-gentle-smile" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#6c4431"/>
          <stop offset="100%" stop-color="#3d2317"/>
        </linearGradient>
        <linearGradient id="sweater-gentle-smile" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ece2d0"/>
          <stop offset="100%" stop-color="#cbbba2"/>
        </linearGradient>
        <clipPath id="clip-gentle-smile">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-gentle-smile)"/>
      <circle cx="64" cy="50" r="48" fill="url(#glow-gentle-smile)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#fde68a" stroke-opacity="0.4" stroke-width="1.5"/>

      <g clip-path="url(#clip-gentle-smile)">
        <path d="M26 55 C24 24 44 12 64 12 C84 12 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-gentle-smile)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#sweater-gentle-smile)"/>
        <path d="M24 128 L24 106 M36 128 L36 98 M92 128 L92 98 M104 128 L104 106" stroke="#b8a78e" stroke-width="1.5" stroke-dasharray="3,3"/>
        <path d="M53 72 L53 88 L75 88 L75 72 Z" fill="url(#skin-gentle-smile)"/>
        <path d="M42 86 C42 80 50 78 64 78 C78 78 86 80 86 86 C86 94 78 98 64 98 C50 98 42 94 42 86 Z" fill="#ded2bf" stroke="#cbbba2" stroke-width="1.5"/>
        <path d="M48 86 C48 88 55 93 64 93 C73 93 80 88 80 86" stroke="#b8a78e" stroke-width="1.2" fill="none"/>
        <path d="M52 82 L52 95 M58 80 L58 96 M64 80 L64 96 M70 80 L70 96 M76 82 L76 95" stroke="#b8a78e" stroke-width="1.2"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-gentle-smile)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-gentle-smile)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-gentle-smile)"/>
        <circle cx="44" cy="69" r="8" fill="url(#blush-gentle-smile)"/>
        <circle cx="84" cy="69" r="8" fill="url(#blush-gentle-smile)"/>
        <path d="M43 51 Q52 48 59 52" stroke="#5c3d2e" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M69 52 Q76 48 85 51" stroke="#5c3d2e" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M46 55 Q53 53 58 56" stroke="#e0a98b" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M70 56 Q75 53 82 55" stroke="#e0a98b" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M45 61 Q53 67 60 61" stroke="#3b2317" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M68 61 Q75 67 83 61" stroke="#3b2317" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M60 61.5 L62.5 59.5" stroke="#3b2317" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M83 61.5 L85.5 59.5" stroke="#3b2317" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M63 66 L65 69 L62 69" stroke="#d49b7e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M57 74 Q64 80 71 74" stroke="#c45c4a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 44 67 43 63 51 C59 44 53 44 49 51 C45 45 41 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-gentle-smile)"/>
        <path d="M54 16 Q61 36 63 50 Q58 43 56 32 Z" fill="url(#hair-gentle-smile)"/>
        <path d="M68 17 Q73 37 77 49 Q72 42 69 32 Z" fill="url(#hair-gentle-smile)"/>
        <path d="M44 19 Q49 38 51 50 Q48 42 45 33 Z" fill="url(#hair-gentle-smile)"/>
        <path d="M80 20 Q83 38 85 50 Q81 42 78 33 Z" fill="url(#hair-gentle-smile)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#fcd34d" stroke-width="2.4" stroke-linecap="round" opacity="0.65" fill="none"/>
      </g>
    </svg>`),
  },

  // 4. casual-tee
  {
    id: 'casual-tee',
    label: 'カジュアル',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-casual-tee" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2563eb"/>
          <stop offset="100%" stop-color="#1e3a8a"/>
        </linearGradient>
        <radialGradient id="glow-casual-tee" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#93c5fd" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#93c5fd" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-casual-tee" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ffe8dc"/>
          <stop offset="100%" stop-color="#f6cbb3"/>
        </linearGradient>
        <radialGradient id="blush-casual-tee" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#f43f5e" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-casual-tee" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3b2c24"/>
          <stop offset="100%" stop-color="#1f1612"/>
        </linearGradient>
        <linearGradient id="shirt-casual-tee" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#3b82f6"/>
          <stop offset="100%" stop-color="#1d4ed8"/>
        </linearGradient>
        <linearGradient id="iris-casual-tee" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#1e3a8a"/>
        </linearGradient>
        <clipPath id="clip-casual-tee">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-casual-tee)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-casual-tee)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#60a5fa" stroke-opacity="0.35" stroke-width="1.5"/>

      <g clip-path="url(#clip-casual-tee)">
        <path d="M26 55 C24 24 44 12 64 12 C84 12 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-casual-tee)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#shirt-casual-tee)"/>
        <path d="M48 91 C48 83 55 81 64 81 C73 81 80 83 80 91 Z" fill="#ffffff"/>
        <path d="M45 93 C45 86 54 84 64 84 C74 84 83 86 83 93 C83 98 74 101 64 101 C54 101 45 98 45 93 Z" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="1"/>
        <path d="M57 93 C58 103 64 108 64 108 C64 108 70 103 71 93" stroke="#cbd5e1" stroke-width="1.2" fill="none"/>
        <rect x="62.5" y="107" width="3" height="4" rx="1" fill="#e2e8f0"/>
        <path d="M53 72 L53 93 L75 93 L75 72 Z" fill="url(#skin-casual-tee)"/>
        <path d="M53 72 Q64 83 75 72 L75 80 Q64 89 53 80 Z" fill="#e2ab8e"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-casual-tee)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <rect x="33" y="63" width="4.5" height="8" rx="2.2" fill="#ffffff"/>
        <circle cx="35" cy="65" r="1" fill="#94a3b8"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-casual-tee)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-casual-tee)"/>
        <circle cx="44" cy="69" r="6.5" fill="url(#blush-casual-tee)"/>
        <circle cx="84" cy="69" r="6.5" fill="url(#blush-casual-tee)"/>
        <path d="M43 49 Q52 46 59 50" stroke="#1f1612" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M69 50 Q76 46 85 49" stroke="#1f1612" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M46 53 Q52 51 57 53" stroke="#d49b7e" stroke-width="1" stroke-linecap="round" fill="none"/>
        <path d="M71 53 Q76 51 82 53" stroke="#d49b7e" stroke-width="1" stroke-linecap="round" fill="none"/>
        <path d="M45 57 Q53 53 60 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="61.5" rx="5" ry="5.8" fill="url(#iris-casual-tee)"/>
        <circle cx="53" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="51.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="54.8" cy="63" r="1" fill="#93c5fd"/>
        <path d="M48 66 Q53 67.5 58 66" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M68 57 Q75 53 83 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="61.5" rx="5" ry="5.8" fill="url(#iris-casual-tee)"/>
        <circle cx="75" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="73.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="76.8" cy="63" r="1" fill="#93c5fd"/>
        <path d="M70 66 Q75 67.5 80 66" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M63 66 L65 69 L62 69" stroke="#d49b7e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M57 74 Q64 80 71 74" stroke="#b91c1c" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-casual-tee)"/>
        <path d="M56 16 Q62 36 65 50 Q60 43 58 32 Z" fill="url(#hair-casual-tee)"/>
        <path d="M47 18 Q52 38 55 50 Q50 43 48 33 Z" fill="url(#hair-casual-tee)"/>
        <path d="M72 19 Q77 38 82 49 Q76 43 73 33 Z" fill="url(#hair-casual-tee)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#93c5fd" stroke-width="2.4" stroke-linecap="round" opacity="0.6" fill="none"/>
      </g>
    </svg>`),
  },

  // 5. geek-specs
  {
    id: 'geek-specs',
    label: 'ギーク',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-geek-specs" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7c3aed"/>
          <stop offset="100%" stop-color="#3b0764"/>
        </linearGradient>
        <radialGradient id="glow-geek-specs" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#c084fc" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#c084fc" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-geek-specs" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#fff0e5"/>
          <stop offset="100%" stop-color="#f8cfb8"/>
        </linearGradient>
        <linearGradient id="hair-geek-specs" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2d2847"/>
          <stop offset="100%" stop-color="#141124"/>
        </linearGradient>
        <linearGradient id="vest-geek-specs" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#4c1d95"/>
          <stop offset="100%" stop-color="#2e1065"/>
        </linearGradient>
        <linearGradient id="iris-geek-specs" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#a855f7"/>
          <stop offset="100%" stop-color="#581c87"/>
        </linearGradient>
        <clipPath id="clip-geek-specs">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-geek-specs)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-geek-specs)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#c084fc" stroke-opacity="0.35" stroke-width="1.5"/>

      <g clip-path="url(#clip-geek-specs)">
        <path d="M26 55 C24 24 44 12 64 12 C84 12 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-geek-specs)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#vest-geek-specs)"/>
        <path d="M48 91 L64 112 L80 91 Z" fill="#ffffff"/>
        <path d="M62 96 L66 96 L65 116 L63 116 Z" fill="#9333ea"/>
        <path d="M48 91 L64 112 L80 91" stroke="#3b0764" stroke-width="2" fill="none"/>
        <path d="M53 72 L53 92 L75 92 L75 72 Z" fill="url(#skin-geek-specs)"/>
        <path d="M53 72 Q64 83 75 72 L75 80 Q64 89 53 80 Z" fill="#e2ab8e"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-geek-specs)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-geek-specs)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-geek-specs)"/>
        <path d="M43 48 Q52 45 59 49" stroke="#2d2847" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M69 49 Q76 45 85 48" stroke="#2d2847" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M45 57 Q53 53 60 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="61.5" rx="5" ry="5.8" fill="url(#iris-geek-specs)"/>
        <circle cx="53" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="51.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="54.8" cy="63" r="1" fill="#e9d5ff"/>
        <path d="M68 57 Q75 53 83 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="61.5" rx="5" ry="5.8" fill="url(#iris-geek-specs)"/>
        <circle cx="75" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="73.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="76.8" cy="63" r="1" fill="#e9d5ff"/>
        <g stroke="#e2e8f0" stroke-width="2.2" fill="none">
          <circle cx="53" cy="62" r="11"/>
          <circle cx="75" cy="62" r="11"/>
          <path d="M62 61 L66 61"/>
        </g>
        <path d="M42 61 L36 63" stroke="#e2e8f0" stroke-width="2"/>
        <path d="M86 61 L92 63" stroke="#e2e8f0" stroke-width="2"/>
        <path d="M46 56 L55 50" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
        <path d="M49 60 L57 54" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
        <path d="M63 66 L65 69 L62 69" stroke="#d49b7e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M59 75 Q65 77 71 74" stroke="#b91c1c" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-geek-specs)"/>
        <path d="M56 16 Q62 36 66 50 Q61 43 59 32 Z" fill="url(#hair-geek-specs)"/>
        <path d="M47 18 Q52 38 55 50 Q50 43 48 33 Z" fill="url(#hair-geek-specs)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#c084fc" stroke-width="2.4" stroke-linecap="round" opacity="0.65" fill="none"/>
      </g>
    </svg>`),
  },

  // 6. outdoor-sun
  {
    id: 'outdoor-sun',
    label: 'アウトドア',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-outdoor-sun" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ea580c"/>
          <stop offset="100%" stop-color="#7c2d12"/>
        </linearGradient>
        <linearGradient id="skin-outdoor-sun" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ffe6d6"/>
          <stop offset="100%" stop-color="#f5c7ad"/>
        </linearGradient>
        <radialGradient id="blush-outdoor-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#f97316" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#f97316" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-outdoor-sun" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#78350f"/>
          <stop offset="100%" stop-color="#451a03"/>
        </linearGradient>
        <linearGradient id="jacket-outdoor-sun" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#4d7c0f"/>
          <stop offset="100%" stop-color="#1e3a10"/>
        </linearGradient>
        <linearGradient id="iris-outdoor-sun" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#84cc16"/>
          <stop offset="100%" stop-color="#3f6212"/>
        </linearGradient>
        <clipPath id="clip-outdoor-sun">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-outdoor-sun)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#fdba74" stroke-opacity="0.4" stroke-width="1.5"/>

      <g clip-path="url(#clip-outdoor-sun)">
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#jacket-outdoor-sun)"/>
        <path d="M42 91 C42 85 52 83 64 83 C76 83 86 85 86 91 L82 99 C76 93 70 91 64 91 C58 91 52 93 46 99 Z" fill="#d97706"/>
        <path d="M64 91 L64 128" stroke="#ffffff" stroke-width="1.6" stroke-dasharray="2,2"/>
        <rect x="62" y="93" width="4" height="6" rx="1" fill="#facc15"/>
        <path d="M53 72 L53 92 L75 92 L75 72 Z" fill="url(#skin-outdoor-sun)"/>
        <path d="M53 72 Q64 83 75 72 L75 79 Q64 88 53 79 Z" fill="#e2ab8e"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-outdoor-sun)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-outdoor-sun)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-outdoor-sun)"/>
        <circle cx="44" cy="69" r="7" fill="url(#blush-outdoor-sun)"/>
        <circle cx="84" cy="69" r="7" fill="url(#blush-outdoor-sun)"/>
        <rect x="74" y="67" width="9" height="4.5" rx="1.5" transform="rotate(-15 74 67)" fill="#fbbf24" stroke="#d97706" stroke-width="0.8"/>
        <circle cx="77" cy="68.5" r="0.6" fill="#d97706"/>
        <circle cx="80" cy="67.5" r="0.6" fill="#d97706"/>
        <path d="M43 49 Q52 45 59 49" stroke="#451a03" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M69 49 Q76 45 85 49" stroke="#451a03" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M45 57 Q53 53 60 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="61.5" rx="5" ry="5.8" fill="url(#iris-outdoor-sun)"/>
        <circle cx="53" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="51.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="54.8" cy="63" r="1" fill="#bef264"/>
        <path d="M48 66 Q53 67.5 58 66" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M68 57 Q75 53 83 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="61.5" rx="5" ry="5.8" fill="url(#iris-outdoor-sun)"/>
        <circle cx="75" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="73.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="76.8" cy="63" r="1" fill="#bef264"/>
        <path d="M70 66 Q75 67.5 80 66" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M63 66 L65 69 L62 69" stroke="#d49b7e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M56 73 Q64 83 72 73 Z" fill="#b91c1c"/>
        <path d="M58 73 Q64 77 70 73" fill="#ffffff"/>
        <path d="M35 50 C37 57 38 65 40 70 C38 63 36 56 35 50 Z" fill="url(#hair-outdoor-sun)"/>
        <path d="M93 50 C91 57 90 65 88 70 C90 63 92 56 93 50 Z" fill="url(#hair-outdoor-sun)"/>
        <path d="M45 44 Q49 53 52 57 Q51 49 48 44 Z" fill="url(#hair-outdoor-sun)"/>
        <path d="M57 43 Q60 52 63 56 Q63 48 60 42 Z" fill="url(#hair-outdoor-sun)"/>
        <path d="M72 44 Q75 53 78 57 Q76 49 74 43 Z" fill="url(#hair-outdoor-sun)"/>
        <path d="M36 40 C38 18 50 14 64 14 C78 14 90 18 92 40 Z" fill="#d4b996"/>
        <path d="M35 34 C44 32 84 32 93 34 L94 40 C84 38 44 38 34 40 Z" fill="#4d7c0f"/>
        <path d="M22 41 C34 36 94 36 106 41 C100 49 76 52 64 52 C52 52 28 49 22 41 Z" fill="#c4a57b"/>
        <path d="M24 42 C36 39 92 39 104 42 C100 47 76 50 64 50 C52 50 28 47 24 42 Z" fill="#d4b996"/>
        <path d="M38 48 C40 66 46 80 50 90" stroke="#fef08a" stroke-width="1.5" stroke-dasharray="2,2" fill="none"/>
        <path d="M90 48 C88 66 82 80 78 90" stroke="#fef08a" stroke-width="1.5" stroke-dasharray="2,2" fill="none"/>
        <circle cx="64" cy="91" r="3" fill="#ea580c"/>
      </g>
    </svg>`),
  },

  // 7. music-boy
  {
    id: 'music-boy',
    label: 'ミュージック',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-music-boy" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4f46e5"/>
          <stop offset="100%" stop-color="#1e1b4b"/>
        </linearGradient>
        <radialGradient id="glow-music-boy" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#ec4899" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#ec4899" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-music-boy" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ffe6d6"/>
          <stop offset="100%" stop-color="#f5c7ad"/>
        </linearGradient>
        <radialGradient id="blush-music-boy" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#f43f5e" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-music-boy" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#64748b"/>
          <stop offset="100%" stop-color="#334155"/>
        </linearGradient>
        <linearGradient id="hoodie-music-boy" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#312e81"/>
          <stop offset="100%" stop-color="#1e1b4b"/>
        </linearGradient>
        <linearGradient id="iris-music-boy" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ec4899"/>
          <stop offset="100%" stop-color="#831843"/>
        </linearGradient>
        <clipPath id="clip-music-boy">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-music-boy)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-music-boy)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#818cf8" stroke-opacity="0.35" stroke-width="1.5"/>
      <path d="M22 36 Q25 28 32 30 L32 40 M32 35 L26 36" stroke="#f472b6" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.6"/>
      <circle cx="25" cy="41" r="2.5" fill="#f472b6" opacity="0.6"/>
      <path d="M102 28 Q105 20 112 22 L112 32 M112 27 L106 28" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.6"/>
      <circle cx="105" cy="33" r="2.5" fill="#38bdf8" opacity="0.6"/>

      <g clip-path="url(#clip-music-boy)">
        <path d="M26 55 C24 24 44 12 64 12 C84 12 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-music-boy)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#hoodie-music-boy)"/>
        <g fill="#ec4899" opacity="0.7">
          <rect x="52" y="106" width="2" height="12" rx="1"/>
          <rect x="56" y="102" width="2" height="16" rx="1"/>
          <rect x="60" y="99" width="2" height="19" rx="1"/>
          <rect x="64" y="96" width="2" height="22" rx="1"/>
          <rect x="68" y="101" width="2" height="17" rx="1"/>
          <rect x="72" y="105" width="2" height="13" rx="1"/>
          <rect x="76" y="109" width="2" height="9" rx="1"/>
        </g>
        <path d="M53 72 L53 92 L75 92 L75 72 Z" fill="url(#skin-music-boy)"/>
        <path d="M53 72 Q64 83 75 72 L75 80 Q64 89 53 80 Z" fill="#e2ab8e"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-music-boy)"/>
        <circle cx="44" cy="69" r="6.5" fill="url(#blush-music-boy)"/>
        <circle cx="84" cy="69" r="6.5" fill="url(#blush-music-boy)"/>
        <path d="M43 49 Q52 47 59 51" stroke="#334155" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M69 51 Q76 47 85 49" stroke="#334155" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M45 58 Q53 55 60 58" stroke="#0f172a" stroke-width="3" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="62" rx="5" ry="5.2" fill="url(#iris-music-boy)"/>
        <circle cx="53" cy="62" r="2.2" fill="#090d16"/>
        <circle cx="51.2" cy="60" r="1.6" fill="#ffffff"/>
        <circle cx="54.8" cy="63.5" r="0.9" fill="#fbcfe8"/>
        <path d="M68 58 Q75 55 83 58" stroke="#0f172a" stroke-width="3" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="62" rx="5" ry="5.2" fill="url(#iris-music-boy)"/>
        <circle cx="75" cy="62" r="2.2" fill="#090d16"/>
        <circle cx="73.2" cy="60" r="1.6" fill="#ffffff"/>
        <circle cx="76.8" cy="63.5" r="0.9" fill="#fbcfe8"/>
        <path d="M63 66 L65 69 L62 69" stroke="#d49b7e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M58 74 Q64 78 70 74" stroke="#be185d" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-music-boy)"/>
        <path d="M57 16 Q62 36 65 50 Q60 43 58 32 Z" fill="url(#hair-music-boy)"/>
        <path d="M47 18 Q52 38 55 50 Q50 43 48 33 Z" fill="url(#hair-music-boy)"/>
        <path d="M72 19 Q77 38 82 49 Q76 43 73 33 Z" fill="url(#hair-music-boy)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#e0e7ff" stroke-width="2.4" stroke-linecap="round" opacity="0.6" fill="none"/>
        <path d="M30 60 C24 26 42 10 64 10 C86 10 104 26 98 60" stroke="#1e293b" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M42 20 C52 15 76 15 86 20" stroke="#ec4899" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="27" y="55" width="11" height="21" rx="5.5" fill="#0f172a" stroke="#ec4899" stroke-width="1.5"/>
        <circle cx="32.5" cy="65.5" r="3.5" fill="#1e293b"/>
        <circle cx="32.5" cy="65.5" r="1.5" fill="#ec4899"/>
        <rect x="90" y="55" width="11" height="21" rx="5.5" fill="#0f172a" stroke="#ec4899" stroke-width="1.5"/>
        <circle cx="95.5" cy="65.5" r="3.5" fill="#1e293b"/>
        <circle cx="95.5" cy="65.5" r="1.5" fill="#ec4899"/>
      </g>
    </svg>`),
  },

  // 8. soft-boy
  {
    id: 'soft-boy',
    label: 'ソフト',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-soft-boy" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fb7185"/>
          <stop offset="100%" stop-color="#9f1239"/>
        </linearGradient>
        <radialGradient id="glow-soft-boy" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#ffe4e6" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#ffe4e6" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-soft-boy" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#fff1f2"/>
          <stop offset="100%" stop-color="#fecdd3"/>
        </linearGradient>
        <radialGradient id="blush-soft-boy" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#f43f5e" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-soft-boy" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7c4d3d"/>
          <stop offset="100%" stop-color="#4a2820"/>
        </linearGradient>
        <linearGradient id="sweater-soft-boy" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ffe4e6"/>
          <stop offset="100%" stop-color="#f43f5e"/>
        </linearGradient>
        <linearGradient id="iris-soft-boy" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#f43f5e"/>
          <stop offset="100%" stop-color="#881337"/>
        </linearGradient>
        <clipPath id="clip-soft-boy">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-soft-boy)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-soft-boy)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#fda4af" stroke-opacity="0.4" stroke-width="1.5"/>
      <path d="M25 40 L26.5 35 L28 40 L33 41.5 L28 43 L26.5 48 L25 43 L20 41.5 Z" fill="#ffffff" opacity="0.6"/>
      <path d="M104 32 L105 28 L106 32 L110 33 L106 34 L105 38 L104 34 L100 33 Z" fill="#ffffff" opacity="0.6"/>

      <g clip-path="url(#clip-soft-boy)">
        <path d="M26 55 C24 24 44 12 64 12 C84 12 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-soft-boy)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#sweater-soft-boy)"/>
        <path d="M42 88 C42 82 50 80 64 80 C78 80 86 82 86 88 C86 96 78 100 64 100 C50 100 42 96 42 88 Z" fill="#ffe4e6" stroke="#fb7185" stroke-width="1.2"/>
        <path d="M48 88 C48 90 55 95 64 95 C73 95 80 90 80 88" stroke="#f43f5e" stroke-width="1" fill="none"/>
        <path d="M53 72 L53 90 L75 90 L75 72 Z" fill="url(#skin-soft-boy)"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-soft-boy)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#f43f5e" stroke-width="1" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-soft-boy)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#f43f5e" stroke-width="1" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-soft-boy)"/>
        <circle cx="44" cy="69" r="8.5" fill="url(#blush-soft-boy)"/>
        <circle cx="84" cy="69" r="8.5" fill="url(#blush-soft-boy)"/>
        <path d="M43 50 Q52 47 59 51" stroke="#4a2820" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M69 51 Q76 47 85 50" stroke="#4a2820" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M45 57 Q53 53 60 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="61.5" rx="5.2" ry="6" fill="url(#iris-soft-boy)"/>
        <circle cx="53" cy="61.5" r="2.4" fill="#4c0519"/>
        <circle cx="51" cy="59" r="2" fill="#ffffff"/>
        <circle cx="55" cy="63.5" r="1.1" fill="#ffe4e6"/>
        <path d="M48 66 Q53 67.8 58 66" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M68 57 Q75 53 83 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="61.5" rx="5.2" ry="6" fill="url(#iris-soft-boy)"/>
        <circle cx="75" cy="61.5" r="2.4" fill="#4c0519"/>
        <circle cx="73" cy="59" r="2" fill="#ffffff"/>
        <circle cx="77" cy="63.5" r="1.1" fill="#ffe4e6"/>
        <path d="M70 66 Q75 67.8 80 66" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <circle cx="64" cy="67.5" r="1" fill="#fb7185"/>
        <path d="M58 74 Q64 80 70 74" stroke="#e11d48" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-soft-boy)"/>
        <path d="M54 16 Q61 36 63 50 Q58 43 56 32 Z" fill="url(#hair-soft-boy)"/>
        <path d="M68 17 Q72 36 76 49 Q71 42 68 32 Z" fill="url(#hair-soft-boy)"/>
        <path d="M44 19 Q48 38 50 49 Q47 42 45 33 Z" fill="url(#hair-soft-boy)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#fbcfe8" stroke-width="2.4" stroke-linecap="round" opacity="0.7" fill="none"/>
      </g>
    </svg>`),
  },

  // 9. denim-lad
  {
    id: 'denim-lad',
    label: 'デニム',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-denim-lad" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0284c7"/>
          <stop offset="100%" stop-color="#0c4a6e"/>
        </linearGradient>
        <radialGradient id="glow-denim-lad" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-denim-lad" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#ffe6d6"/>
          <stop offset="100%" stop-color="#f5c7ad"/>
        </linearGradient>
        <radialGradient id="blush-denim-lad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#f43f5e" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-denim-lad" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#382218"/>
          <stop offset="100%" stop-color="#1c0f0a"/>
        </linearGradient>
        <linearGradient id="denim-denim-lad" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#2563eb"/>
          <stop offset="100%" stop-color="#1d4ed8"/>
        </linearGradient>
        <linearGradient id="iris-denim-lad" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#0ea5e9"/>
          <stop offset="100%" stop-color="#0369a1"/>
        </linearGradient>
        <clipPath id="clip-denim-lad">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-denim-lad)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-denim-lad)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1.5"/>

      <g clip-path="url(#clip-denim-lad)">
        <path d="M26 55 C24 24 44 12 64 12 C84 12 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-denim-lad)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#denim-denim-lad)"/>
        <path d="M50 91 L64 110 L78 91 Z" fill="#ffffff"/>
        <path d="M36 91 L52 91 L64 108 L48 108 Z" fill="#1e40af"/>
        <path d="M38 92 L50 92 L62 106 L50 106 Z" stroke="#d97706" stroke-width="1" stroke-dasharray="2,2" fill="none"/>
        <path d="M92 91 L76 91 L64 108 L80 108 Z" fill="#1e40af"/>
        <path d="M90 92 L78 92 L66 106 L78 106 Z" stroke="#d97706" stroke-width="1" stroke-dasharray="2,2" fill="none"/>
        <circle cx="64" cy="118" r="2.5" fill="#d97706" stroke="#78350f" stroke-width="0.8"/>
        <path d="M53 72 L53 92 L75 92 L75 72 Z" fill="url(#skin-denim-lad)"/>
        <path d="M53 72 Q64 83 75 72 L75 80 Q64 89 53 80 Z" fill="#e2ab8e"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-denim-lad)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-denim-lad)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#d49b7e" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-denim-lad)"/>
        <circle cx="44" cy="69" r="6" fill="url(#blush-denim-lad)"/>
        <circle cx="84" cy="69" r="6" fill="url(#blush-denim-lad)"/>
        <path d="M43 48 Q52 45 59 49" stroke="#1c0f0a" stroke-width="2.6" stroke-linecap="round" fill="none"/>
        <path d="M69 49 Q76 45 85 48" stroke="#1c0f0a" stroke-width="2.6" stroke-linecap="round" fill="none"/>
        <path d="M45 57 Q53 53 60 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="61.5" rx="5" ry="5.8" fill="url(#iris-denim-lad)"/>
        <circle cx="53" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="51.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="54.8" cy="63" r="1" fill="#7dd3fc"/>
        <path d="M48 66 Q53 67.5 58 66" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M68 57 Q75 53 83 57" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="61.5" rx="5" ry="5.8" fill="url(#iris-denim-lad)"/>
        <circle cx="75" cy="61.5" r="2.4" fill="#090d16"/>
        <circle cx="73.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="76.8" cy="63" r="1" fill="#7dd3fc"/>
        <path d="M70 66 Q75 67.5 80 66" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M63 66 L65 69 L62 69" stroke="#d49b7e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M57 74 Q64 80 71 74" stroke="#b91c1c" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-denim-lad)"/>
        <path d="M56 16 Q62 36 66 50 Q61 43 59 32 Z" fill="url(#hair-denim-lad)"/>
        <path d="M47 18 Q52 38 55 50 Q50 43 48 33 Z" fill="url(#hair-denim-lad)"/>
        <path d="M72 19 Q77 38 82 49 Q76 43 73 33 Z" fill="url(#hair-denim-lad)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#7dd3fc" stroke-width="2.4" stroke-linecap="round" opacity="0.6" fill="none"/>
      </g>
    </svg>`),
  },

  // 10. night-owl
  {
    id: 'night-owl',
    label: 'ナイト',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-night-owl" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e1b4b"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
        <radialGradient id="glow-night-owl" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#818cf8" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#818cf8" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-night-owl" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#fdf2f8"/>
          <stop offset="100%" stop-color="#f5d0fe"/>
        </linearGradient>
        <radialGradient id="blush-night-owl" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#a855f7" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-night-owl" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#241e3d"/>
          <stop offset="100%" stop-color="#0f0b1f"/>
        </linearGradient>
        <linearGradient id="hoodie-night-owl" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#312e81"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <linearGradient id="iris-night-owl" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#818cf8"/>
          <stop offset="100%" stop-color="#3730a3"/>
        </linearGradient>
        <clipPath id="clip-night-owl">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-night-owl)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-night-owl)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#a5b4fc" stroke-opacity="0.35" stroke-width="1.5"/>
      <path d="M102 18 C97 18 92 23 92 29 C92 35 97 40 103 40 C101 38 100 34 100 30 C100 25 101 20 102 18 Z" fill="#fef08a" opacity="0.85"/>
      <path d="M22 28 L23 25 L24 28 L27 29 L24 30 L23 33 L22 30 L19 29 Z" fill="#ffffff" opacity="0.8"/>
      <circle cx="34" cy="18" r="1" fill="#ffffff" opacity="0.7"/>
      <circle cx="15" cy="46" r="1.2" fill="#c7d2fe" opacity="0.6"/>
      <circle cx="112" cy="48" r="1" fill="#fef08a" opacity="0.7"/>

      <g clip-path="url(#clip-night-owl)">
        <path d="M26 55 C24 24 44 12 64 12 C84 12 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-night-owl)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#hoodie-night-owl)"/>
        <path d="M42 91 C42 84 50 82 64 82 C78 82 86 84 86 91 C86 98 76 103 64 103 C52 103 42 98 42 91 Z" fill="#1e1b4b" stroke="#6366f1" stroke-width="1.2"/>
        <path d="M74 96 C72 96 70 98 70 100 C70 102 72 104 74 104 C73 103 73 101 73 100 C73 98 73 97 74 96 Z" fill="#fef08a"/>
        <path d="M53 72 L53 92 L75 92 L75 72 Z" fill="url(#skin-night-owl)"/>
        <path d="M53 72 Q64 83 75 72 L75 80 Q64 89 53 80 Z" fill="#d8b4fe"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-night-owl)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#c084fc" stroke-width="1.2" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-night-owl)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#c084fc" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-night-owl)"/>
        <circle cx="44" cy="69" r="6" fill="url(#blush-night-owl)"/>
        <circle cx="84" cy="69" r="6" fill="url(#blush-night-owl)"/>
        <path d="M43 50 Q52 47 59 51" stroke="#241e3d" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M69 51 Q76 47 85 50" stroke="#241e3d" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M45 57 Q53 54 60 57" stroke="#0f172a" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="61.5" rx="5" ry="5.6" fill="url(#iris-night-owl)"/>
        <circle cx="53" cy="61.5" r="2.4" fill="#020617"/>
        <circle cx="51.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="54.8" cy="63" r="1" fill="#fef08a"/>
        <path d="M48 66 Q53 67.5 58 66" stroke="#0f172a" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M68 57 Q75 54 83 57" stroke="#0f172a" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="61.5" rx="5" ry="5.6" fill="url(#iris-night-owl)"/>
        <circle cx="75" cy="61.5" r="2.4" fill="#020617"/>
        <circle cx="73.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="76.8" cy="63" r="1" fill="#fef08a"/>
        <path d="M70 66 Q75 67.5 80 66" stroke="#0f172a" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M63 66 L65 69 L62 69" stroke="#c084fc" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M58 74 Q64 78 70 74" stroke="#9333ea" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-night-owl)"/>
        <path d="M57 16 Q62 36 65 50 Q60 43 58 32 Z" fill="url(#hair-night-owl)"/>
        <path d="M47 18 Q52 38 55 50 Q50 43 48 33 Z" fill="url(#hair-night-owl)"/>
        <path d="M72 19 Q77 38 82 49 Q76 43 73 33 Z" fill="url(#hair-night-owl)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#c7d2fe" stroke-width="2.4" stroke-linecap="round" opacity="0.65" fill="none"/>
      </g>
    </svg>`),
  },

  // 11. sunny-kid
  {
    id: 'sunny-kid',
    label: 'サニー',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-sunny-kid" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#b45309"/>
        </linearGradient>
        <radialGradient id="glow-sunny-kid" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#fef08a" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#fef08a" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-sunny-kid" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#fffbeb"/>
          <stop offset="100%" stop-color="#fde68a"/>
        </linearGradient>
        <radialGradient id="blush-sunny-kid" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#f97316" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#f97316" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-sunny-kid" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#b45309"/>
        </linearGradient>
        <linearGradient id="varsity-sunny-kid" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
        <linearGradient id="iris-sunny-kid" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#78350f"/>
        </linearGradient>
        <clipPath id="clip-sunny-kid">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-sunny-kid)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-sunny-kid)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#fef08a" stroke-opacity="0.5" stroke-width="1.5"/>
      <path d="M64 6 L64 12 M64 116 L64 122 M6 64 L12 64 M116 64 L122 64" stroke="#fef08a" stroke-width="2" stroke-linecap="round" opacity="0.6"/>

      <g clip-path="url(#clip-sunny-kid)">
        <path d="M26 52 C24 24 44 10 64 10 C84 10 104 24 102 52 C104 68 98 74 94 76 L94 45 L34 45 L34 76 C30 74 24 68 26 52 Z" fill="url(#hair-sunny-kid)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#varsity-sunny-kid)"/>
        <path d="M12 128 C12 112 24 104 36 100 L32 128 Z" fill="#ffffff"/>
        <path d="M116 128 C116 112 104 104 92 100 L96 128 Z" fill="#ffffff"/>
        <path d="M44 91 C44 85 52 83 64 83 C76 83 84 85 84 91 L80 97 C76 92 70 90 64 90 C58 90 52 92 48 97 Z" fill="#1e293b"/>
        <path d="M48 95 C52 91 58 89 64 89 C70 89 76 91 80 95" stroke="#ffffff" stroke-width="1.5" fill="none"/>
        <path d="M53 72 L53 92 L75 92 L75 72 Z" fill="url(#skin-sunny-kid)"/>
        <path d="M53 72 Q64 83 75 72 L75 79 Q64 88 53 79 Z" fill="#fcd34d"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-sunny-kid)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#f59e0b" stroke-width="1.2" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-sunny-kid)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#f59e0b" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-sunny-kid)"/>
        <circle cx="44" cy="69" r="8" fill="url(#blush-sunny-kid)"/>
        <circle cx="84" cy="69" r="8" fill="url(#blush-sunny-kid)"/>
        <path d="M43 48 Q52 44 59 48" stroke="#78350f" stroke-width="2.6" stroke-linecap="round" fill="none"/>
        <path d="M69 48 Q76 44 85 48" stroke="#78350f" stroke-width="2.6" stroke-linecap="round" fill="none"/>
        <path d="M45 56 Q53 52 60 56" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="60.5" rx="5.2" ry="6" fill="url(#iris-sunny-kid)"/>
        <circle cx="53" cy="60.5" r="2.4" fill="#451a03"/>
        <circle cx="51" cy="58" r="2" fill="#ffffff"/>
        <circle cx="55" cy="62.5" r="1.1" fill="#fef08a"/>
        <path d="M48 65 Q53 66.8 58 65" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M68 56 Q75 52 83 56" stroke="#1c1917" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="60.5" rx="5.2" ry="6" fill="url(#iris-sunny-kid)"/>
        <circle cx="75" cy="60.5" r="2.4" fill="#451a03"/>
        <circle cx="73" cy="58" r="2" fill="#ffffff"/>
        <circle cx="77" cy="62.5" r="1.1" fill="#fef08a"/>
        <path d="M70 65 Q75 66.8 80 65" stroke="#1c1917" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M63 65 L65 68 L62 68" stroke="#f59e0b" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M55 72 Q64 85 73 72 Z" fill="#b91c1c"/>
        <path d="M57 72 Q64 77 71 72" fill="#ffffff"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-sunny-kid)"/>
        <path d="M58 14 Q64 34 67 48 Q62 41 60 30 Z" fill="url(#hair-sunny-kid)"/>
        <path d="M47 16 Q53 37 56 49 Q51 40 48 31 Z" fill="url(#hair-sunny-kid)"/>
        <path d="M71 18 Q77 37 81 48 Q75 40 72 32 Z" fill="url(#hair-sunny-kid)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#fef08a" stroke-width="2.6" stroke-linecap="round" opacity="0.8" fill="none"/>
      </g>
    </svg>`),
  },

  // 12. mint-fresh
  {
    id: 'mint-fresh',
    label: 'ミント',
    src: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg-mint-fresh" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#10b981"/>
          <stop offset="100%" stop-color="#064e3b"/>
        </linearGradient>
        <radialGradient id="glow-mint-fresh" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#a7f3d0" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#a7f3d0" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skin-mint-fresh" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#f0fdf4"/>
          <stop offset="100%" stop-color="#dcfce7"/>
        </linearGradient>
        <radialGradient id="blush-mint-fresh" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hair-mint-fresh" x1="0" y1="0" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#134e4a"/>
          <stop offset="100%" stop-color="#042f2e"/>
        </linearGradient>
        <linearGradient id="polo-mint-fresh" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#34d399"/>
          <stop offset="100%" stop-color="#059669"/>
        </linearGradient>
        <linearGradient id="iris-mint-fresh" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stop-color="#34d399"/>
          <stop offset="100%" stop-color="#047857"/>
        </linearGradient>
        <clipPath id="clip-mint-fresh">
          <circle cx="64" cy="64" r="63"/>
        </clipPath>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#bg-mint-fresh)"/>
      <circle cx="64" cy="48" r="48" fill="url(#glow-mint-fresh)"/>
      <circle cx="64" cy="64" r="63" fill="none" stroke="#6ee7b7" stroke-opacity="0.4" stroke-width="1.5"/>
      <path d="M22 34 C25 28 32 30 30 36 C28 40 24 38 22 34 Z" fill="#a7f3d0" opacity="0.6"/>
      <path d="M106 26 C109 20 116 22 114 28 C112 32 108 30 106 26 Z" fill="#a7f3d0" opacity="0.6"/>

      <g clip-path="url(#clip-mint-fresh)">
        <path d="M26 55 C24 24 44 12 64 12 C84 12 104 24 102 55 C104 72 96 78 92 80 L92 48 L36 48 L36 80 C32 78 24 72 26 55 Z" fill="url(#hair-mint-fresh)"/>
        <path d="M12 128 C12 102 32 91 50 91 L78 91 C96 91 116 102 116 128 Z" fill="url(#polo-mint-fresh)"/>
        <path d="M42 91 L56 91 L64 106 L48 106 Z" fill="#ffffff"/>
        <path d="M86 91 L72 91 L64 106 L80 106 Z" fill="#ffffff"/>
        <path d="M64 106 L64 128" stroke="#047857" stroke-width="1.5"/>
        <path d="M53 72 L53 92 L75 92 L75 72 Z" fill="url(#skin-mint-fresh)"/>
        <path d="M53 72 Q64 83 75 72 L75 80 Q64 89 53 80 Z" fill="#a7f3d0"/>
        <ellipse cx="36" cy="65" rx="5" ry="7.5" fill="url(#skin-mint-fresh)"/>
        <path d="M35 62 Q33 65 36 68" stroke="#6ee7b7" stroke-width="1.2" fill="none"/>
        <ellipse cx="92" cy="65" rx="5" ry="7.5" fill="url(#skin-mint-fresh)"/>
        <path d="M93 62 Q95 65 92 68" stroke="#6ee7b7" stroke-width="1.2" fill="none"/>
        <path d="M38 52 C38 34 49 28 64 28 C79 28 90 34 90 52 C90 69 80 83 64 83 C48 83 38 69 38 52 Z" fill="url(#skin-mint-fresh)"/>
        <circle cx="44" cy="69" r="6" fill="url(#blush-mint-fresh)"/>
        <circle cx="84" cy="69" r="6" fill="url(#blush-mint-fresh)"/>
        <path d="M43 49 Q52 46 59 50" stroke="#042f2e" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M69 50 Q76 46 85 49" stroke="#042f2e" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M45 57 Q53 53 60 57" stroke="#042f2e" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="53" cy="61.5" rx="5" ry="5.8" fill="url(#iris-mint-fresh)"/>
        <circle cx="53" cy="61.5" r="2.4" fill="#022c22"/>
        <circle cx="51.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="54.8" cy="63" r="1" fill="#a7f3d0"/>
        <path d="M48 66 Q53 67.5 58 66" stroke="#042f2e" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M68 57 Q75 53 83 57" stroke="#042f2e" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="75" cy="61.5" rx="5" ry="5.8" fill="url(#iris-mint-fresh)"/>
        <circle cx="75" cy="61.5" r="2.4" fill="#022c22"/>
        <circle cx="73.2" cy="59.2" r="1.8" fill="#ffffff"/>
        <circle cx="76.8" cy="63" r="1" fill="#a7f3d0"/>
        <path d="M70 66 Q75 67.5 80 66" stroke="#042f2e" stroke-width="1.2" stroke-linecap="round" fill="none"/>
        <path d="M63 66 L65 69 L62 69" stroke="#6ee7b7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M57 74 Q64 79 71 74" stroke="#047857" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M28 48 C27 24 44 14 64 14 C84 14 101 24 100 48 C96 48 94 54 94 62 C94 68 91 74 88 74 C90 62 88 52 88 52 C84 46 80 46 76 52 C73 45 68 44 64 51 C60 44 54 44 50 51 C46 45 42 46 38 53 C38 60 36 68 38 74 C35 74 32 68 32 62 C32 54 30 48 28 48 Z" fill="url(#hair-mint-fresh)"/>
        <path d="M57 16 Q62 36 65 50 Q60 43 58 32 Z" fill="url(#hair-mint-fresh)"/>
        <path d="M47 18 Q52 38 55 50 Q50 43 48 33 Z" fill="url(#hair-mint-fresh)"/>
        <path d="M72 19 Q77 38 82 49 Q76 43 73 33 Z" fill="url(#hair-mint-fresh)"/>
        <path d="M44 24 C50 20 58 20 64 23 M68 23 C74 20 82 20 88 24" stroke="#6ee7b7" stroke-width="2.4" stroke-linecap="round" opacity="0.7" fill="none"/>
      </g>
    </svg>`),
  },
]

export const AVATAR_PRESET_BY_ID = Object.fromEntries(
  AVATAR_PRESETS.map((preset) => [preset.id, preset]),
)

export function getAvatarPresetSrc(presetId) {
  const id = String(presetId || '').trim()
  return AVATAR_PRESET_BY_ID[id]?.src || ''
}
