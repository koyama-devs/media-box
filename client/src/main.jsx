import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AdminApp from './AdminApp.jsx'
import App from './App.jsx'
import { prepareAppLaunch } from './appUpdate.js'
import './index.css'
import { bootstrapSiteTheme } from './siteTheme.js'

function isAdminPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return path === '/admin'
}

async function boot() {
  const rootEl = document.getElementById('root')
  if (rootEl) {
    rootEl.dataset.booting = '1'
    rootEl.textContent = ''
    rootEl.style.visibility = 'hidden'
  }

  bootstrapSiteTheme()
  await prepareAppLaunch()

  if (rootEl) {
    rootEl.style.visibility = ''
  }

  createRoot(rootEl).render(
    <StrictMode>
      {isAdminPath() ? <AdminApp /> : <App />}
    </StrictMode>,
  )
}

void boot()
