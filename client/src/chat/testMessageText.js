/** Test/junk message detection — no firebase import (Node tests + outbox reconcile). */

function normalizeAsciiTestMessageKey(text) {
  let s = String(text || '').trim()
  if (!s) return ''
  try {
    s = s.normalize('NFKC')
  } catch {
    /* ignore */
  }
  return s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).toLowerCase()
}

export function isTestChatMessageText(text) {
  const raw = String(text || '').trim()
  if (!raw || raw.length > 48) return false
  if (/^テスト\d*$/u.test(raw)) return true
  const t = normalizeAsciiTestMessageKey(raw)
  if (!t) return false
  if (t === 'test') return true
  if (/^test\d+$/.test(t)) return true
  if (/^testx\d*$/.test(t)) return true
  if (/^test[_-]?\d+$/.test(t)) return true
  if (/^test[a-z]\d*$/.test(t) && t.length <= 12) return true
  if (/^t\d+$/.test(t)) return true
  if (/^tx\d*$/.test(t) && t.length <= 8) return true
  return false
}
