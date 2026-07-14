// Access logging helpers (visitor device / geo / time)
function detectDeviceType(ua = '') {
  const value = ua.toLowerCase()
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(value)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/.test(value)) return 'mobile'
  return 'desktop'
}

function detectBrowser(ua = '') {
  if (/edg\//i.test(ua)) return 'Edge'
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return 'Opera'
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return 'Chrome'
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return 'Safari'
  if (/firefox\//i.test(ua)) return 'Firefox'
  return 'Other'
}

function detectOs(ua = '') {
  if (/windows nt/i.test(ua)) return 'Windows'
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  if (/mac os x/i.test(ua)) return 'macOS'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Other'
}

async function fetchGeoHint() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch('https://ipapi.co/json/', { signal: controller.signal })
    if (!response.ok) throw new Error('geo failed')
    const data = await response.json()
    return {
      ip: data.ip || null,
      city: data.city || null,
      region: data.region || null,
      country: data.country_name || data.country || null,
      countryCode: data.country_code || null,
      latitude: typeof data.latitude === 'number' ? data.latitude : null,
      longitude: typeof data.longitude === 'number' ? data.longitude : null,
      org: data.org || null,
    }
  } catch {
    return {
      ip: null,
      city: null,
      region: null,
      country: null,
      countryCode: null,
      latitude: null,
      longitude: null,
      org: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

export function buildClientAccessContext() {
  const ua = navigator.userAgent || ''
  return {
    userAgent: ua.slice(0, 500),
    deviceType: detectDeviceType(ua),
    browser: detectBrowser(ua),
    os: detectOs(ua),
    language: navigator.language || null,
    languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 5) : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    path: `${window.location.pathname}${window.location.search}`.slice(0, 300),
    referrer: (document.referrer || '').slice(0, 300) || null,
  }
}

export async function collectAccessLogPayload() {
  const client = buildClientAccessContext()
  const geo = await fetchGeoHint()
  return {
    ...client,
    ...geo,
    visitedAt: new Date().toISOString(),
  }
}
