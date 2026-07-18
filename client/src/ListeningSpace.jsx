import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AmbientEngine, getFullscreenElement, tryEnterFullscreen, tryExitFullscreen } from './ambientAudio'
import {
    LISTENING_SPACES,
    compressImageFileToDataUrl,
    listeningSpaceStyleVars,
    loadSpaceBackgrounds,
    resolveListeningSpace,
    saveAmbientSettings,
    saveFocusModePreference,
    saveListeningSpaceId,
    saveSpaceBackground,
} from './listeningSpaces'
import SpaceParticles from './SpaceParticles'
import SpaceScenery, { SpaceSceneryPreview } from './SpaceScenery'

function useDocumentFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => (
    typeof document !== 'undefined' && Boolean(getFullscreenElement())
  ))

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(getFullscreenElement()))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    sync()
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const toggleFullscreen = async () => {
    if (getFullscreenElement()) {
      await tryExitFullscreen()
    } else {
      await tryEnterFullscreen()
    }
  }

  return { isFullscreen, toggleFullscreen }
}

function useResolvedBackgroundUrl(entry, loadLibraryImageUrl) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let cancelled = false

    if (!entry) {
      setUrl(null)
      return undefined
    }

    if (entry.source === 'upload' && entry.dataUrl) {
      setUrl(entry.dataUrl)
      return undefined
    }

    if (entry.source === 'library' && entry.itemId && loadLibraryImageUrl) {
      setUrl(null)
      loadLibraryImageUrl(entry.itemId, entry.mimeType || 'image/jpeg')
        .then((resolved) => {
          if (!cancelled) setUrl(resolved)
        })
        .catch(() => {
          if (!cancelled) setUrl(null)
        })
      return () => {
        cancelled = true
      }
    }

    setUrl(null)
    return undefined
  }, [entry, loadLibraryImageUrl])

  return url
}

/**
 * Fullscreen scenery backdrop only. All controls live in the unified
 * player card (see ListeningSpaceSettings below).
 */
export default function ListeningSpace({
  open,
  spaceId,
  onClose,
  ambientEnabled,
  ambientVolume,
  reducedMotion = false,
  backgrounds = {},
  loadLibraryImageUrl = null,
}) {
  const [displaySpaceId, setDisplaySpaceId] = useState(spaceId)
  const [prevSpaceId, setPrevSpaceId] = useState(spaceId)
  const [crossfading, setCrossfading] = useState(false)
  const ambientRef = useRef(null)
  const wasFullscreenRef = useRef(false)
  const [fullscreenToast, setFullscreenToast] = useState(null)
  const { isFullscreen, toggleFullscreen } = useDocumentFullscreen()

  const activeSpace = useMemo(() => resolveListeningSpace(displaySpaceId), [displaySpaceId])
  const displayBgUrl = useResolvedBackgroundUrl(backgrounds[displaySpaceId] || null, loadLibraryImageUrl)
  const prevBgUrl = useResolvedBackgroundUrl(backgrounds[prevSpaceId] || null, loadLibraryImageUrl)

  useEffect(() => {
    if (isFullscreen && !wasFullscreenRef.current) {
      setFullscreenToast('もう一度「縮小」を押すか、Escキーで全画面を終了できます')
    }
    if (!isFullscreen) {
      setFullscreenToast(null)
    }
    wasFullscreenRef.current = isFullscreen
  }, [isFullscreen])

  useEffect(() => {
    if (!fullscreenToast) return undefined
    const timer = window.setTimeout(() => setFullscreenToast(null), 5200)
    return () => window.clearTimeout(timer)
  }, [fullscreenToast])

  useEffect(() => {
    if (spaceId === displaySpaceId) return undefined
    setPrevSpaceId(displaySpaceId)
    setCrossfading(true)
    const timer = window.setTimeout(() => {
      setDisplaySpaceId(spaceId)
      setCrossfading(false)
    }, 480)
    return () => window.clearTimeout(timer)
  }, [spaceId, displaySpaceId])

  useEffect(() => {
    if (!open) {
      ambientRef.current?.stop()
      tryExitFullscreen()
      return undefined
    }

    if (!ambientRef.current) {
      ambientRef.current = new AmbientEngine()
    }

    if (ambientEnabled) {
      ambientRef.current.start(activeSpace.ambient, ambientVolume).catch(() => {})
    } else {
      ambientRef.current.stop()
    }

    return () => {
      ambientRef.current?.stop()
    }
  }, [open, ambientEnabled, ambientVolume, activeSpace.ambient])

  useEffect(() => {
    if (!open) return undefined
    document.body.classList.add('is-listening-space-open')
    const onKey = (event) => {
      // Esc exits browser fullscreen first; don't also close the space.
      if (event.key === 'Escape' && !getFullscreenElement()) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('is-listening-space-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => () => {
    ambientRef.current?.stop()
    ambientRef.current = null
  }, [])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="listening-space-root" aria-hidden="true">
        <div
          className={`listening-space-layer${crossfading ? ' is-fading' : ''}`}
          style={listeningSpaceStyleVars(prevSpaceId)}
        >
          <div className="listening-space-sky" />
          <SpaceScenery spaceId={prevSpaceId} backgroundUrl={prevBgUrl} />
          <div className="listening-space-horizon" />
          <SpaceParticles spaceId={prevSpaceId} reducedMotion={reducedMotion} />
        </div>
        <div
          className={`listening-space-layer is-front${crossfading ? ' is-active' : ''}`}
          style={listeningSpaceStyleVars(displaySpaceId)}
        >
          <div className="listening-space-sky" />
          <SpaceScenery spaceId={displaySpaceId} backgroundUrl={displayBgUrl} />
          <div className="listening-space-horizon" />
          <SpaceParticles spaceId={displaySpaceId} reducedMotion={reducedMotion} />
        </div>
      </div>

      {isFullscreen ? (
        <button
          type="button"
          className="listening-space-fullscreen-exit"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void toggleFullscreen()
          }}
          title="全画面を終了"
        >
          縮小
        </button>
      ) : null}

      {fullscreenToast ? (
        <p className="listening-space-fullscreen-toast" role="status">
          {fullscreenToast}
        </p>
      ) : null}
    </>,
    document.body,
  )
}

