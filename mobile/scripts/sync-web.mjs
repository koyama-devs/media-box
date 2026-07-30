/**
 * One-way sync: client/dist → mobile/www
 * Never writes back into client/.
 */
import { spawnSync } from 'node:child_process'
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mobileRoot = resolve(__dirname, '..')
const repoRoot = resolve(mobileRoot, '..')
const clientRoot = join(repoRoot, 'client')
const distDir = join(clientRoot, 'dist')
const wwwDir = join(mobileRoot, 'www')
const bridgeSrc = join(mobileRoot, 'native-bridge', 'capacitor-bridge.js')
const bridgeDestName = 'capacitor-bridge.js'

const shouldBuild = process.argv.includes('--build')

function fail(message) {
  console.error(`[sync-web] ${message}`)
  process.exit(1)
}

if (shouldBuild) {
  console.log('[sync-web] Building client…')
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'build'],
    { cwd: clientRoot, stdio: 'inherit', shell: true },
  )
  if (result.status !== 0) fail('client build failed')
}

if (!existsSync(distDir)) {
  fail(
    `Missing ${distDir}. Run \`npm run build\` in client/ first, or use \`npm run sync:web:build\`.`,
  )
}

if (!existsSync(bridgeSrc)) {
  fail(`Missing bridge script: ${bridgeSrc}`)
}

console.log('[sync-web] Copying client/dist → mobile/www …')
rmSync(wwwDir, { recursive: true, force: true })
mkdirSync(wwwDir, { recursive: true })
cpSync(distDir, wwwDir, { recursive: true })

const bridgeDest = join(wwwDir, bridgeDestName)
writeFileSync(bridgeDest, readFileSync(bridgeSrc))

const indexPath = join(wwwDir, 'index.html')
if (!existsSync(indexPath)) fail('www/index.html missing after copy')

let html = readFileSync(indexPath, 'utf8')
const bridgeTag = `<script src="/${bridgeDestName}" defer></script>`
if (!html.includes(bridgeDestName)) {
  if (html.includes('</head>')) {
    html = html.replace('</head>', `  ${bridgeTag}\n</head>`)
  } else if (html.includes('</body>')) {
    html = html.replace('</body>', `  ${bridgeTag}\n</body>`)
  } else {
    html += `\n${bridgeTag}\n`
  }
  writeFileSync(indexPath, html)
  console.log('[sync-web] Injected capacitor-bridge.js into index.html')
} else {
  console.log('[sync-web] Bridge already present in index.html')
}

console.log('[sync-web] Done. www is ready for `npx cap sync`.')
