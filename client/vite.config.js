import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

function createBuildId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readReleaseMeta(rootDir) {
  const metaPath = resolve(rootDir, '.release-meta.json')
  if (!existsSync(metaPath)) return {}
  try {
    const raw = JSON.parse(readFileSync(metaPath, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

/** Emit version.json and stamp sw.js so home-screen PWAs can detect deploys. */
function appBuildVersionPlugin() {
  let buildId = createBuildId()
  let outDir = 'dist'
  let projectRoot = process.cwd()

  return {
    name: 'app-build-version',
    config() {
      buildId = createBuildId()
      return {
        define: {
          __APP_BUILD_ID__: JSON.stringify(buildId),
        },
      }
    },
    configResolved(config) {
      outDir = config.build.outDir || 'dist'
      projectRoot = config.root || process.cwd()
    },
    closeBundle() {
      const root = resolve(outDir)
      const meta = readReleaseMeta(projectRoot)
      const payload = {
        version: buildId,
        builtAt: new Date().toISOString(),
        notes: String(meta.notes || '').trim() || null,
        previousVersion: String(meta.previousVersion || '').trim() || null,
        previousHostingVersionId: String(meta.previousHostingVersionId || '').trim() || null,
      }
      writeFileSync(resolve(root, 'version.json'), `${JSON.stringify(payload, null, 2)}\n`)

      const swPath = resolve(root, 'sw.js')
      if (existsSync(swPath)) {
        const current = readFileSync(swPath, 'utf8')
        const stamped = current.replace(/^\/\* build:[^*]+\*\/\r?\n/, '')
        writeFileSync(swPath, `/* build:${buildId} */\n${stamped}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), appBuildVersionPlugin()],
})
