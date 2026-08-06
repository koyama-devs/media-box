/**
 * Boy-leaning character avatar presets (inline SVG data URLs).
 * Soft flat illustration, warm palette — no external assets.
 */
function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`
}

function makeBoyAvatar({
  id,
  bg,
  hair,
  skin = '#f3c7a4',
  shirt,
  accent,
  glasses = false,
  blush = false,
  smile = 'soft',
}) {
  const mouth = smile === 'grin'
    ? '<path d="M52 78 q12 12 24 0" fill="none" stroke="#c45c4a" stroke-width="3.2" stroke-linecap="round"/>'
    : smile === 'smirk'
      ? '<path d="M58 78 q10 8 20 -2" fill="none" stroke="#c45c4a" stroke-width="3" stroke-linecap="round"/>'
      : '<path d="M56 78 q8 7 16 0" fill="none" stroke="#c45c4a" stroke-width="3" stroke-linecap="round"/>'
  const blushMarks = blush
    ? '<circle cx="42" cy="72" r="5" fill="#f0a0a8" opacity=".55"/><circle cx="86" cy="72" r="5" fill="#f0a0a8" opacity=".55"/>'
    : ''
  const glassesSvg = glasses
    ? `<g fill="none" stroke="${accent}" stroke-width="2.4">
        <circle cx="48" cy="62" r="9"/><circle cx="80" cy="62" r="9"/>
        <path d="M57 62h14" stroke-linecap="round"/>
      </g>`
    : ''
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="${bg}"/>
  <ellipse cx="64" cy="108" rx="34" ry="22" fill="${shirt}"/>
  <circle cx="64" cy="58" r="30" fill="${skin}"/>
  <path d="${hair}" fill="${accent}"/>
  <circle cx="50" cy="62" r="3.2" fill="#2a211c"/>
  <circle cx="78" cy="62" r="3.2" fill="#2a211c"/>
  ${blushMarks}
  ${mouth}
  ${glassesSvg}
</svg>`
  return { id, src: svgDataUrl(svg) }
}

export const AVATAR_PRESETS = [
  {
    ...makeBoyAvatar({
      id: 'cool-hoodie',
      bg: '#2c3448',
      hair: 'M34 48c2-18 18-28 30-28s28 10 30 28c-8-8-18-10-30-8-12-2-22 0-30 8z',
      shirt: '#3d4f6f',
      accent: '#1f2433',
      glasses: true,
      smile: 'smirk',
    }),
    label: 'クール',
  },
  {
    ...makeBoyAvatar({
      id: 'sporty-cap',
      bg: '#3a5f4a',
      hair: 'M36 52c4-16 16-24 28-24s24 8 28 24H36z',
      shirt: '#4f8f6a',
      accent: '#e85d4c',
      smile: 'grin',
    }),
    label: 'スポーティ',
  },
  {
    ...makeBoyAvatar({
      id: 'gentle-smile',
      bg: '#f0e2d0',
      hair: 'M32 50c6-20 20-30 32-30s26 10 32 30c-10-6-20-8-32-6-12-2-22 0-32 6z',
      shirt: '#d9b48a',
      accent: '#5c4030',
      blush: true,
      smile: 'soft',
    }),
    label: 'やさしい',
  },
  {
    ...makeBoyAvatar({
      id: 'casual-tee',
      bg: '#e8f0f6',
      hair: 'M34 46c4-16 18-26 30-26s26 10 30 26c-8-4-18-6-30-4-12-2-22 0-30 4z',
      shirt: '#6ba3c9',
      accent: '#3a2f28',
      smile: 'soft',
    }),
    label: 'カジュアル',
  },
  {
    ...makeBoyAvatar({
      id: 'geek-specs',
      bg: '#efe6f4',
      hair: 'M36 48c2-14 14-24 28-24s26 10 28 24c-6-6-16-8-28-6-12-2-22 0-28 6z',
      shirt: '#8b7bb8',
      accent: '#4a3f5c',
      glasses: true,
      smile: 'soft',
    }),
    label: 'ギーク',
  },
  {
    ...makeBoyAvatar({
      id: 'outdoor-sun',
      bg: '#f6e2b8',
      hair: 'M34 50c6-18 18-28 30-28s24 10 30 28c-10-8-20-10-30-8-10-2-20 0-30 8z',
      shirt: '#d98b4a',
      accent: '#6b4423',
      smile: 'grin',
    }),
    label: 'アウトドア',
  },
  {
    ...makeBoyAvatar({
      id: 'music-boy',
      bg: '#243044',
      hair: 'M32 44c8-18 22-28 32-28s24 10 32 28c-10-4-20-6-32-4-12-2-22 0-32 4z',
      shirt: '#c45c4a',
      accent: '#1a1520',
      smile: 'smirk',
    }),
    label: 'ミュージック',
  },
  {
    ...makeBoyAvatar({
      id: 'soft-boy',
      bg: '#f8e8ec',
      hair: 'M34 48c6-18 18-28 30-28s26 10 30 28c-8-6-18-8-30-6-12-2-22 0-30 6z',
      shirt: '#e8a0b0',
      accent: '#7a4a58',
      blush: true,
      smile: 'soft',
    }),
    label: 'ソフト',
  },
  {
    ...makeBoyAvatar({
      id: 'denim-lad',
      bg: '#dce6f0',
      hair: 'M36 50c2-16 16-26 28-26s26 10 28 26c-6-6-16-8-28-6-12-2-20 0-28 6z',
      shirt: '#4a6fa5',
      accent: '#2f241c',
      smile: 'soft',
    }),
    label: 'デニム',
  },
  {
    ...makeBoyAvatar({
      id: 'night-owl',
      bg: '#1e2433',
      hair: 'M34 46c4-16 18-26 30-26s26 10 30 26c-8-6-18-8-30-6-12-2-22 0-30 6z',
      shirt: '#5a6a8a',
      accent: '#12161f',
      glasses: true,
      smile: 'smirk',
    }),
    label: 'ナイト',
  },
  {
    ...makeBoyAvatar({
      id: 'sunny-kid',
      bg: '#fff3d6',
      hair: 'M34 48c8-20 20-30 30-30s22 10 30 30c-10-8-20-10-30-8-10-2-20 0-30 8z',
      shirt: '#f0c14a',
      accent: '#8a5a28',
      blush: true,
      smile: 'grin',
    }),
    label: 'サニー',
  },
  {
    ...makeBoyAvatar({
      id: 'mint-fresh',
      bg: '#dff3ea',
      hair: 'M36 50c4-16 16-26 28-26s24 10 28 26c-8-6-16-8-28-6-12-2-20 0-28 6z',
      shirt: '#5bb89a',
      accent: '#3a2f28',
      smile: 'soft',
    }),
    label: 'ミント',
  },
]

export const AVATAR_PRESET_BY_ID = Object.fromEntries(
  AVATAR_PRESETS.map((preset) => [preset.id, preset]),
)

export function getAvatarPresetSrc(presetId) {
  const id = String(presetId || '').trim()
  return AVATAR_PRESET_BY_ID[id]?.src || ''
}
