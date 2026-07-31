/** Parse [mm:ss.xx] or [m:ss] timestamp to seconds */
export function parseTimestamp(raw) {
  const match = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const fraction = match[3] ? Number(match[3].padEnd(3, '0')) / 1000 : 0
  return minutes * 60 + seconds + fraction
}

export function formatTimestamp(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0)
  const minutes = Math.floor(safe / 60)
  const seconds = Math.floor(safe % 60)
  const hundredths = Math.floor((safe % 1) * 100)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

/**
 * Supported paste formats:
 * 1) [00:12.00] 日本語
 *    English line
 *
 * 2) [00:12.00] 日本語 | English
 */
export function parseLyricsText(rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n').trim()
  if (!text) return { lines: [] }

  const lines = []
  const chunks = text.split(/\n\s*\n/)

  for (const chunk of chunks) {
    const rows = chunk.split('\n').map((row) => row.trim()).filter(Boolean)
    if (rows.length === 0) continue

    const timed = rows[0].match(/^\[([^\]]+)\]\s*(.*)$/)
    if (!timed) continue

    const t = parseTimestamp(timed[1])
    if (t == null) continue

    let ja = (timed[2] || '').trim()
    let en = ''

    if (ja.includes('|')) {
      const parts = ja.split('|')
      ja = parts[0].trim()
      en = parts.slice(1).join('|').trim()
    } else if (rows[1]) {
      en = rows[1].trim()
    }

    if (!ja && !en) continue
    lines.push({ t, ja, en })
  }

  // Also accept contiguous LRC without blank lines between timed rows
  if (lines.length === 0) {
    const rawRows = text.split('\n').map((row) => row.trim()).filter(Boolean)
    let pending = null
    for (const row of rawRows) {
      const timed = row.match(/^\[([^\]]+)\]\s*(.*)$/)
      if (timed) {
        if (pending && (pending.ja || pending.en)) lines.push(pending)
        const t = parseTimestamp(timed[1])
        if (t == null) {
          pending = null
          continue
        }
        let ja = (timed[2] || '').trim()
        let en = ''
        if (ja.includes('|')) {
          const parts = ja.split('|')
          ja = parts[0].trim()
          en = parts.slice(1).join('|').trim()
        }
        pending = { t, ja, en }
      } else if (pending && !pending.en) {
        pending.en = row
      }
    }
    if (pending && (pending.ja || pending.en)) lines.push(pending)
  }

  lines.sort((a, b) => a.t - b.t)
  return { lines }
}

export function serializeLyrics(lyrics) {
  const rows = Array.isArray(lyrics?.lines) ? lyrics.lines : []
  return rows
    .map((line) => {
      const stamp = `[${formatTimestamp(line.t)}]`
      const ja = (line.ja || '').trim()
      const en = (line.en || '').trim()
      if (en) return `${stamp} ${ja}\n${en}`
      return `${stamp} ${ja}`
    })
    .join('\n\n')
}

export function getActiveLyricIndex(lines, currentTime) {
  if (!Array.isArray(lines) || lines.length === 0) return -1
  const time = Number(currentTime) || 0
  let active = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].t <= time + 0.05) active = index
    else break
  }
  return active
}

export function normalizeStoredLyrics(lyrics) {
  if (!lyrics || !Array.isArray(lyrics.lines)) return null
  const lines = lyrics.lines
    .map((line) => ({
      t: Number(line.t) || 0,
      ja: String(line.ja || '').trim(),
      en: String(line.en || '').trim(),
    }))
    .filter((line) => line.ja || line.en)
    .sort((a, b) => a.t - b.t)
  if (lines.length === 0) return null
  return { lines }
}

/** Pick one lyric line for postcard: current line if playing, else first meaningful line. */
export function pickPostcardLyric(lyrics, currentTime = 0) {
  const normalized = normalizeStoredLyrics(lyrics)
  const lines = normalized?.lines || []
  if (lines.length === 0) return { ja: '', en: '' }
  const activeIndex = getActiveLyricIndex(lines, currentTime)
  const line = activeIndex >= 0 ? lines[activeIndex] : lines[0]
  return {
    ja: line.ja || '',
    en: line.en || '',
  }
}
