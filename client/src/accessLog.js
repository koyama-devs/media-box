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
  if (/cros/i.test(ua)) return 'ChromeOS'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Other'
}

function detectDeviceName(ua = '', hints = null) {
  const hintModel = String(hints?.model || '').trim()
  if (hintModel) return hintModel.slice(0, 80)

  if (/iphone/i.test(ua)) return 'iPhone'
  if (/ipad/i.test(ua)) return 'iPad'
  if (/ipod/i.test(ua)) return 'iPod'

  const samsung = ua.match(/\b(SM-[A-Z0-9]+)\b/i)
  if (samsung) return samsung[1]

  const pixel = ua.match(/\b(Pixel[^;)/\s]*)/i)
  if (pixel) return pixel[1].trim()

  const androidDevice = ua.match(/\((?:Linux;\s*)?Android [^;]+;\s*([^);]+)\)/i)
  if (androidDevice?.[1]) {
    const raw = androidDevice[1]
      .replace(/\s+Build\/.*$/i, '')
      .replace(/wv$/i, '')
      .trim()
    if (raw && !/^Android$/i.test(raw) && raw.length < 60) return raw
  }

  if (/cros/i.test(ua)) return 'Chromebook'
  if (/windows nt/i.test(ua)) return 'Windows PC'
  if (/macintosh|mac os x/i.test(ua)) return 'Mac'
  if (/android/i.test(ua)) return 'Android device'
  if (/linux/i.test(ua)) return 'Linux PC'
  return 'Unknown device'
}

async function readClientHints() {
  const uaData = navigator.userAgentData
  if (!uaData?.getHighEntropyValues) return null
  try {
    const values = await uaData.getHighEntropyValues(['model', 'platform', 'platformVersion'])
    return {
      model: values.model || '',
      platform: values.platform || '',
      platformVersion: values.platformVersion || '',
    }
  } catch {
    return null
  }
}

function emptyGeo() {
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
}

async function fetchJson(url, timeoutMs = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`geo http ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function normalizeGeo(partial = {}) {
  const country = partial.country || null
  const countryCode = partial.countryCode || null
  if (!country && !countryCode && !partial.ip) return null
  return {
    ip: partial.ip || null,
    city: partial.city || null,
    region: partial.region || null,
    country,
    countryCode,
    latitude: typeof partial.latitude === 'number' ? partial.latitude : null,
    longitude: typeof partial.longitude === 'number' ? partial.longitude : null,
    org: partial.org || null,
  }
}

async function fetchGeoFromIpwho() {
  const data = await fetchJson('https://ipwho.is/')
  if (data?.success === false) throw new Error('ipwho failed')
  return normalizeGeo({
    ip: data.ip,
    city: data.city,
    region: data.region,
    country: data.country,
    countryCode: data.country_code,
    latitude: data.latitude,
    longitude: data.longitude,
    org: data.connection?.isp || data.connection?.org || null,
  })
}

async function fetchGeoFromGeoJs() {
  const data = await fetchJson('https://get.geojs.io/v1/ip/geo.json')
  return normalizeGeo({
    ip: data.ip,
    city: data.city,
    region: data.region,
    country: data.country,
    countryCode: data.country_code,
    latitude: data.latitude != null ? Number(data.latitude) : null,
    longitude: data.longitude != null ? Number(data.longitude) : null,
    org: data.organization || null,
  })
}

async function fetchGeoFromIpApiCo() {
  const data = await fetchJson('https://ipapi.co/json/')
  if (data?.error) throw new Error(data.reason || 'ipapi error')
  return normalizeGeo({
    ip: data.ip,
    city: data.city,
    region: data.region,
    country: data.country_name || data.country,
    countryCode: data.country_code,
    latitude: data.latitude,
    longitude: data.longitude,
    org: data.org || null,
  })
}

async function fetchGeoHint() {
  const providers = [fetchGeoFromIpwho, fetchGeoFromGeoJs, fetchGeoFromIpApiCo]
  for (const provider of providers) {
    try {
      const geo = await provider()
      if (geo?.country || geo?.countryCode || geo?.ip) return geo
    } catch {
      /* try next provider */
    }
  }
  return emptyGeo()
}

export async function buildClientAccessContext() {
  const ua = navigator.userAgent || ''
  const hints = await readClientHints()
  const deviceType = detectDeviceType(ua)
  const os = hints?.platform || detectOs(ua)

  return {
    userAgent: ua.slice(0, 500),
    deviceType,
    deviceName: detectDeviceName(ua, hints),
    browser: detectBrowser(ua),
    os,
    language: navigator.language || null,
    languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 5) : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    path: `${window.location.pathname}${window.location.search}`.slice(0, 300),
    referrer: (document.referrer || '').slice(0, 300) || null,
  }
}

function countryHintFromTimezone(timezone) {
  const map = {
    'Asia/Saigon': { country: 'Vietnam', countryCode: 'VN' },
    'Asia/Ho_Chi_Minh': { country: 'Vietnam', countryCode: 'VN' },
    'Asia/Bangkok': { country: 'Thailand', countryCode: 'TH' },
    'Asia/Tokyo': { country: 'Japan', countryCode: 'JP' },
    'Asia/Seoul': { country: 'South Korea', countryCode: 'KR' },
    'Asia/Shanghai': { country: 'China', countryCode: 'CN' },
    'Asia/Hong_Kong': { country: 'Hong Kong', countryCode: 'HK' },
    'Asia/Singapore': { country: 'Singapore', countryCode: 'SG' },
    'America/New_York': { country: 'United States', countryCode: 'US' },
    'America/Los_Angeles': { country: 'United States', countryCode: 'US' },
    'Europe/London': { country: 'United Kingdom', countryCode: 'GB' },
  }
  return map[timezone] || null
}

export async function collectAccessLogPayload() {
  const client = await buildClientAccessContext()
  let geo = await fetchGeoHint()

  if (!geo.country && !geo.countryCode) {
    const tzHint = countryHintFromTimezone(client.timezone)
    if (tzHint) {
      geo = {
        ...geo,
        country: tzHint.country,
        countryCode: tzHint.countryCode,
      }
    }
  }

  return {
    ...client,
    ...geo,
    visitedAt: new Date().toISOString(),
  }
}
