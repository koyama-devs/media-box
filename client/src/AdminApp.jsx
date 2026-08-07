import { useCallback, useEffect, useMemo, useState } from 'react'
import './Admin.css'
import AdminHanaInbox from './AdminHanaInbox'
import NatsuAtmosphere from './NatsuAtmosphere'
import { SITE_THEMES, SITE_THEME_DEFAULT, applySiteTheme } from './siteTheme'
import {
    completeAdminRedirectLogin,
    DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES,
    fetchHostingReleases,
    fetchLiveVersionInfo,
    fetchReleasesHistoryFile,
    getFirebaseErrorMessage,
    loginAdmin,
    loginAdminWithGoogle,
    logoutAdmin,
    normalizeMessageEditWindowMinutes,
    recordAppRelease,
    rollbackHostingRelease,
    saveChatAppSettings,
    saveSiteAppearance,
    subscribeAppReleases,
    subscribeChatAppSettings,
    subscribeChatCallHistory,
    subscribeSiteAppearance,
    subscribeToAccessLogs,
    subscribeToAdminAuth,
    subscribeToMediaItems,
} from './firebase'

const TRACK_QUERY_KEY = 'track'

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
  const parts = [log.city, log.region].filter(Boolean)
  return parts.length ? parts.join(', ') : ''
}

function formatCountry(log) {
  if (log.country) return log.country
  if (log.countryCode) return log.countryCode
  return '不明'
}

function deviceLabel(type) {
  if (type === 'mobile') return 'モバイル'
  if (type === 'tablet') return 'タブレット'
  if (type === 'desktop') return 'デスクトップ'
  return type || '—'
}

function formatDeviceName(log) {
  if (log.deviceName) return log.deviceName
  if (log.os === 'iOS' || /iphone/i.test(log.userAgent || '')) return 'iPhone'
  if (/ipad/i.test(log.userAgent || '')) return 'iPad'
  if (log.os === 'Windows') return 'Windows PC'
  if (log.os === 'macOS') return 'Mac'
  if (log.os === 'Android') return 'Android device'
  return deviceLabel(log.deviceType)
}

function startOfTodayIso() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDayBounds(dateValue) {
  if (!dateValue) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  if (!year || !month || !day) return null
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)
  const end = new Date(year, month - 1, day, 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

function countryKey(log) {
  return log.country || log.countryCode || '不明'
}

/** Extract media track id from access log path (e.g. /?track=abc). */
function trackIdFromPath(pathValue) {
  const raw = String(pathValue || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw, window.location.origin)
    return String(url.searchParams.get(TRACK_QUERY_KEY) || '').trim()
  } catch {
    const match = raw.match(/[?&]track=([^&#]+)/i)
    return match ? decodeURIComponent(match[1]).trim() : ''
  }
}

function trackOpenHref(pathValue, trackId) {
  if (trackId) return `/?${TRACK_QUERY_KEY}=${encodeURIComponent(trackId)}`
  const raw = String(pathValue || '/').trim() || '/'
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return raw.startsWith('/') ? raw : `/${raw}`
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
    <div className="admin-root">
      <div className="admin-shell admin-shell--center">
        <div className="admin-auth">
          <div className="admin-auth-brand">
            <div className="admin-brand">
              <span className="admin-brand-mark" aria-hidden="true">H</span>
              <span className="admin-brand-text">
                <strong>Hana Media Box</strong>
                <span>Admin console</span>
              </span>
            </div>
            <h1>メディアと会話を、<br />ひとつの管理画面で。</h1>
            <ul className="admin-auth-points">
              <li>アクセスログを国・デバイス・期間で絞り込み</li>
              <li>ゲスト / オーナーアカウントの発行と管理</li>
              <li>はなチャットの受信箱から直接返信</li>
            </ul>
          </div>

          <div className="admin-auth-form">
            <div>
              <p className="admin-kicker">Sign in</p>
              <h2>管理ログイン</h2>
            </div>

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
                  placeholder="you@example.com"
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              {error ? <p className="admin-error">{error}</p> : null}

              <button type="submit" className="admin-btn admin-btn--primary admin-btn--block" disabled={busy}>
                {busy ? '確認中…' : 'メールでログイン'}
              </button>
            </form>

            <p className="admin-hint">
              Firebase Authentication で Google と Email/Password を有効にしてください。
              自分の Google だけ許可する場合は <code>ADMIN_EMAIL_ALLOWLIST</code> にメールを追加します。
            </p>
            <a className="admin-back" href="/">← サイトへ戻る</a>
          </div>
        </div>
      </div>
    </div>
  )
}

const ADMIN_TABS = [
  { id: 'logs', label: 'アクセスログ', kicker: 'Analytics', lead: '訪問の内訳を国・デバイス・期間で確認します。' },
  { id: 'calls', label: '通話ログ', kicker: 'Calls', lead: '通話履歴と失敗時の技術原因を確認します。' },
  { id: 'users', label: 'ユーザー', kicker: 'Accounts', lead: 'ゲストとオーナーのアカウントを管理します。' },
  { id: 'chat', label: 'はなチャット', kicker: 'Inbox', lead: 'ゲストとのやりとりをここから返信します。' },
  { id: 'releases', label: 'リリース', kicker: 'Releases', lead: '各バージョンの変更点とロールバック情報です。' },
  { id: 'settings', label: '設定', kicker: 'Settings', lead: 'サイトテーマとチャットの共通設定を管理します。' },
]

const EDIT_WINDOW_PRESETS = [
  { minutes: 5, label: '5分' },
  { minutes: 10, label: '10分' },
  { minutes: 30, label: '30分' },
  { minutes: 0, label: '制限なし' },
]

function formatEditWindowLabel(minutes) {
  const n = normalizeMessageEditWindowMinutes(minutes)
  if (n === 0) return '制限なし（既読後もいつでも編集・削除可）'
  return `既読後 ${n} 分まで編集・削除可`
}

function formatReleaseTime(value) {
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
    }).format(date)
  } catch {
    return String(value)
  }
}

