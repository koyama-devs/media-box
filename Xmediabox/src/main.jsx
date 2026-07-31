import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminApp from './AdminApp.jsx'

function isAdminPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return path === '/admin'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdminPath() ? <AdminApp /> : <App />}
  </StrictMode>,
)
