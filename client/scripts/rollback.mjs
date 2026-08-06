import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const SITE = 'hana-mediabox'
const HISTORY_PATH = resolve(root, 'public', 'releases-history.json')
const LIVE_HISTORY_URL = `https://${SITE}.web.app/releases-history.json`
const LIVE_VERSION_URL = `https://${SITE}.web.app/version.json`

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed`)
  }
}

function readLocalHistory() {
  if (!existsSync(HISTORY_PATH)) return []
  try {
    const raw = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'))
    return Array.isArray(raw?.releases) ? raw.releases : []
  } catch {
    return []
  }
}

async function fetchJson(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

async function main() {
  const forceArg = process.argv.find((arg) => arg.startsWith('--to='))
  const forceHostingId = forceArg ? forceArg.slice(5).trim() : ''

  const liveVersion = await fetchJson(LIVE_VERSION_URL)
  const liveHistory = await fetchJson(LIVE_HISTORY_URL)
  const history = Array.isArray(liveHistory?.releases)
    ? liveHistory.releases
    : readLocalHistory()

  const current = String(liveVersion?.version || history[0]?.version || '').trim()
  const targetHostingId = String(
    forceHostingId
    || liveVersion?.previousHostingVersionId
    || history[0]?.previousHostingVersionId
    || history[1]?.hostingVersionId
    || '',
  ).trim()

  const targetAppVersion = String(
    liveVersion?.previousVersion
    || history[0]?.previousVersion
    || history[1]?.version
    || '',
  ).trim()

  if (!targetHostingId) {
    console.error(`
No previous Hosting version id found.
Open Console and rollback manually:
https://console.firebase.google.com/project/hana-mediabox/hosting/sites/${SITE}

Or: npm run rollback -- --to=HOSTING_VERSION_ID
`)
    process.exit(1)
  }

  console.log('Current app version:', current || '—')
  console.log('Rollback target app version:', targetAppVersion || '—')
  console.log('Rollback target hosting version:', targetHostingId)

  console.log('\n→ cloning previous hosting version to live…')
  // Docs: SOURCE_SITE:@VERSION_ID → TARGET_SITE:CHANNEL
  run('npx', [
    'firebase',
    'hosting:clone',
    `${SITE}:@${targetHostingId}`,
    `${SITE}:live`,
  ])

  console.log('\n✔ Rollback complete')
  console.log('Hard-refresh the app (or wait for version.json check).')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
