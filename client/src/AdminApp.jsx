import { useEffect, useMemo, useState } from 'react'
import {
  completeAdminRedirectLogin,
  getFirebaseErrorMessage,
  loginAdmin,
  loginAdminWithGoogle,
  logoutAdmin,
  subscribeToAccessLogs,
  subscribeToAdminAuth,
} from './firebase'
import './Admin.css'

function formatVisitTime(value) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date)
  } catch {
    return String(value)
  }
}

function formatPlace(log) {
  const parts = [log.city, log.region, log.country].filter(Boolean)
  return parts.length ? parts.join(', ') : '不明'
}

function deviceLabel(type) {
  if (type === 'mobile') return 'モバイル'
  if (type === 'tablet') return 'タブレット'
  if (type === 'desktop') return 'デスクトップ'
  return type || '—'
}

function startOfTodayIso() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

function GoogleIcon() {
  return (
    <svg className="admin-google-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function AdminLogin({ onLoggedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    completeAdminRedirectLogin()
      .then((user) => {
        if (active && user) onLoggedIn?.()
      })
      .catch((redirectError) => {
        if (active) setError(getFirebaseErrorMessage(redirectError))
      })
    return () => {
      active = false
    }
  }, [onLoggedIn])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await loginAdmin(email, password)
      onLoggedIn?.()
    } catch (loginError) {
      setError(getFirebaseErrorMessage(loginError))
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    setBusy(true)
    setError('')
    try {
      const user = await loginAdminWithGoogle()
      if (user) onLoggedIn?.()
    } catch (loginError) {
      setError(getFirebaseErrorMessage(loginError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-shell">
      <div className="admin-card admin-login-card">
        <p className="admin-kicker">Hana Media Box</p>
        <h1>管理ログイン</h1>
        <p className="admin-lead">アクセスログとサイト状況を確認します。</p>

        <button type="button" className="admin-google" onClick={handleGoogle} disabled={busy}>
          <GoogleIcon />
          {busy ? '確認中…' : 'Googleでログイン'}
        </button>

        <div className="admin-divider" aria-hidden="true">
          <span>または</span>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="admin-field">
            <span>メールアドレス</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="admin-field">
            <span>パスワード</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="admin-error">{error}</p> : null}

          <button type="submit" className="admin-primary" disabled={busy}>
            {busy ? '確認中…' : 'メールでログイン'}
          </button>
        </form>

        <p className="admin-hint">
          Firebase Authentication で Google と Email/Password を有効にしてください。
          自分の Google だけ許可する場合は <code>ADMIN_EMAIL_ALLOWLIST</code> にメールを追加します。
        </p>
        <a className="admin-back" href="/">サイトへ戻る</a>
      </div>
    </div>
  )
}

function AdminDashboard({ user }) {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('all')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToAccessLogs(
      (next) => {
        setLogs(next)
        setError('')
      },
      (subscribeError) => {
        console.error(subscribeError)
        setError(getFirebaseErrorMessage(subscribeError) || 'ログの読み込みに失敗しました。')
      },
    )
    return unsubscribe
  }, [])

  const filteredLogs = useMemo(() => {
    if (deviceFilter === 'all') return logs
    return logs.filter((log) => log.deviceType === deviceFilter)
  }, [logs, deviceFilter])

  const stats = useMemo(() => {
    const todayStart = startOfTodayIso()
    const today = logs.filter((log) => (log.visitedAt || '') >= todayStart).length
    const mobile = logs.filter((log) => log.deviceType === 'mobile').length
    const desktop = logs.filter((log) => log.deviceType === 'desktop').length
    const countries = new Set(logs.map((log) => log.country).filter(Boolean)).size
    return {
      total: logs.length,
      today,
      mobile,
      desktop,
      countries,
    }
  }, [logs])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logoutAdmin()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="admin-shell admin-shell--wide">
      <header className="admin-topbar">
        <div>
          <p className="admin-kicker">Hana Media Box</p>
          <h1>管理ダッシュボード</h1>
          <p className="admin-lead">{user?.email || 'Admin'}</p>
        </div>
        <div className="admin-topbar-actions">
          <a className="admin-ghost" href="/">サイトを開く</a>
          <button type="button" className="admin-ghost" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? '…' : 'ログアウト'}
          </button>
        </div>
      </header>

      <section className="admin-stats">
        <article>
          <span>総アクセス</span>
          <strong>{stats.total}</strong>
        </article>
        <article>
          <span>今日</span>
          <strong>{stats.today}</strong>
        </article>
        <article>
          <span>モバイル</span>
          <strong>{stats.mobile}</strong>
        </article>
        <article>
          <span>デスクトップ</span>
          <strong>{stats.desktop}</strong>
        </article>
        <article>
          <span>国・地域</span>
          <strong>{stats.countries}</strong>
        </article>
      </section>

      <section className="admin-card admin-logs-card">
        <div className="admin-logs-header">
          <div>
            <h2>アクセスログ</h2>
            <p>直近の訪問（デバイス・場所・時刻）</p>
          </div>
          <label className="admin-filter">
            <span>デバイス</span>
            <select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)}>
              <option value="all">すべて</option>
              <option value="desktop">デスクトップ</option>
              <option value="mobile">モバイル</option>
              <option value="tablet">タブレット</option>
            </select>
          </label>
        </div>

        {error ? <p className="admin-error">{error}</p> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>時刻</th>
                <th>場所</th>
                <th>デバイス</th>
                <th>環境</th>
                <th>IP</th>
                <th>参照元</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    まだアクセスログがありません。
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="admin-cell-main">{formatVisitTime(log.visitedAt)}</div>
                      <div className="admin-cell-sub">{log.timezone || '—'}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main">{formatPlace(log)}</div>
                      <div className="admin-cell-sub">{log.countryCode || ''}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main">{deviceLabel(log.deviceType)}</div>
                      <div className="admin-cell-sub">{log.screen || '—'}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main">
                        {[log.browser, log.os].filter(Boolean).join(' / ') || '—'}
                      </div>
                      <div className="admin-cell-sub">{log.language || '—'}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main">{log.ip || '—'}</div>
                      <div className="admin-cell-sub">{log.org || ''}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main admin-cell-truncate">{log.path || '/'}</div>
                      <div className="admin-cell-sub admin-cell-truncate">{log.referrer || '直接'}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default function AdminApp() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const unsubscribe = subscribeToAdminAuth((nextUser) => {
      setUser(nextUser || null)
    })
    return unsubscribe
  }, [])

  if (user === undefined) {
    return (
      <div className="admin-shell">
        <p className="admin-loading">読み込み中…</p>
      </div>
    )
  }

  if (!user) {
    return <AdminLogin />
  }

  return <AdminDashboard user={user} />
}
