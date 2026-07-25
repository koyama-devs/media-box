import { useEffect, useMemo, useState } from 'react'
import {
    fetchJapanMusicChart,
    listMusicLibrary,
    loadMusicLibrary,
    MUSIC_GENRES,
    MUSIC_KIND_LABEL,
    SEARCH_ENTITIES,
    searchJapanMusic,
    toggleMusicFavorite,
} from './japaneseMusic'

const SEARCH_DEBOUNCE_MS = 320

/**
 * Japanese music charts (iTunes JP) + favorites list.
 */
export default function JapaneseMusic({ hidden = false }) {
  const [genreId, setGenreId] = useState('all')
  const [view, setView] = useState('chart') // chart | favorites
  const [searchEntity, setSearchEntity] = useState('song')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [chartItems, setChartItems] = useState([])
  const [searchItems, setSearchItems] = useState([])
  const [favorites, setFavorites] = useState(() => listMusicLibrary())
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(Object.keys(loadMusicLibrary())))
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [entered, setEntered] = useState(false)

  const activeGenre = useMemo(
    () => MUSIC_GENRES.find((g) => g.id === genreId) || MUSIC_GENRES[0],
    [genreId],
  )
  const activeEntity = useMemo(
    () => SEARCH_ENTITIES.find((e) => e.id === searchEntity) || SEARCH_ENTITIES[0],
    [searchEntity],
  )
  const isSearching = Boolean(debouncedQuery.trim())
  const showingFavorites = view === 'favorites' && !isSearching
  const chartNeedsSearch = !activeEntity.chartFeed

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
    if (chartNeedsSearch) {
      setChartItems([])
      setLoading(false)
      setError('')
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError('')

    fetchJapanMusicChart(activeGenre.genreId, { feed: activeEntity.chartFeed })
      .then((list) => {
        if (!cancelled) setChartItems(list)
      })
      .catch((err) => {
        if (!cancelled) {
          setChartItems([])
          setError(err?.message || 'チャートの読み込みに失敗しました。')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeGenre.genreId, activeEntity.chartFeed, chartNeedsSearch])

  useEffect(() => {
    const q = debouncedQuery.trim()
    if (!q) {
      setSearchItems([])
      setSearching(false)
      return undefined
    }

    let cancelled = false
    setSearching(true)
    setError('')

    searchJapanMusic(q, { entity: activeEntity.itunes, media: activeEntity.media })
      .then((list) => {
        if (!cancelled) setSearchItems(list)
      })
      .catch((err) => {
        if (!cancelled) {
          setSearchItems([])
          setError(err?.message || '検索に失敗しました。')
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, activeEntity])

  if (hidden) return null

  const visible = showingFavorites
    ? favorites
    : (isSearching ? searchItems : chartItems)

  const chartHeading = `${activeGenre.label}${activeEntity.label}トップ`

  const syncFavorites = (library) => {
    setFavorites(Object.values(library).filter((item) => item?.id)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)))
    setFavoriteIds(new Set(Object.keys(library)))
  }

  const handleToggleFavorite = (item) => {
    const { library, favorited } = toggleMusicFavorite(item)
    syncFavorites(library)
    if (favorited && isSearching) {
      setQuery('')
      setDebouncedQuery('')
      setSearchItems([])
      setView('favorites')
    }
  }

  const busy = isSearching ? searching : (!showingFavorites && loading)

  return (
    <section
      className={`jp-music${entered ? ' is-visible' : ''}`}
      aria-label="日本の音楽"
    >
      <header className="jp-music-header">
        <div className="jp-music-seal" aria-hidden="true">音</div>
        <div className="jp-music-titles">
          <p className="jp-music-kicker">日本の音楽 · チャート</p>
          <h3 className="jp-music-heading">
            {isSearching
              ? `${activeEntity.label}の検索結果`
              : showingFavorites
                ? 'お気に入り'
                : chartNeedsSearch
                  ? '歌手を検索'
                  : chartHeading}
          </h3>
        </div>
      </header>

      <div className="jp-music-filters" role="group" aria-label="表示切替">
        <button
          type="button"
          className={!showingFavorites ? 'is-active' : ''}
          onClick={() => setView('chart')}
        >
          チャート
        </button>
        <button
          type="button"
          className={showingFavorites ? 'is-active' : ''}
          onClick={() => {
            setQuery('')
            setDebouncedQuery('')
            setSearchItems([])
            setView('favorites')
          }}
        >
          お気に入り ({favorites.length})
        </button>
      </div>

      {!showingFavorites ? (
        <>
          <div className="jp-music-entities" role="group" aria-label="表示対象">
            {SEARCH_ENTITIES.map((entity) => (
              <button
                key={entity.id}
                type="button"
                className={searchEntity === entity.id ? 'is-active' : ''}
                onClick={() => setSearchEntity(entity.id)}
              >
                {entity.label}
              </button>
            ))}
          </div>

          {!chartNeedsSearch || isSearching ? (
            <div className="jp-music-tabs" role="tablist" aria-label="ジャンル">
              {MUSIC_GENRES.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  role="tab"
                  aria-selected={genreId === genre.id}
                  className={genreId === genre.id ? 'is-active' : ''}
                  onClick={() => setGenreId(genre.id)}
                  disabled={isSearching}
                >
                  {genre.label}
                </button>
              ))}
            </div>
          ) : null}

          <label className="jp-music-search">
            <span className="sr-only">{activeEntity.label}を検索</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                chartNeedsSearch
                  ? '歌手名で検索…'
                  : `${activeEntity.label}を検索…`
              }
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </>
      ) : null}

      {busy ? (
        <p className="jp-music-status">{isSearching ? '検索中…' : '読み込み中…'}</p>
      ) : null}
      {error ? <p className="jp-music-error">{error}</p> : null}
      {!busy && !error && visible.length === 0 ? (
        <p className="jp-music-status">
          {showingFavorites
            ? 'お気に入りはまだありません。'
            : chartNeedsSearch && !isSearching
              ? '歌手チャートはないので、上で名前を検索してください。'
              : '該当する作品がありません。'}
        </p>
      ) : null}

      <ul className="jp-music-list">
        {visible.map((item) => {
          const favorited = favoriteIds.has(item.id)
          return (
            <li
              key={item.id}
              className={`jp-music-item${favorited ? ' is-favorite' : ''}`}
            >
              <span className="jp-music-rank" aria-hidden="true">
                {item.rank != null ? String(item.rank).padStart(2, '0') : '・'}
              </span>
              <a
                className="jp-music-cover"
                href={item.url || '#'}
                target="_blank"
                rel="noreferrer"
                title="Apple Musicで開く"
                onClick={(event) => {
                  if (!item.url) event.preventDefault()
                }}
              >
                {item.artwork ? (
                  <img src={item.artwork} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="jp-music-cover-fallback">
                    {MUSIC_KIND_LABEL[item.kind] || '♪'}
                  </span>
                )}
              </a>
              <div className="jp-music-meta">
                <a
                  className="jp-music-title"
                  href={item.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    if (!item.url) event.preventDefault()
                  }}
                >
                  {item.title}
                </a>
                <p className="jp-music-artist">
                  <span className="jp-music-kind">{MUSIC_KIND_LABEL[item.kind] || item.kind}</span>
                  {item.artist ? ` · ${item.artist}` : ''}
                </p>
              </div>
              <button
                type="button"
                className={`jp-music-status-btn${favorited ? ' is-favorite' : ''}`}
                onClick={() => handleToggleFavorite(item)}
                title={favorited ? 'お気に入りから外す' : 'お気に入りに追加'}
              >
                {favorited ? '♥ 済み' : '＋お気に入り'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
