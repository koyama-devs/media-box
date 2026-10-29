import { useEffect, useState } from 'react'
import { SITE_THEME_DEFAULT } from './siteTheme.js'

export function useSiteThemeId() {
  const [themeId, setThemeId] = useState(() => {
    if (typeof document === 'undefined') return SITE_THEME_DEFAULT
    return document.documentElement.dataset.siteTheme || SITE_THEME_DEFAULT
  })

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setThemeId(root.dataset.siteTheme || SITE_THEME_DEFAULT)
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['data-site-theme'] })
    return () => obs.disconnect()
  }, [])

  return themeId
}
