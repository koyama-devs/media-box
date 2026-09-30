/**
 * One-off: delete obvious Gabu (gabusan) test chat bubbles (test11, T1, …).
 *
 *   cd client/functions
 *   node ../scripts/purge-gabu-test-messages.cjs           # dry-run
 *   node ../scripts/purge-gabu-test-messages.cjs --execute # delete
 *
 * Requires Application Default Credentials (e.g. gcloud auth application-default login)
 * or GOOGLE_APPLICATION_CREDENTIALS pointing at a service account with Firestore access.
 */

const path = require('path')
module.paths.unshift(path.join(__dirname, '../functions/node_modules'))

const { initializeApp, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const PROJECT_ID = 'hana-mediabox'
const CHAT_THREADS = 'chatThreads'
const CANONICAL_THREAD = 'guest-gabusan'
const GUEST_KEY = 'gabusan'

/** Keep in sync with isTestChatMessageText in client/src/firebase.js */
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

function isTestMessageText(text) {
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

function messageBody(data) {
  const text = String(data?.text || '').trim()
  if (text) return text
  return String(data?.sticker || '').trim()
}

async function listGabuThreadIds(db) {
  const ids = new Set([CANONICAL_THREAD])
  const byKey = await db.collection(CHAT_THREADS).where('guestKey', '==', GUEST_KEY).get()
  byKey.docs.forEach((d) => ids.add(d.id))
  const canon = await db.collection(CHAT_THREADS).doc(CANONICAL_THREAD).get()
  if (canon.exists) ids.add(canon.id)
  return [...ids]
}

async function refreshThreadPreview(db, threadId) {
  const messagesRef = db.collection(CHAT_THREADS).doc(threadId).collection('messages')
  let latest = null
  try {
    const isoSnap = await messagesRef.orderBy('createdAtIso', 'desc').limit(5).get()
    for (const doc of isoSnap.docs) {
      const data = doc.data() || {}
      if (data.deleted) continue
      latest = { id: doc.id, text: String(data.text || '').slice(0, 160) }
      break
    }
  } catch {
    /* index / legacy */
  }
  if (!latest) {
    const legacySnap = await messagesRef.orderBy('createdAt', 'desc').limit(5).get()
    for (const doc of legacySnap.docs) {
      const data = doc.data() || {}
      if (data.deleted) continue
      latest = { id: doc.id, text: String(data.text || '').slice(0, 160) }
      break
    }
  }
  await db.collection(CHAT_THREADS).doc(threadId).set(
    { lastText: latest?.text || '' },
    { merge: true },
  )
}

async function purgeThread(db, threadId, execute) {
  const messagesRef = db.collection(CHAT_THREADS).doc(threadId).collection('messages')
  const snap = await messagesRef.get()
  const toDelete = []
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    if (data.deleted) continue
    const text = messageBody(data)
    if (isTestMessageText(text)) {
      toDelete.push({ id: doc.id, text })
    }
  }

  console.log(`\nThread ${threadId}: ${toDelete.length} match(es) of ${snap.size} doc(s)`)
  for (const row of toDelete) {
    console.log(`  ${execute ? 'DELETE' : 'would delete'} ${row.id} — "${row.text}"`)
  }

  if (!execute || !toDelete.length) return toDelete.length

  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch()
    const chunk = toDelete.slice(i, i + 400)
    for (const row of chunk) {
      batch.delete(messagesRef.doc(row.id))
    }
    await batch.commit()
  }
  await refreshThreadPreview(db, threadId)
  return toDelete.length
}

async function main() {
  const execute = process.argv.includes('--execute')
  if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID })
  }
  const db = getFirestore()

  console.log(execute ? 'EXECUTE — deleting from Firestore' : 'DRY-RUN — pass --execute to delete')
  const threadIds = await listGabuThreadIds(db)
  console.log(`Gabu threads: ${threadIds.join(', ')}`)

  let total = 0
  for (const threadId of threadIds) {
    total += await purgeThread(db, threadId, execute)
  }
  console.log(`\nTotal: ${total} message(s) ${execute ? 'deleted' : 'would be deleted'}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
