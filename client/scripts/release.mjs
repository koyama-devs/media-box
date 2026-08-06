import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const META_PATH = resolve(root, '.release-meta.json')
const HISTORY_PATH = resolve(root, 'public', 'releases-history.json')
const SITE = 'hana-mediabox'
const LIVE_VERSION_URL = `https://${SITE}.web.app/version.json`

function parseArgs(argv) {
  const out = { notes: '', notesFile: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--notes' || arg === '-n') {
      out.notes = String(argv[i + 1] || '').trim()
      i += 1
    } else if (arg === '--notes-file' || arg === '--file' || arg === '-f') {
      out.notesFile = String(argv[i + 1] || '').trim()
      i += 1
    } else if (!arg.startsWith('-') && !out.notes && !out.notesFile) {
      const candidate = String(arg || '').trim()
      // npm on Windows may drop "--notes-file" and pass only the filename.
      const asFile = resolve(process.cwd(), candidate)
      const asRootFile = resolve(root, candidate)
      if (
        /\.(txt|md)$/i.test(candidate)
        && (existsSync(asFile) || existsSync(asRootFile))
      ) {
        out.notesFile = candidate
      } else {
        out.notes = candidate
      }
    }
  }
  return out
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    stdio: opts.capture ? 'pipe' : 'inherit',
    ...opts,
  })
  if (result.status !== 0) {
    const detail = opts.capture ? (result.stderr || result.stdout || '') : ''
    throw new Error(`${cmd} ${args.join(' ')} failed${detail ? `\n${detail}` : ''}`)
  }
  return result
}

async function fetchLiveVersion() {
  try {
    const res = await fetch(`${LIVE_VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function readHistory() {
  if (!existsSync(HISTORY_PATH)) return []
  try {
    const raw = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'))
    return Array.isArray(raw?.releases) ? raw.releases : Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeHistory(releases) {
  mkdirSync(dirname(HISTORY_PATH), { recursive: true })
  const body = `${JSON.stringify({ updatedAt: new Date().toISOString(), releases }, null, 2)}\n`
  writeFileSync(HISTORY_PATH, body)
  if (existsSync(resolve(root, 'dist'))) {
    writeFileSync(resolve(root, 'dist', 'releases-history.json'), body)
  }
}

/** Current live Hosting version id via channel:list. */
function getLiveHostingVersionId() {
  const listed = spawnSync('npx', ['firebase', 'hosting:channel:list', '--site', SITE, '--json'], {
    cwd: root,
    shell: true,
    encoding: 'utf8',
  })
  if (listed.status !== 0) {
    console.warn('hosting:channel:list failed; previousHostingVersionId may be missing')
    return null
  }
  try {
    const parsed = JSON.parse(listed.stdout || '{}')
    const channels = parsed?.result?.channels || parsed?.channels || []
    const live = channels.find((ch) => String(ch?.name || '').endsWith('/channels/live'))
      || channels.find((ch) => /\/live$/i.test(String(ch?.url || '')))
      || channels[0]
    const name = live?.release?.version?.name || live?.release?.version || ''
    const id = String(name).split('/').pop() || ''
    return id || null
  } catch {
    return null
  }
}

function resolveNotes({ notes, notesFile }) {
  if (notesFile) {
    const path = resolve(process.cwd(), notesFile)
    const abs = existsSync(path) ? path : resolve(root, notesFile)
    if (!existsSync(abs)) throw new Error(`notes file not found: ${notesFile}`)
    const fromFile = readFileSync(abs, 'utf8').replace(/^\uFEFF/, '').trim()
    if (fromFile) return fromFile.replace(/\r\n/g, '\n').slice(0, 2000)
    throw new Error(`notes file is empty: ${notesFile}`)
  }

  const fromEnv = String(process.env.RELEASE_NOTES || '').trim()
  if (fromEnv) return fromEnv.slice(0, 2000)

  if (notes) {
    // Windows npm often mojibakes non-ASCII CLI args. Prefer --notes-file / RELEASE_NOTES.
    if (/[ãÂâåæçèé]/.test(notes) || /ï¿½/.test(notes)) {
      console.warn('Warning: --notes looks mojibaked. Prefer: npm run deploy -- --notes-file release-notes.txt')
    }
    return notes.slice(0, 2000)
  }

  console.error(`
Release notes are required — describe what this deploy actually fixed/changed.

Examples:
  npm run deploy -- --notes-file release-notes.txt
  npm run deploy -- --notes "Restore chat bubble link tap/open and long-press copy"

Do not omit notes. Auto git commits are not used.
`)
  process.exit(1)
  return ''
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const notes = resolveNotes(args)

  const live = await fetchLiveVersion()
  const previousVersion = String(live?.version || '').trim() || null
  const liveHostingBefore = getLiveHostingVersionId()
  const previousHostingVersionId = String(
    live?.hostingVersionId || liveHostingBefore || '',
  ).trim() || null

  const meta = {
    notes,
    previousVersion,
    previousHostingVersionId,
    preparedAt: new Date().toISOString(),
  }
  writeFileSync(META_PATH, `${JSON.stringify(meta, null, 2)}\n`)
  console.log('release meta:', meta)
  console.log('release notes:\n' + notes)

  console.log('\n→ building…')
  run('npm', ['run', 'build'])

  const distVersionPath = resolve(root, 'dist', 'version.json')
  let distVersion = {}
  if (existsSync(distVersionPath)) {
    distVersion = JSON.parse(readFileSync(distVersionPath, 'utf8'))
  }
  distVersion = {
    ...distVersion,
    notes,
    previousVersion,
    previousHostingVersionId,
  }
  writeFileSync(distVersionPath, `${JSON.stringify(distVersion, null, 2)}\n`)

  const entry = {
    version: distVersion.version,
    notes,
    builtAt: distVersion.builtAt || new Date().toISOString(),
    previousVersion,
    previousHostingVersionId,
    hostingVersionId: null,
    recordedAt: new Date().toISOString(),
  }
  const history = [entry, ...readHistory().filter((item) => item?.version !== entry.version)].slice(0, 40)
  writeHistory(history)

  console.log('\n→ deploying hosting…')
  run('npx', ['firebase', 'deploy', '--only', 'hosting'])

  const hostingVersionId = getLiveHostingVersionId()
  if (hostingVersionId) {
    entry.hostingVersionId = hostingVersionId
    distVersion.hostingVersionId = hostingVersionId
    writeFileSync(distVersionPath, `${JSON.stringify(distVersion, null, 2)}\n`)
    writeHistory([entry, ...history.slice(1)])
    console.log('\n→ uploading hostingVersionId for rollback…')
    run('npx', ['firebase', 'deploy', '--only', 'hosting'])
  } else {
    console.warn('Could not resolve hostingVersionId; rollback may need Console.')
  }

  writeFileSync(resolve(root, '.last-release.json'), `${JSON.stringify(entry, null, 2)}\n`)

  console.log('\n✔ Release complete (notes recorded)')
  console.log(`  version: ${entry.version}`)
  console.log(`  previous: ${previousVersion || '—'}`)
  console.log(`  previousHosting: ${previousHostingVersionId || '—'}`)
  console.log(`  hosting: ${hostingVersionId || '—'}`)
  console.log('  notes:', notes)
  console.log('\nAdmin → リリース tab shows this note.')
  console.log('Rollback: npm run rollback')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
