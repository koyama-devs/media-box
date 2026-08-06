import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AdminApp from './AdminApp.jsx'
import App from './App.jsx'
import { prepareAppLaunch } from './appUpdate.js'
import { bootstrapSiteTheme } from './siteTheme.js'
import './index.css'

function isAdminPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return path === '/admin'
}

async function boot() {
  const rootEl = document.getElementById('root')
  if (rootEl && !rootEl.dataset.booting) {
    rootEl.dataset.booting = '1'
    rootEl.textContent = '更新を確認中…'
  }

  bootstrapSiteTheme()
  await prepareAppLaunch()

  createRoot(rootEl).render(
    <StrictMode>
      {isAdminPath() ? <AdminApp /> : <App />}
    </StrictMode>,
  )
}

void boot()