/**
 * Space settings rendered inside the unified player card:
 * space chips, background picker, ambient / focus / fullscreen controls.
 */
export function ListeningSpaceSettings({
  spaceId,
  onSpaceChange,
  ambientEnabled,
  ambientVolume,
  onAmbientEnabledChange,
  onAmbientVolumeChange,
  focusMode,
  onFocusModeChange,
  suggestedSpaceId = null,
  backgrounds = {},
  onBackgroundsChange,
  libraryImages = [],
  loadLibraryImageUrl = null,
}) {
  const [bgBusy, setBgBusy] = useState(false)
  const [bgError, setBgError] = useState(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryThumbs, setLibraryThumbs] = useState({})
  const fileInputRef = useRef(null)
  const { isFullscreen, toggleFullscreen } = useDocumentFullscreen()

  const activeSpace = resolveListeningSpace(spaceId)
  const activeEntry = backgrounds[spaceId] || null
  const activeBgUrl = useResolvedBackgroundUrl(activeEntry, loadLibraryImageUrl)

  useEffect(() => {
    if (!libraryOpen || !loadLibraryImageUrl || libraryImages.length === 0) return undefined
    let cancelled = false
    const loadThumbs = async () => {
      const next = {}
      await Promise.all(
        libraryImages.slice(0, 48).map(async (item) => {
          try {
            const url = await loadLibraryImageUrl(item.id, item.type || 'image/jpeg')
            if (!cancelled) next[item.id] = url
          } catch {
            /* skip broken */
          }
        }),
      )
      if (!cancelled) setLibraryThumbs((current) => ({ ...current, ...next }))
    }
    loadThumbs()
    return () => {
      cancelled = true
    }
  }, [libraryOpen, libraryImages, loadLibraryImageUrl])

  // Resolve chip thumbs for library-sourced backgrounds
  useEffect(() => {
    if (!loadLibraryImageUrl) return undefined
    let cancelled = false
    const load = async () => {
      for (const space of LISTENING_SPACES) {
        const entry = backgrounds[space.id]
        if (entry?.source !== 'library' || !entry.itemId) continue
        try {
          const url = await loadLibraryImageUrl(entry.itemId, entry.mimeType || 'image/jpeg')
          if (!cancelled) {
            setLibraryThumbs((current) => (
              current[entry.itemId] ? current : { ...current, [entry.itemId]: url }
            ))
          }
        } catch {
          /* ignore */
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [backgrounds, loadLibraryImageUrl])

  const chipPreviewUrl = (id) => {
    const entry = backgrounds[id]
    if (entry?.source === 'upload' && entry.dataUrl) return entry.dataUrl
    if (entry?.source === 'library' && entry.itemId) return libraryThumbs[entry.itemId] || null
    return null
  }

  const handleSpacePick = (nextId) => {
    saveListeningSpaceId(nextId)
    onSpaceChange?.(nextId)
    setLibraryOpen(false)
    setBgError(null)
  }

  const handleAmbientToggle = () => {
    const next = !ambientEnabled
    onAmbientEnabledChange?.(next)
    saveAmbientSettings({ enabled: next, volume: ambientVolume })
  }

  const handleVolumeChange = (event) => {
    const next = Number(event.target.value)
    onAmbientVolumeChange?.(next)
    saveAmbientSettings({ enabled: ambientEnabled, volume: next })
  }

  const handleFocusToggle = () => {
    const next = !focusMode
    onFocusModeChange?.(next)
    saveFocusModePreference(next)
  }

  const applyBackground = (entry) => {
    saveSpaceBackground(spaceId, entry)
    onBackgroundsChange?.(loadSpaceBackgrounds())
    setBgError(null)
  }

  const handleUploadPick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBgBusy(true)
    setBgError(null)
    try {
      const dataUrl = await compressImageFileToDataUrl(file)
      applyBackground({ source: 'upload', dataUrl })
    } catch (error) {
      setBgError(error?.message || '画像の設定に失敗しました。')
    } finally {
      setBgBusy(false)
    }
  }

  const handleLibraryPick = (item) => {
    applyBackground({
      source: 'library',
      itemId: item.id,
      mimeType: item.type || 'image/jpeg',
    })
    setLibraryOpen(false)
  }

  const handleResetBackground = () => {
    applyBackground(null)
    setLibraryOpen(false)
  }

  return (
    <div className="player-space-settings">
      <div className="listening-space-heading-row">
        <div>
          <p className="listening-space-title">{activeSpace.label}</p>
          <p className="listening-space-tagline">{activeSpace.tagline}</p>
        </div>
        {suggestedSpaceId && suggestedSpaceId !== spaceId ? (
          <button
            type="button"
            className="listening-space-suggest"
            onClick={() => handleSpacePick(suggestedSpaceId)}
          >
            おすすめ: {resolveListeningSpace(suggestedSpaceId).labelShort}
          </button>
        ) : null}
      </div>

      <div className="listening-space-chips" role="group" aria-label="場所を選ぶ">
        {LISTENING_SPACES.map((space) => (
          <button
            key={space.id}
            type="button"
            className={`listening-space-chip${space.id === spaceId ? ' is-active' : ''}`}
            onClick={() => handleSpacePick(space.id)}
          >
            <SpaceSceneryPreview spaceId={space.id} backgroundUrl={chipPreviewUrl(space.id)} />
            <span>{space.labelShort}</span>
          </button>
        ))}
      </div>

      <div className="listening-space-bg-controls">
        <span className="listening-space-bg-label">背景</span>
        <SpaceSceneryPreview
          spaceId={spaceId}
          backgroundUrl={activeBgUrl || chipPreviewUrl(spaceId)}
          className="listening-space-bg-thumb"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleUploadPick}
        />
        <button
          type="button"
          className="secondary-button"
          disabled={bgBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {bgBusy ? '処理中…' : '画像を選ぶ'}
        </button>
        <button
          type="button"
          className={`secondary-button${libraryOpen ? ' is-active' : ''}`}
          disabled={bgBusy}
          onClick={() => setLibraryOpen((current) => !current)}
        >
          ライブラリ
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={bgBusy || !activeEntry}
          onClick={handleResetBackground}
        >
          リセット
        </button>
      </div>
      {bgError ? <p className="listening-space-bg-error">{bgError}</p> : null}

      {libraryOpen ? (
        <div className="listening-space-library" role="listbox" aria-label="ライブラリから背景を選ぶ">
          {libraryImages.length === 0 ? (
            <p className="listening-space-library-empty">ライブラリに画像がありません。</p>
          ) : (
            libraryImages.slice(0, 48).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`listening-space-library-item${activeEntry?.source === 'library' && activeEntry.itemId === item.id ? ' is-active' : ''}`}
                onClick={() => handleLibraryPick(item)}
                title={item.name || item.id}
              >
                {libraryThumbs[item.id] ? (
                  <img src={libraryThumbs[item.id]} alt="" />
                ) : (
                  <span className="listening-space-library-placeholder">…</span>
                )}
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className="listening-space-controls">
        <label className="listening-space-toggle">
          <input type="checkbox" checked={ambientEnabled} onChange={handleAmbientToggle} />
          <span>環境音</span>
        </label>
        <label className="listening-space-volume">
          <span>音量</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={ambientVolume}
            disabled={!ambientEnabled}
            onChange={handleVolumeChange}
          />
        </label>
        <label className="listening-space-toggle">
          <input type="checkbox" checked={focusMode} onChange={handleFocusToggle} />
          <span>集中モード</span>
        </label>
        <button
          type="button"
          className={`secondary-button listening-space-fullscreen${isFullscreen ? ' is-active' : ''}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void toggleFullscreen()
          }}
          title={isFullscreen ? '全画面を終了' : '全画面で景色を見る'}
        >
          {isFullscreen ? '縮小' : '全画面'}
        </button>
      </div>
    </div>
  )
}
