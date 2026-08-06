/** Site-wide seasonal themes (Admin-controlled via shared-state). */

export const SITE_THEME_DEFAULT = 'default'

export const SITE_THEMES = [
  {
    id: 'default',
    label: 'デフォルト',
    kicker: 'Everyday',
    description: 'いつもの夜のメディアスペース',
    themeColor: '#0b1220',
    preview: ['#05070d', '#3b82f6', '#e89aaa'],
  },
  {
    id: 'natsu',
    label: '夏・盆・花火大会',
    kicker: 'Natsu Matsuri',
    description: '花火・盆灯籠・ほたる・風鈴・金魚すくいの夏まつり',
    themeColor: '#070e1c',
    preview: ['#07101f', '#ffd24a', '#ff3b2e'],
  },
]

export function normalizeSiteThemeId(value) {
  const id = String(value || '').trim()
  return SITE_THEMES.some((theme) => theme.id === id) ? id : SITE_THEME_DEFAULT
}

export function getSiteTheme(themeId) {
  const id = normalizeSiteThemeId(themeId)
  return SITE_THEMES.find((theme) => theme.id === id) || SITE_THEMES[0]
}

/** Apply theme to <html> so CSS + meta theme-color update everywhere. */
export function applySiteTheme(themeId) {
  if (typeof document === 'undefined') return SITE_THEME_DEFAULT
  const theme = getSiteTheme(themeId)
  document.documentElement.dataset.siteTheme = theme.id
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme.themeColor)
  return theme.id
}

let appearanceUnsub = null

/**
 * Start listening for Admin theme changes. Safe to call once at boot.
 * @param {(themeId: string) => void} [onChange]
 */
export function bootstrapSiteTheme(onChange) {
  applySiteTheme(SITE_THEME_DEFAULT)
  // Lazy import avoids circular init issues with firebase.js
  import('./firebase.js')
    .then(({ subscribeSiteAppearance }) => {
      if (appearanceUnsub) appearanceUnsub()
      appearanceUnsub = subscribeSiteAppearance(
        (appearance) => {
          const id = applySiteTheme(appearance?.themeId)
          onChange?.(id)
        },
        () => {
          applySiteTheme(SITE_THEME_DEFAULT)
          onChange?.(SITE_THEME_DEFAULT)
        },
      )
    })
    .catch(() => {
      applySiteTheme(SITE_THEME_DEFAULT)
      onChange?.(SITE_THEME_DEFAULT)
    })

  return () => {
    if (appearanceUnsub) {
      appearanceUnsub()
      appearanceUnsub = null
    }
  }
}
