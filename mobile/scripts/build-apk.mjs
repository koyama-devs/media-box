/**
 * Build Android APK and copy to mobile/apk-out/ with a timestamped filename.
 *
 * Usage:
 *   node scripts/build-apk.mjs                 # debug APK
 *   node scripts/build-apk.mjs --release       # release APK
 *   node scripts/build-apk.mjs --sync          # sync www then APK
 *   node scripts/build-apk.mjs --sync --build  # build client + sync + APK
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mobileRoot = resolve(__dirname, '..')
const androidRoot = resolve(mobileRoot, 'android')
const outDir = resolve(mobileRoot, 'apk-out')

function parseArgs(argv) {
  return {
    release: argv.includes('--release'),
    sync: argv.includes('--sync'),
    build: argv.includes('--build'),
  }
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`)
  }
}

function findNewestApk(dir) {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.apk'))
    .map((name) => {
      const full = join(dir, name)
      return { full, name, mtime: statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
  return files[0] || null
}

function main() {
  const { release, sync, build } = parseArgs(process.argv.slice(2))
  const buildType = release ? 'release' : 'debug'
  const gradleTask = release ? 'assembleRelease' : 'assembleDebug'
  const builtAt = stamp()

  if (sync || build) {
    const syncArgs = build ? ['scripts/sync-web.mjs', '--build'] : ['scripts/sync-web.mjs']
    console.log(`\n→ sync web${build ? ' (with client build)' : ''}…`)
    run('node', syncArgs, mobileRoot)
    console.log('\n→ cap sync…')
    run('npx', ['cap', 'sync', 'android'], mobileRoot)
  }

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
  console.log(`\n→ gradle ${gradleTask}…`)
  run(gradlew, [gradleTask, '--console=plain'], androidRoot)

  const apkDir = join(androidRoot, 'app', 'build', 'outputs', 'apk', buildType)
  const newest = findNewestApk(apkDir)
  if (!newest) {
    throw new Error(`No APK found in ${apkDir}`)
  }

  mkdirSync(outDir, { recursive: true })

  // Keep Gradle stamp if present; otherwise add timestamp on copy.
  const targetName = /-\d{8}-\d{6}\.apk$/i.test(newest.name)
    ? newest.name
    : `hana-mediabox-1.0-${buildType}-${builtAt}.apk`
  const target = join(outDir, targetName)
  copyFileSync(newest.full, target)

  console.log('\n✔ APK ready')
  console.log(`  source: ${newest.full}`)
  console.log(`  output: ${target}`)
}

main()