function formatCallStatus(status) {
  if (status === 'ended') return '完了'
  if (status === 'missed') return '不在'
  if (status === 'rejected') return '拒否'
  if (status === 'failed') return '失敗'
  if (status === 'ringing') return '呼出中'
  if (status === 'connected') return '接続中'
  return status || '—'
}

function formatFailCode(code) {
  if (code === 'ice_failed') return 'ICE/TURN接続失敗'
  if (code === 'permission') return 'マイク許可拒否'
  if (code === 'device') return 'マイク未検出'
  if (code === 'media') return 'メディア取得失敗'
  if (code === 'signaling') return 'シグナリング/通信'
  if (code === 'unsupported') return '端末非対応'
  if (code === 'unknown') return '不明'
  return code || '—'
}

function AdminCallHistoryPanel({ hidden = false }) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    if (hidden) return undefined
    setError('')
    return subscribeChatCallHistory(
      (list) => setRows(Array.isArray(list) ? list : []),
      (err) => setError(getFirebaseErrorMessage(err) || '通話ログの読み込みに失敗しました。'),
      { limitCount: 120 },
    )
  }, [hidden])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows
    if (statusFilter === 'failed') return rows.filter((row) => row.status === 'failed')
    return rows.filter((row) => row.status === statusFilter)
  }, [rows, statusFilter])

  const failCount = rows.filter((row) => row.status === 'failed').length

  return (
    <section className="admin-panel" hidden={hidden}>
      <div className="admin-panel-head">
        <div>
          <h2>通話ログ</h2>
          <p>
            {filtered.length.toLocaleString('ja-JP')} / {rows.length.toLocaleString('ja-JP')} 件
            {failCount ? ` · 失敗 ${failCount}` : ''}
          </p>
        </div>
        <div className="admin-panel-actions">
          <div className="admin-seg" role="group" aria-label="通話ステータス">
            {[
              { id: 'all', label: 'すべて' },
              { id: 'failed', label: '失敗' },
              { id: 'ended', label: '完了' },
              { id: 'missed', label: '不在' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={statusFilter === item.id ? 'is-active' : ''}
                onClick={() => setStatusFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error ? <p className="admin-inline-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table admin-call-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>スレッド</th>
              <th>状態</th>
              <th>時間</th>
              <th>発信</th>
              <th>技術原因</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>まだ通話ログがありません。</td>
              </tr>
            ) : filtered.map((row) => (
              <tr key={row.id || row.callId} className={row.status === 'failed' ? 'is-fail' : ''}>
                <td>{formatVisitTime(row.createdAtIso || row.endedAtIso)}</td>
                <td>
                  <code className="admin-mono">{String(row.threadId || '—')}</code>
                </td>
                <td>
                  <span className={`admin-call-status is-${row.status || 'unknown'}`}>
                    {formatCallStatus(row.status)}
                  </span>
                </td>
                <td>
                  {row.status === 'ended' && Number(row.durationSec) > 0
                    ? `${Math.floor(Number(row.durationSec) / 60)}:${String(Number(row.durationSec) % 60).padStart(2, '0')}`
                    : '—'}
                </td>
                <td>{row.callerRole === 'hana' ? 'はな' : 'ゲスト'}</td>
                <td className="admin-call-tech">
                  {row.status === 'failed' ? (
                    <>
                      <strong>{formatFailCode(row.failCode)}</strong>
                      {row.failReason ? (
                        <pre className="admin-call-reason">{row.failReason}</pre>
                      ) : (
                        <span className="admin-muted">詳細なし</span>
                      )}
                    </>
                  ) : (
                    <span className="admin-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AdminReleasesPanel({ hidden = false }) {
  const [live, setLive] = useState(null)
  const [releases, setReleases] = useState([])
  const [fileReleases, setFileReleases] = useState([])
  const [hosting, setHosting] = useState({ liveHostingVersionId: null, releases: [] })
  const [notesDraft, setNotesDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [rollingBackId, setRollingBackId] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const reloadVersionInfo = useCallback(async () => {
    const [version, history, hostingInfo] = await Promise.all([
      fetchLiveVersionInfo().catch(() => null),
      fetchReleasesHistoryFile().catch(() => []),
      fetchHostingReleases().catch((err) => {
        console.error(err)
        return { liveHostingVersionId: null, releases: [] }
      }),
    ])
    setLive(version)
    setFileReleases(Array.isArray(history) ? history : [])
    setHosting(hostingInfo || { liveHostingVersionId: null, releases: [] })
    if (version?.notes) setNotesDraft(String(version.notes))
    return { version, hostingInfo }
  }, [])

  useEffect(() => {
    if (hidden) return undefined
    let cancelled = false
    ;(async () => {
      try {
        await reloadVersionInfo()
        if (cancelled) return
        setError('')
      } catch (loadError) {
        if (!cancelled) setError(getFirebaseErrorMessage(loadError) || 'バージョン情報の取得に失敗しました。')
      }
    })()
    return () => { cancelled = true }
  }, [hidden, reloadVersionInfo])

  useEffect(() => {
    if (hidden) return undefined
    return subscribeAppReleases(
      (next) => {
        setReleases(next)
        setError('')
      },
      (subscribeError) => {
        console.error(subscribeError)
        setError(getFirebaseErrorMessage(subscribeError) || 'リリース履歴の読み込みに失敗しました。')
      },
    )
  }, [hidden])

  const notesByHostingId = useMemo(() => {
    const map = new Map()
    ;[...fileReleases, ...releases].forEach((item) => {
      const hid = String(item?.hostingVersionId || '').trim()
      if (!hid) return
      const prev = map.get(hid) || {}
      map.set(hid, {
        ...prev,
        ...item,
        notes: item.notes || prev.notes || '',
        version: item.version || prev.version || '',
      })
    })
    return map
  }, [fileReleases, releases])

  const mergedReleases = useMemo(() => {
    const map = new Map()
    ;[...fileReleases, ...releases].forEach((item) => {
      const key = String(item?.version || item?.id || '').trim()
      if (!key) return
      const prev = map.get(key) || {}
      map.set(key, {
        ...prev,
        ...item,
        version: key,
        notes: item.notes || prev.notes || '',
        builtAt: item.builtAt || item.createdAt || prev.builtAt || null,
        previousVersion: item.previousVersion || prev.previousVersion || null,
        previousHostingVersionId: item.previousHostingVersionId || prev.previousHostingVersionId || null,
        hostingVersionId: item.hostingVersionId || prev.hostingVersionId || null,
      })
    })
    return [...map.values()].sort((a, b) => {
      const ta = Date.parse(a.builtAt || a.createdAt || '') || 0
      const tb = Date.parse(b.builtAt || b.createdAt || '') || 0
      return tb - ta
    })
  }, [fileReleases, releases])

  const hostingRows = useMemo(() => {
    const rows = (hosting.releases || []).map((item, index) => {
      const meta = notesByHostingId.get(item.hostingVersionId) || {}
      const appMatch = mergedReleases.find((r) => r.hostingVersionId === item.hostingVersionId)
      return {
        ...item,
        isLive: Boolean(item.isLive) || index === 0,
        appVersion: appMatch?.version || meta.version || '',
        notes: appMatch?.notes || meta.notes || '',
      }
    })
    return rows
  }, [hosting.releases, notesByHostingId, mergedReleases])

  const previousHosting = hostingRows.find((row) => !row.isLive) || null
  const rollbackTargetApp = live?.previousVersion
    || previousHosting?.appVersion
    || mergedReleases[0]?.previousVersion
    || mergedReleases[1]?.version
    || null

  const handleRecord = async (event) => {
    event.preventDefault()
    if (!live?.version) {
      setError('現在の version.json が読めません。')
      return
    }
    setSaving(true)
    setError('')
    setStatus('')
    try {
      await recordAppRelease({
        version: live.version,
        notes: notesDraft,
        builtAt: live.builtAt || new Date().toISOString(),
        previousVersion: live.previousVersion || null,
        previousHostingVersionId: live.previousHostingVersionId || previousHosting?.hostingVersionId || null,
        hostingVersionId: live.hostingVersionId || hosting.liveHostingVersionId || null,
      })
      setStatus('リリースノートを保存しました。')
    } catch (saveError) {
      setError(getFirebaseErrorMessage(saveError) || saveError?.message || '保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  const handleRollback = async (row) => {
    const hostingVersionId = String(row?.hostingVersionId || '').trim()
    if (!hostingVersionId) {
      setError('この版の Hosting ID がありません。')
      return
    }
    if (row?.isLive || hostingVersionId === hosting.liveHostingVersionId) {
      setStatus('すでにこの版がライブです。')
      return
    }
    const label = row?.appVersion || hostingVersionId
    const ok = window.confirm(
      `ライブ版を「${label}」へロールバックしますか？\n（数秒で反映されます。あとでハードリロードしてください）`,
    )
    if (!ok) return

    setRollingBackId(hostingVersionId)
    setError('')
    setStatus('')
    try {
      const result = await rollbackHostingRelease({
        hostingVersionId,
        appVersion: row?.appVersion || '',
      })
      setStatus(result?.message || 'ロールバックしました。ページを再読み込みしてください。')
      await reloadVersionInfo()
    } catch (rollbackError) {
      console.error(rollbackError)
      setError(getFirebaseErrorMessage(rollbackError) || rollbackError?.message || 'ロールバックに失敗しました。')
    } finally {
      setRollingBackId('')
    }
  }

  return (
    <section className="admin-panel" hidden={hidden}>
      <div className="admin-panel-head">
        <div>
          <h2>バージョン管理</h2>
          <p>各リリースの変更点を確認し、問題があればワンクリックで前の版へ戻せます。</p>
        </div>
      </div>
      <div className="admin-panel-body">
        <div className="admin-settings-block">
          <div className="admin-settings-copy">
            <p className="admin-settings-label">現在のライブ版</p>
            <p className="admin-settings-current">
              アプリ版: <strong>{live?.version || '—'}</strong>
              {live?.builtAt ? ` · ${formatReleaseTime(live.builtAt)}` : ''}
            </p>
            <p className="admin-settings-hint">
              Hosting: <strong>{hosting.liveHostingVersionId || '—'}</strong>
            </p>
            {live?.notes ? (
              <p className="admin-release-live-notes">{live.notes}</p>
            ) : null}
            <p className="admin-settings-hint">
              直前の版: <strong>{rollbackTargetApp || previousHosting?.hostingVersionId || '—'}</strong>
            </p>
          </div>
          <div className="admin-release-actions">
            <button
              type="button"
              className="admin-btn admin-btn--danger"
              disabled={!previousHosting || Boolean(rollingBackId)}
              onClick={() => handleRollback(previousHosting)}
            >
              {rollingBackId && previousHosting && rollingBackId === previousHosting.hostingVersionId
                ? 'ロールバック中…'
                : '直前の版へロールバック'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={Boolean(rollingBackId)}
              onClick={() => reloadVersionInfo().catch(() => null)}
            >
              再読み込み
            </button>
          </div>
          {!previousHosting ? (
            <p className="admin-hint">ロールバック可能な過去の Hosting 版が見つかりません。</p>
          ) : (
            <p className="admin-hint">
              ボタンを押すと Firebase Hosting のライブチャンネルを直前の版へ切り替えます。
            </p>
          )}
          {status ? <p className="admin-settings-saved">{status}</p> : null}
          {error ? <p className="admin-error">{error}</p> : null}
        </div>

        <form className="admin-settings-block" onSubmit={handleRecord}>
          <div className="admin-settings-copy">
            <p className="admin-settings-label">この版のリリースノートを記録</p>
            <p className="admin-settings-hint">
              デプロイ時の notes、またはここで追記・修正できます。
            </p>
          </div>
          <textarea
            className="admin-release-notes-input"
            rows={4}
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            placeholder="例: チャット黒画面修正、アバター import 修正、アルバム ACL…"
            disabled={saving || Boolean(rollingBackId)}
          />
          <div className="admin-release-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || !notesDraft.trim() || Boolean(rollingBackId)}>
              {saving ? '保存中…' : 'ノートを保存'}
            </button>
          </div>
        </form>

        <div className="admin-release-list">
          <p className="admin-group-label">Hosting 履歴（ロールバック可）</p>
          {hostingRows.length === 0 ? (
            <p className="admin-hint">Hosting リリース一覧を取得できませんでした。Functions の権限を確認してください。</p>
          ) : (
            hostingRows.map((item) => (
              <article
                key={item.hostingVersionId}
                className={`admin-release-card${item.isLive ? ' is-live' : ''}`}
              >
                <header className="admin-release-card-head">
                  <strong>{item.appVersion || item.hostingVersionId}</strong>
                  <span>{formatReleaseTime(item.releaseTime)}</span>
                  {item.isLive ? <span className="admin-badge">LIVE</span> : null}
                </header>
                <p className="admin-release-card-notes">
                  {item.notes || (item.isLive ? (live?.notes || '（ノートなし）') : '（ノートなし）')}
                </p>
                <p className="admin-release-card-meta">
                  Hosting ID: {item.hostingVersionId}
                  {item.appVersion ? ` · app: ${item.appVersion}` : ''}
                </p>
                <div className="admin-release-actions">
                  {item.isLive ? (
                    <span className="admin-hint">現在配信中</span>
                  ) : (
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      disabled={Boolean(rollingBackId)}
                      onClick={() => handleRollback(item)}
                    >
                      {rollingBackId === item.hostingVersionId ? 'ロールバック中…' : 'この版に戻す'}
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {mergedReleases.length > 0 ? (
          <div className="admin-release-list">
            <p className="admin-group-label">アプリ版ノート履歴</p>
            {mergedReleases.map((item) => (
              <article key={item.version} className={`admin-release-card${item.version === live?.version ? ' is-live' : ''}`}>
                <header className="admin-release-card-head">
                  <strong>{item.version}</strong>
                  <span>{formatReleaseTime(item.builtAt || item.createdAt)}</span>
                  {item.version === live?.version ? <span className="admin-badge">LIVE</span> : null}
                </header>
                <p className="admin-release-card-notes">{item.notes || '（ノートなし）'}</p>
                {item.hostingVersionId ? (
                  <p className="admin-release-card-meta">Hosting: {item.hostingVersionId}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function AdminChatSettingsPanel({ hidden = false }) {
  const [minutes, setMinutes] = useState(DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES)
  const [draft, setDraft] = useState(String(DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES))
  const [ownerAssistEnabled, setOwnerAssistEnabled] = useState(true)
  const [themeId, setThemeId] = useState(SITE_THEME_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribe = subscribeChatAppSettings(
      (settings) => {
        const next = normalizeMessageEditWindowMinutes(settings?.messageEditWindowMinutes)
        setMinutes(next)
        setDraft(String(next))
        setOwnerAssistEnabled(settings?.ownerAssistEnabled !== false)
        setError('')
      },
      (subscribeError) => {
        console.error(subscribeError)
        setError(getFirebaseErrorMessage(subscribeError) || '設定の読み込みに失敗しました。')
      },
    )
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!savedFlash) return undefined
    const timer = window.setTimeout(() => setSavedFlash(false), 1800)
    return () => window.clearTimeout(timer)
  }, [savedFlash])

  const applyMinutes = async (nextMinutes) => {
    const normalized = normalizeMessageEditWindowMinutes(nextMinutes)
    setSaving(true)
    setError('')
    try {
      const saved = await saveChatAppSettings({ messageEditWindowMinutes: normalized })
      setMinutes(saved.messageEditWindowMinutes ?? normalized)
      setDraft(String(saved.messageEditWindowMinutes ?? normalized))
      if (typeof saved.ownerAssistEnabled === 'boolean') {
        setOwnerAssistEnabled(saved.ownerAssistEnabled)
      }
      setSavedFlash(true)
    } catch (saveError) {
      console.error(saveError)
      setError(getFirebaseErrorMessage(saveError) || '設定の保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }


  useEffect(() => {
    const unsubscribe = subscribeSiteAppearance(
      (appearance) => {
        const next = appearance?.themeId || SITE_THEME_DEFAULT
        setThemeId(next)
        applySiteTheme(next)
      },
      () => {
        setThemeId(SITE_THEME_DEFAULT)
        applySiteTheme(SITE_THEME_DEFAULT)
      },
    )
    return unsubscribe
  }, [])

  const applyThemeId = async (nextThemeId) => {
    setSaving(true)
    setError('')
    try {
      const saved = await saveSiteAppearance({ themeId: nextThemeId })
      const id = saved.themeId || SITE_THEME_DEFAULT
      setThemeId(id)
      applySiteTheme(id)
      setSavedFlash(true)
    } catch (saveError) {
      console.error(saveError)
      setError(getFirebaseErrorMessage(saveError) || 'テーマの保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

    const applyOwnerAssistEnabled = async (nextEnabled) => {
    setSaving(true)
    setError('')
    try {
      const saved = await saveChatAppSettings({ ownerAssistEnabled: nextEnabled })
      setOwnerAssistEnabled(saved.ownerAssistEnabled !== false)
      setSavedFlash(true)
    } catch (saveError) {
      console.error(saveError)
      setError(getFirebaseErrorMessage(saveError) || '設定の保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCustom = (event) => {
    event.preventDefault()
    void applyMinutes(draft)
  }

  return (
    <section className="admin-panel" hidden={hidden}>
      <div className="admin-panel-head">
        <div>
          <h2>チャット設定</h2>
          <p>ゲストとオーナーの両方に同じルールが適用されます。</p>
        </div>
      </div>
      <div className="admin-panel-body">
        <div className="admin-settings-block">
          <div className="admin-settings-copy">
            <p className="admin-settings-label">サイトテーマ</p>
            <p className="admin-settings-hint">
              ゲスト画面全体の雰囲気を切り替えます。夏は花火大会の夜空テーマです。
            </p>
            <p className="admin-settings-current">
              現在: <strong>{SITE_THEMES.find((t) => t.id === themeId)?.label || themeId}</strong>
              {savedFlash ? <span className="admin-settings-saved">保存しました</span> : null}
            </p>
          </div>
          <div className="admin-theme-grid" role="listbox" aria-label="サイトテーマ">
            {SITE_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                role="option"
                aria-selected={themeId === theme.id}
                className={'admin-theme-card' + (themeId === theme.id ? ' is-active' : '')}
                disabled={saving}
                onClick={() => { void applyThemeId(theme.id) }}
                style={{
                  '--theme-preview-0': theme.preview[0],
                  '--theme-preview-1': theme.preview[1],
                  '--theme-preview-2': theme.preview[2],
                }}
              >
                <span className="admin-theme-card-swatch" aria-hidden="true" />
                <span className="admin-theme-card-copy">
                  <strong>{theme.label}</strong>
                  <small>{theme.kicker}</small>
                  <em>{theme.description}</em>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="admin-settings-block">
          <div className="admin-settings-copy">
            <p className="admin-settings-label">既読後の編集・削除できる時間</p>
            <p className="admin-settings-hint">
              未読（送信済）の間は時間制限なし。既読になってからの猶予だけを設定します。
            </p>
            <p className="admin-settings-current">
              現在: <strong>{formatEditWindowLabel(minutes)}</strong>
              {savedFlash ? <span className="admin-settings-saved">保存しました</span> : null}
            </p>
          </div>

          <div className="admin-seg admin-seg--wrap" role="group" aria-label="編集・削除の時間プリセット">
            {EDIT_WINDOW_PRESETS.map((item) => (
              <button
                key={item.label}
                type="button"
                className={minutes === item.minutes ? 'is-active' : ''}
                disabled={saving}
                onClick={() => void applyMinutes(item.minutes)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <form className="admin-settings-custom" onSubmit={handleSaveCustom}>
            <label className="admin-field">
              <span>分数を指定（0 = 制限なし）</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                max={7 * 24 * 60}
                step="1"
                inputMode="numeric"
                value={draft}
                disabled={saving}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </form>

          {error ? <p className="admin-inline-error">{error}</p> : null}
        </div>

        <div className="admin-settings-block">
          <div className="admin-settings-copy">
            <p className="admin-settings-label">はな専用モード</p>
            <p className="admin-settings-hint">
              ゲストメッセージのベトナム語訳・読み・返信案をオーナー側に表示します。オフにすると Gemini 呼び出しも止まります。
            </p>
            <p className="admin-settings-current">
              現在: <strong>{ownerAssistEnabled ? 'オン' : 'オフ'}</strong>
              {savedFlash ? <span className="admin-settings-saved">保存しました</span> : null}
            </p>
          </div>
          <div className="admin-seg" role="group" aria-label="はな専用モード">
            <button
              type="button"
              className={ownerAssistEnabled ? 'is-active' : ''}
              disabled={saving || ownerAssistEnabled}
              onClick={() => { void applyOwnerAssistEnabled(true) }}
            >
              オン
            </button>
            <button
              type="button"
              className={!ownerAssistEnabled ? 'is-active' : ''}
              disabled={saving || !ownerAssistEnabled}
              onClick={() => { void applyOwnerAssistEnabled(false) }}
            >
              オフ
            </button>
          </div>
        </div>

      </div>
    </section>
  )
}

function AdminDashboard({ user }) {
  const [logs, setLogs] = useState([])
  const [mediaById, setMediaById] = useState({})
  const [error, setError] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('all')
  const [deviceNameFilter, setDeviceNameFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [tab, setTab] = useState('logs')
  const [chatUnread, setChatUnread] = useState(0)
  const [adminSiteThemeId, setAdminSiteThemeId] = useState(SITE_THEME_DEFAULT)

  useEffect(() => {
    return subscribeSiteAppearance(
      (appearance) => setAdminSiteThemeId(appearance?.themeId || SITE_THEME_DEFAULT),
      () => setAdminSiteThemeId(SITE_THEME_DEFAULT),
    )
  }, [])

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

  useEffect(() => {
    const unsubscribe = subscribeToMediaItems(
      (items) => {
        const map = {}
        for (const item of items || []) {
          if (item?.id) map[item.id] = item
        }
        setMediaById(map)
      },
      () => {},
    )
    return unsubscribe
  }, [])

  const countryOptions = useMemo(() => {
    const counts = new Map()
    logs.forEach((log) => {
      const key = countryKey(log)
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [logs])

  const deviceNameOptions = useMemo(() => {
    const counts = new Map()
    logs.forEach((log) => {
      const key = formatDeviceName(log)
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [logs])

  const filteredLogs = useMemo(() => {
    const fromBounds = localDayBounds(dateFrom)
    const toBounds = localDayBounds(dateTo)

    return logs.filter((log) => {
      if (deviceFilter !== 'all' && log.deviceType !== deviceFilter) return false
      if (deviceNameFilter !== 'all' && formatDeviceName(log) !== deviceNameFilter) return false
      if (countryFilter !== 'all' && countryKey(log) !== countryFilter) return false

      const visitedAt = log.visitedAt || ''
      if (fromBounds && visitedAt < fromBounds.start) return false
      if (toBounds && visitedAt > toBounds.end) return false
      return true
    })
  }, [logs, deviceFilter, deviceNameFilter, countryFilter, dateFrom, dateTo])

  const stats = useMemo(() => {
    const todayStart = startOfTodayIso()
    const today = logs.filter((log) => (log.visitedAt || '') >= todayStart).length
    const mobile = logs.filter((log) => log.deviceType === 'mobile').length
    const desktop = logs.filter((log) => log.deviceType === 'desktop').length
    const countries = new Set(logs.map((log) => log.country || log.countryCode).filter(Boolean)).size
    return {
      total: logs.length,
      today,
      mobile,
      desktop,
      countries,
      filtered: filteredLogs.length,
    }
  }, [logs, filteredLogs])

  const hasActiveFilters =
    deviceFilter !== 'all' ||
    deviceNameFilter !== 'all' ||
    countryFilter !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo)

  const resetFilters = () => {
    setDeviceFilter('all')
    setDeviceNameFilter('all')
    setCountryFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const setTodayRange = () => {
    const today = toDateInputValue()
    setDateFrom(today)
    setDateTo(today)
  }

  const setLast7DaysRange = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 6)
    setDateFrom(toDateInputValue(start))
    setDateTo(toDateInputValue(end))
  }

  const openChatTab = useCallback(() => {
    setTab('chat')
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logoutAdmin()
    } finally {
      setLoggingOut(false)
    }
  }

  const initial = String(user?.email || 'A').trim().charAt(0) || 'A'
  const activeTab = ADMIN_TABS.find((item) => item.id === tab)

  return (
    <div className="admin-root">
      <NatsuAtmosphere active={adminSiteThemeId === 'natsu'} />
      <div className="admin-shell">
        <header className="admin-appbar">
          <div className="admin-appbar-inner">
            <div className="admin-brand">
              <span className="admin-brand-mark" aria-hidden="true">H</span>
              <span className="admin-brand-text">
                <strong>Hana Media Box</strong>
                <span>Admin console</span>
              </span>
            </div>
            <div className="admin-appbar-right">
              <div className="admin-user-chip">
                <span className="admin-avatar-initial" aria-hidden="true">{initial}</span>
                <span>{user?.email || 'Admin'}</span>
              </div>
              <a className="admin-btn admin-btn--secondary" href="/" target="_blank" rel="noreferrer">
                サイトを開く
              </a>
              <button
                type="button"
                className="admin-btn admin-btn--icon"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-label="ログアウト"
                title="ログアウト"
              >
                {loggingOut ? '…' : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                    <path d="M15 12H9m6 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
          <nav className="admin-tabs" aria-label="セクション">
            {ADMIN_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-tab${tab === item.id ? ' is-active' : ''}`}
                aria-current={tab === item.id ? 'page' : undefined}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.id === 'chat' && chatUnread ? (
                  <span className="admin-count">{chatUnread}</span>
                ) : null}
              </button>
            ))}
          </nav>
        </header>

        <main className="admin-page">
          <div className="admin-page-head">
            <div>
              <p className="admin-kicker">{activeTab?.kicker || 'Dashboard'}</p>
              <h1>{activeTab?.label || 'ダッシュボード'}</h1>
              <p className="admin-lead">{activeTab?.lead || ''}</p>
            </div>
          </div>

          <section className="admin-stats" aria-label="サマリー" hidden={tab !== 'logs'}>
            <article className="admin-stat">
              <p className="admin-stat-label">総アクセス</p>
              <strong className="admin-stat-value">{stats.total.toLocaleString('ja-JP')}</strong>
              <p className="admin-stat-hint">記録されている全訪問</p>
            </article>
            <article className="admin-stat">
              <p className="admin-stat-label">今日</p>
              <strong className="admin-stat-value">{stats.today.toLocaleString('ja-JP')}</strong>
              <p className="admin-stat-hint">午前0時以降</p>
            </article>
            <article className="admin-stat">
              <p className="admin-stat-label">モバイル</p>
              <strong className="admin-stat-value">{stats.mobile.toLocaleString('ja-JP')}</strong>
              <p className="admin-stat-hint">
                {stats.total ? `全体の ${Math.round((stats.mobile / stats.total) * 100)}%` : '—'}
              </p>
            </article>
            <article className="admin-stat">
              <p className="admin-stat-label">デスクトップ</p>
              <strong className="admin-stat-value">{stats.desktop.toLocaleString('ja-JP')}</strong>
              <p className="admin-stat-hint">
                {stats.total ? `全体の ${Math.round((stats.desktop / stats.total) * 100)}%` : '—'}
              </p>
            </article>
            <article className="admin-stat">
              <p className="admin-stat-label">国・地域</p>
              <strong className="admin-stat-value">{stats.countries.toLocaleString('ja-JP')}</strong>
              <p className="admin-stat-hint">ユニークな国数</p>
            </article>
          </section>

          <AdminHanaInbox
            section={tab === 'users' || tab === 'chat' ? tab : 'none'}
            onUnreadChange={setChatUnread}
            onOpenChat={openChatTab}
          />

          <AdminCallHistoryPanel hidden={tab !== 'calls'} />
          <AdminChatSettingsPanel hidden={tab !== 'settings'} />
          <AdminReleasesPanel hidden={tab !== 'releases'} />

          <section className="admin-panel" hidden={tab !== 'logs'}>
            <div className="admin-panel-head">
              <div>
                <h2>アクセスログ</h2>
                <p>
                  表示中 {stats.filtered.toLocaleString('ja-JP')} / {stats.total.toLocaleString('ja-JP')} 件
                  {hasActiveFilters ? '（フィルタ適用中）' : ''}
                </p>
              </div>
              <div className="admin-panel-actions">
                <div className="admin-seg" role="group" aria-label="デバイス種別">
                  {[
                    { id: 'all', label: 'すべて' },
                    { id: 'desktop', label: 'PC' },
                    { id: 'mobile', label: 'モバイル' },
                    { id: 'tablet', label: 'タブレット' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={deviceFilter === item.id ? 'is-active' : ''}
                      onClick={() => setDeviceFilter(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="admin-toolbar">
              <div className="admin-filters">
                <label className="admin-filter">
                  <span>開始日</span>
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                </label>
                <label className="admin-filter">
                  <span>終了日</span>
                  <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                </label>
                <label className="admin-filter">
                  <span>国</span>
                  <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}>
                    <option value="all">すべて</option>
                    {countryOptions.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name} ({item.count})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-filter">
                  <span>デバイス名</span>
                  <select value={deviceNameFilter} onChange={(event) => setDeviceNameFilter(event.target.value)}>
                    <option value="all">すべて</option>
                    {deviceNameOptions.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name} ({item.count})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-filter-actions">
                <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={setTodayRange}>
                  今日
                </button>
                <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={setLast7DaysRange}>
                  直近7日
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                >
                  クリア
                </button>
              </div>
            </div>

            {error ? (
              <div className="admin-panel-body">
                <p className="admin-error">{error}</p>
              </div>
            ) : null}

            <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>時刻</th>
                <th>国</th>
                <th>デバイス名</th>
                <th>環境</th>
                <th>IP</th>
                <th>パス / 参照元</th>
                <th>楽曲</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-empty">
                    {logs.length === 0
                      ? 'まだアクセスログがありません。'
                      : '条件に一致するログがありません。'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const trackId = trackIdFromPath(log.path)
                  const trackItem = trackId ? mediaById[trackId] : null
                  const trackName = trackItem?.name || (trackId ? `(不明な楽曲 ${trackId.slice(0, 8)}…)` : '')
                  const openHref = trackOpenHref(log.path, trackId)
                  return (
                  <tr key={log.id}>
                    <td>
                      <div className="admin-cell-main admin-mono">{formatVisitTime(log.visitedAt)}</div>
                      <div className="admin-cell-sub">{log.timezone || '—'}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main">{formatCountry(log)}</div>
                      <div className="admin-cell-sub">
                        {[log.countryCode, formatPlace(log)].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td>
                      <div className="admin-cell-main">
                        {formatDeviceName(log)}
                        {' '}
                        <span className="admin-badge">{deviceLabel(log.deviceType)}</span>
                      </div>
                      <div className="admin-cell-sub">{log.screen || '—'}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main">
                        {[log.browser, log.os].filter(Boolean).join(' / ') || '—'}
                      </div>
                      <div className="admin-cell-sub">{log.language || '—'}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main admin-mono">{log.ip || '—'}</div>
                      <div className="admin-cell-sub">{log.org || ''}</div>
                    </td>
                    <td>
                      <div className="admin-cell-main admin-cell-truncate">
                        <a
                          className="admin-path-link"
                          href={openHref}
                          target="_blank"
                          rel="noreferrer"
                          title={trackId ? 'このパスの楽曲を開く' : 'サイトを開く'}
                        >
                          {log.path || '/'}
                        </a>
                      </div>
                      <div className="admin-cell-sub admin-cell-truncate">{log.referrer || '直接'}</div>
                    </td>
                    <td>
                      {trackId ? (
                        <>
                          <div className="admin-cell-main admin-cell-truncate">
                            <a
                              className="admin-path-link"
                              href={openHref}
                              target="_blank"
                              rel="noreferrer"
                              title="楽曲を開く"
                            >
                              {trackName}
                            </a>
                          </div>
                          <div className="admin-cell-sub admin-cell-truncate">
                            {trackItem?.type || 'track'}
                          </div>
                        </>
                      ) : (
                        <div className="admin-cell-sub">—</div>
                      )}
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
            </div>
          </section>
        </main>
      </div>
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
      <div className="admin-root">
        <div className="admin-shell admin-shell--center">
          <p className="admin-loading">読み込み中…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AdminLogin />
  }

  return <AdminDashboard user={user} />
}
