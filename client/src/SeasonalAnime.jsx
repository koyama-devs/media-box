import { useEffect, useMemo, useRef, useState } from 'react'
import {
    ANIME_STATUS_LABEL,
    fetchJapaneseSynopsis,
    fetchSeasonalAnime,
    formatSeasonLabel,
    getAnimeSeason,
    getBroadcastSchedule,
    getPreviousSeason,
    loadWatchProgress,
    localizeAnimeGenres,
    pickAnimeTitle,
    searchAnimeByTitle,
    setWatchStatus,
    WATCH_STATUS_LABEL,
} from './anilistSeason'

const STATUS_CYCLE = [null, 'want', 'watching', 'done']
const SEARCH_DEBOUNCE_MS = 320
const PREVIEW_LEAVE_MS = 140

/**
 * Seasonal anime tops (AniList) + title search + local watch checklist.
 */
export default function SeasonalAnime({ hidden = false }) {
  const current = useMemo(() => getAnimeSeason(), [])
  const previous = useMemo(() => getPreviousSeason(current), [current])

  const [seasonKey, setSeasonKey] = useState('current') // current | previous
  const [filter, setFilter] = useState('all') // all | want | watching | done
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [seasonMedia, setSeasonMedia] = useState([])
  const [searchMedia, setSearchMedia] = useState([])
  const [progress, setProgress] = useState(() => loadWatchProgress())
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [entered, setEntered] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewSynopsis, setPreviewSynopsis] = useState('')
  const [previewSynopsisLoading, setPreviewSynopsisLoading] = useState(false)
  const leaveTimerRef = useRef(null)

  const seasonInfo = seasonKey === 'previous' ? previous : current
  const seasonLabel = formatSeasonLabel(seasonInfo)
  const isSearching = Boolean(debouncedQuery.trim())

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    fetchSeasonalAnime(seasonInfo)
      .then((list) => {
        if (!cancelled) setSeasonMedia(list)
      })
      .catch((err) => {
        if (!cancelled) {
          setSeasonMedia([])
          setError(err?.message || '読み込みに失敗しました。')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [seasonInfo.season, seasonInfo.seasonYear])

  useEffect(() => {
    const q = debouncedQuery.trim()
    if (!q) {
      setSearchMedia([])
      setSearching(false)
      return undefined
    }

    let cancelled = false
    setSearching(true)
    setError('')

    searchAnimeByTitle(q)
      .then((list) => {
        if (!cancelled) setSearchMedia(list)
      })
      .catch((err) => {
        if (!cancelled) {
          setSearchMedia([])
          setError(err?.message || '検索に失敗しました。')
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  useEffect(() => () => {
    window.clearTimeout(leaveTimerRef.current)
  }, [])

  useEffect(() => {
    setPreview(null)
    setPreviewSynopsis('')
  }, [seasonKey, filter, debouncedQuery])

  useEffect(() => {
    if (!preview?.item) {
      setPreviewSynopsis('')
      setPreviewSynopsisLoading(false)
      return undefined
    }

    let cancelled = false
    setPreviewSynopsis('')
    setPreviewSynopsisLoading(true)

    fetchJapaneseSynopsis(preview.item)
      .then((text) => {
        if (!cancelled) setPreviewSynopsis(text)
      })
      .catch(() => {
        if (!cancelled) setPreviewSynopsis('')
      })
      .finally(() => {
        if (!cancelled) setPreviewSynopsisLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [preview?.item?.id])

  if (hidden) return null

  const sourceMedia = isSearching ? searchMedia : seasonMedia

  const visible = sourceMedia.filter((item) => {
    if (filter === 'all') return true
    return progress[String(item.id)]?.status === filter
  })

  const counts = sourceMedia.reduce(
    (acc, item) => {
      const s = progress[String(item.id)]?.status
      if (s === 'want') acc.want += 1
      else if (s === 'watching') acc.watching += 1
      else if (s === 'done') acc.done += 1
      return acc
    },
    { want: 0, watching: 0, done: 0 },
  )

  const cycleStatus = (animeId) => {
    const key = String(animeId)
    const currentStatus = progress[key]?.status || null
    const idx = STATUS_CYCLE.indexOf(currentStatus)
    const nextStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    setProgress(setWatchStatus(animeId, nextStatus))
  }

  const clearLeaveTimer = () => {
    window.clearTimeout(leaveTimerRef.current)
  }

  const scheduleClosePreview = () => {
    clearLeaveTimer()
    leaveTimerRef.current = window.setTimeout(() => setPreview(null), PREVIEW_LEAVE_MS)
  }

  const openPreview = (item, anchorEl) => {
    if (!anchorEl) return
    clearLeaveTimer()
    const rect = anchorEl.getBoundingClientRect()
    const cardWidth = Math.min(380, window.innerWidth - 24)
    const cardHeight = 280
    const gap = 10

    let left = rect.right + gap
    if (left + cardWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.left - cardWidth - gap)
    }
    if (left + cardWidth > window.innerWidth - 12) {
      left = Math.max(12, (window.innerWidth - cardWidth) / 2)
    }

    let top = rect.top
    if (top + cardHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - cardHeight - 12)
    }

    setPreview({ item, top, left, width: cardWidth })
  }

  const busy = isSearching ? searching : loading
  const previewStatus = preview
    ? progress[String(preview.item.id)]?.status || null
    : null
  const previewTitle = preview ? pickAnimeTitle(preview.item) : ''
  const previewGenres = preview
    ? localizeAnimeGenres(preview.item.genres || []).slice(0, 5)
    : []
  const previewSeason =
    preview?.item.season && preview?.item.seasonYear
      ? formatSeasonLabel({
        season: preview.item.season,
        seasonYear: preview.item.seasonYear,
      })
      : null
  const previewSchedule = preview ? getBroadcastSchedule(preview.item) : null

  return (
    <section
      className={`seasonal-anime${entered ? ' is-visible' : ''}`}
      aria-label="今期のアニメ"
    >
      <header className="seasonal-anime-header">
        <div className="seasonal-anime-seal" aria-hidden="true">番</div>
        <div className="seasonal-anime-titles">
          <p className="seasonal-anime-kicker">今期のアニメ · 人気ランキング</p>
          <h3 className="seasonal-anime-heading">
            {isSearching ? '検索結果' : `${seasonLabel}のトップ`}
          </h3>
        </div>
      </header>

      <div className="seasonal-anime-tabs" role="tablist" aria-label="シーズン切替">
        <button
          type="button"
          role="tab"
          aria-selected={seasonKey === 'current'}
          className={seasonKey === 'current' ? 'is-active' : ''}
          onClick={() => setSeasonKey('current')}
          disabled={isSearching}
        >
          今期 · {formatSeasonLabel(current)}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={seasonKey === 'previous'}
          className={seasonKey === 'previous' ? 'is-active' : ''}
          onClick={() => setSeasonKey('previous')}
          disabled={isSearching}
        >
          前期 · {formatSeasonLabel(previous)}
        </button>
      </div>

      <label className="seasonal-anime-search">
        <span className="sr-only">アニメ名で検索</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="タイトルで検索（AniList）…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="seasonal-anime-filters" role="group" aria-label="視聴フィルター">
        {[
          { id: 'all', label: `すべて (${sourceMedia.length})` },
          { id: 'want', label: `見たい (${counts.want})` },
          { id: 'watching', label: `視聴中 (${counts.watching})` },
          { id: 'done', label: `視聴済 (${counts.done})` },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? 'is-active' : ''}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {busy ? (
        <p className="seasonal-anime-status">{isSearching ? '検索中…' : '読み込み中…'}</p>
      ) : null}
      {error ? <p className="seasonal-anime-error">{error}</p> : null}
      {!busy && !error && visible.length === 0 ? (
        <p className="seasonal-anime-status">該当する作品がありません。</p>
      ) : null}

      <ul className="seasonal-anime-list">
        {visible.map((item) => {
          const status = progress[String(item.id)]?.status || null
          const title = pickAnimeTitle(item)
          const subtitle = item.title?.romaji && item.title.romaji !== title
            ? item.title.romaji
            : item.title?.english || ''
          const itemSeason =
            item.season && item.seasonYear
              ? formatSeasonLabel({ season: item.season, seasonYear: item.seasonYear })
              : null
          const schedule = getBroadcastSchedule(item)
          const isPreviewed = preview?.item.id === item.id

          return (
            <li
              key={item.id}
              className={`seasonal-anime-item${status ? ` is-${status}` : ''}${isPreviewed ? ' is-previewed' : ''}`}
              onMouseEnter={(event) => openPreview(item, event.currentTarget)}
              onMouseLeave={scheduleClosePreview}
              onFocus={(event) => openPreview(item, event.currentTarget)}
              onBlur={scheduleClosePreview}
              onClick={(event) => {
                if (event.target.closest('a, button')) return
                if (preview?.item.id === item.id) {
                  setPreview(null)
                  return
                }
                openPreview(item, event.currentTarget)
              }}
            >
              <span className="seasonal-anime-rank" aria-label={`順位 ${item.rank}`}>
                {String(item.rank).padStart(2, '0')}
              </span>
              <a
                className="seasonal-anime-cover"
                href={item.siteUrl}
                target="_blank"
                rel="noreferrer"
                title="AniListで開く"
              >
                {item.coverImage?.large || item.coverImage?.medium ? (
                  <img
                    src={item.coverImage.large || item.coverImage.medium}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="seasonal-anime-cover-fallback">ANIMÉ</span>
                )}
              </a>
              <div className="seasonal-anime-meta">
                <a
                  className="seasonal-anime-title"
                  href={item.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {title}
                </a>
                {subtitle ? <p className="seasonal-anime-subtitle">{subtitle}</p> : null}
                <p className="seasonal-anime-facts">
                  {[
                    itemSeason,
                    item.format,
                    item.episodes ? `${item.episodes}話` : null,
                    item.averageScore != null ? `★ ${item.averageScore}` : null,
                    item.status === 'RELEASING' ? '放送中' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {schedule ? (
                  <p className="seasonal-anime-airing">
                    {schedule.weekly || schedule.short}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className={`seasonal-anime-status-btn${status ? ` is-${status}` : ''}`}
                onClick={() => cycleStatus(item.id)}
                title="タップで状態切替：未登録 → 見たい → 視聴中 → 視聴済"
              >
                {status ? WATCH_STATUS_LABEL[status] : '＋リスト'}
              </button>
            </li>
          )
        })}
      </ul>

      {preview ? (
        <aside
          className="seasonal-anime-preview"
          style={{
            top: preview.top,
            left: preview.left,
            width: preview.width,
          }}
          onMouseEnter={clearLeaveTimer}
          onMouseLeave={scheduleClosePreview}
        >
          <div className="seasonal-anime-preview-cover">
            {preview.item.coverImage?.large || preview.item.coverImage?.medium ? (
              <img
                src={preview.item.coverImage.large || preview.item.coverImage.medium}
                alt=""
              />
            ) : null}
          </div>
          <div className="seasonal-anime-preview-body">
            <p className="seasonal-anime-preview-kicker">
              {[
                previewSeason,
                preview.item.format,
                ANIME_STATUS_LABEL[preview.item.status] || preview.item.status,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h4 className="seasonal-anime-preview-title">{previewTitle}</h4>
            {preview.item.title?.romaji && preview.item.title.romaji !== previewTitle ? (
              <p className="seasonal-anime-preview-romaji">{preview.item.title.romaji}</p>
            ) : null}
            <p className="seasonal-anime-preview-stats">
              {[
                preview.item.episodes ? `${preview.item.episodes}話` : null,
                preview.item.averageScore != null ? `平均 ★ ${preview.item.averageScore}` : null,
                preview.item.popularity != null
                  ? `人気 ${preview.item.popularity.toLocaleString('ja-JP')}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {previewSchedule ? (
              <p className="seasonal-anime-preview-airing">
                <span className="seasonal-anime-preview-airing-label">放送</span>
                {previewSchedule.detail}
              </p>
            ) : null}
            {previewGenres.length > 0 ? (
              <div className="seasonal-anime-preview-genres">
                {previewGenres.map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
            ) : null}
            {previewSynopsisLoading ? (
              <p className="seasonal-anime-preview-desc is-empty">あらすじを読み込み中…</p>
            ) : previewSynopsis ? (
              <p className="seasonal-anime-preview-desc">{previewSynopsis}</p>
            ) : (
              <p className="seasonal-anime-preview-desc is-empty">日本語あらすじが見つかりません</p>
            )}
            <div className="seasonal-anime-preview-actions">
              <a
                className="seasonal-anime-preview-link"
                href={preview.item.siteUrl}
                target="_blank"
                rel="noreferrer"
              >
                AniList
              </a>
              <button
                type="button"
                className={`seasonal-anime-status-btn${previewStatus ? ` is-${previewStatus}` : ''}`}
                onClick={() => cycleStatus(preview.item.id)}
              >
                {previewStatus ? WATCH_STATUS_LABEL[previewStatus] : '＋リスト'}
              </button>
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  )
}
