import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AmbientEngine, getFullscreenElement, tryEnterFullscreen, tryExitFullscreen } from './ambientAudio'
import {
    AMBIENT_OPTIONS,
    MAX_CUSTOM_SPACES,
    MAX_SPACE_LABEL_LENGTH,
    PARTICLE_OPTIONS,
    buildEffectiveSpaceBackgrounds,
    compressImageFileToDataUrl,
    getAllListeningSpaces,
    hydrateCustomSpace,
    isBuiltInSpaceId,
    isCustomSpaceId,
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
  customSpaces = [],
  loadLibraryImageUrl = null,
}) {
  const [displaySpaceId, setDisplaySpaceId] = useState(spaceId)
  const [prevSpaceId, setPrevSpaceId] = useState(spaceId)
  const [crossfading, setCrossfading] = useState(false)
  const ambientRef = useRef(null)
  const wasFullscreenRef = useRef(false)
  const [fullscreenToast, setFullscreenToast] = useState(null)
  const { isFullscreen, toggleFullscreen } = useDocumentFullscreen()

  const effectiveBackgrounds = useMemo(
    () => buildEffectiveSpaceBackgrounds(backgrounds, customSpaces),
    [backgrounds, customSpaces],
  )

  const activeSpace = useMemo(
    () => resolveListeningSpace(displaySpaceId, customSpaces),
    [displaySpaceId, customSpaces],
  )
  const displayBgUrl = useResolvedBackgroundUrl(effectiveBackgrounds[displaySpaceId] || null, loadLibraryImageUrl)
  const prevBgUrl = useResolvedBackgroundUrl(effectiveBackgrounds[prevSpaceId] || null, loadLibraryImageUrl)

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
          style={listeningSpaceStyleVars(prevSpaceId, customSpaces)}
        >
          <div className="listening-space-sky" />
          <SpaceScenery spaceId={prevSpaceId} backgroundUrl={prevBgUrl} customSpaces={customSpaces} />
          <div className="listening-space-horizon" />
          <SpaceParticles spaceId={prevSpaceId} reducedMotion={reducedMotion} customSpaces={customSpaces} />
        </div>
        <div
          className={`listening-space-layer is-front${crossfading ? ' is-active' : ''}`}
          style={listeningSpaceStyleVars(displaySpaceId, customSpaces)}
        >
          <div className="listening-space-sky" />
          <SpaceScenery spaceId={displaySpaceId} backgroundUrl={displayBgUrl} customSpaces={customSpaces} />
          <div className="listening-space-horizon" />
          <SpaceParticles spaceId={displaySpaceId} reducedMotion={reducedMotion} customSpaces={customSpaces} />
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
  customSpaces = [],
  onCreateCustomSpace,
  onUpdateCustomSpace,
  onDeleteCustomSpace,
  onUploadSpaceBackground,
  libraryImages = [],
  loadLibraryImageUrl = null,
}) {
  const [bgBusy, setBgBusy] = useState(false)
  const [bgError, setBgError] = useState(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryThumbs, setLibraryThumbs] = useState({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('create')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftParticle, setDraftParticle] = useState('stars')
  const [draftAmbient, setDraftAmbient] = useState('ocean')
  const [draftBackgroundItemId, setDraftBackgroundItemId] = useState(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const fileInputRef = useRef(null)
  const formFileInputRef = useRef(null)
  const { isFullscreen, toggleFullscreen } = useDocumentFullscreen()

  const allSpaces = useMemo(() => getAllListeningSpaces(customSpaces), [customSpaces])
  const effectiveBackgrounds = useMemo(
    () => buildEffectiveSpaceBackgrounds(backgrounds, customSpaces),
    [backgrounds, customSpaces],
  )
  const activeSpace = resolveListeningSpace(spaceId, customSpaces)
  const activeEntry = effectiveBackgrounds[spaceId] || null
  const activeBgUrl = useResolvedBackgroundUrl(activeEntry, loadLibraryImageUrl)
  const isCustomActive = isCustomSpaceId(spaceId)
  const canAddSpace = customSpaces.length < MAX_CUSTOM_SPACES

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
      for (const space of allSpaces) {
        const entry = effectiveBackgrounds[space.id]
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
  }, [allSpaces, effectiveBackgrounds, loadLibraryImageUrl])

  const chipPreviewUrl = (id) => {
    const entry = effectiveBackgrounds[id]
    if (entry?.source === 'upload' && entry.dataUrl) return entry.dataUrl
    if (entry?.source === 'library' && entry.itemId) return libraryThumbs[entry.itemId] || null
    return null
  }

  const draftPreviewUrl = draftBackgroundItemId
    ? libraryThumbs[draftBackgroundItemId] || null
    : null

  const draftPreviewSpace = useMemo(
    () => hydrateCustomSpace({
      id: 'custom-draft-preview',
      label: draftLabel || '新しい場所',
      particle: draftParticle,
      ambient: draftAmbient,
      backgroundItemId: draftBackgroundItemId,
    }),
    [draftLabel, draftParticle, draftAmbient, draftBackgroundItemId],
  )

  const editorPreviewSpaces = useMemo(
    () => (editorOpen ? [...customSpaces, draftPreviewSpace] : customSpaces),
    [editorOpen, customSpaces, draftPreviewSpace],
  )

  const handleSpacePick = (nextId) => {
    saveListeningSpaceId(nextId, customSpaces)
    onSpaceChange?.(nextId)
    setLibraryOpen(false)
    setBgError(null)
    setFormError(null)
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

  const applyBuiltInBackground = (entry) => {
    saveSpaceBackground(spaceId, entry)
    onBackgroundsChange?.(loadSpaceBackgrounds())
    setBgError(null)
  }

  const applyCustomBackground = async (itemId) => {
    if (!isCustomActive) return
    setBgBusy(true)
    setBgError(null)
    try {
      await onUpdateCustomSpace?.(spaceId, { backgroundItemId: itemId })
    } catch (error) {
      setBgError(error?.message || '背景の更新に失敗しました。')
    } finally {
      setBgBusy(false)
    }
  }

  const handleUploadPick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBgBusy(true)
    setBgError(null)
    try {
      if (isCustomActive) {
        if (!onUploadSpaceBackground) {
          throw new Error('背景のアップロードに対応していません。')
        }
        const itemId = await onUploadSpaceBackground(file)
        await onUpdateCustomSpace?.(spaceId, { backgroundItemId: itemId })
      } else {
        const dataUrl = await compressImageFileToDataUrl(file)
        applyBuiltInBackground({ source: 'upload', dataUrl })
      }
    } catch (error) {
      setBgError(error?.message || '画像の設定に失敗しました。')
    } finally {
      setBgBusy(false)
    }
  }

  const handleLibraryPick = async (item) => {
    if (editorOpen) {
      setDraftBackgroundItemId(item.id)
      setLibraryThumbs((current) => (
        current[item.id] ? current : { ...current, [item.id]: libraryThumbs[item.id] }
      ))
      if (loadLibraryImageUrl && !libraryThumbs[item.id]) {
        loadLibraryImageUrl(item.id, item.type || 'image/jpeg')
          .then((url) => {
            setLibraryThumbs((current) => ({ ...current, [item.id]: url }))
          })
          .catch(() => {})
      }
      setLibraryOpen(false)
      return
    }

    if (isCustomActive) {
      await applyCustomBackground(item.id)
    } else {
      applyBuiltInBackground({
        source: 'library',
        itemId: item.id,
        mimeType: item.type || 'image/jpeg',
      })
    }
    setLibraryOpen(false)
  }

  const handleResetBackground = async () => {
    if (isCustomActive) {
      await applyCustomBackground(null)
    } else {
      applyBuiltInBackground(null)
    }
    setLibraryOpen(false)
  }

  const openCreateEditor = () => {
    if (!canAddSpace) {
      setFormError(`場所は最大${MAX_CUSTOM_SPACES}個までです。`)
      return
    }
    setEditorMode('create')
    setDraftLabel('')
    setDraftParticle('stars')
    setDraftAmbient('ocean')
    setDraftBackgroundItemId(null)
    setFormError(null)
    setEditorOpen(true)
    setLibraryOpen(false)
  }

  const openEditEditor = () => {
    if (!isCustomActive) return
    setEditorMode('edit')
    setDraftLabel(activeSpace.label)
    setDraftParticle(activeSpace.particle)
    setDraftAmbient(activeSpace.ambient)
    setDraftBackgroundItemId(activeSpace.backgroundItemId || null)
    setFormError(null)
    setEditorOpen(true)
    setLibraryOpen(false)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setFormError(null)
    setFormBusy(false)
  }

  const handleFormUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUploadSpaceBackground) return
    setFormBusy(true)
    setFormError(null)
    try {
      const itemId = await onUploadSpaceBackground(file)
      setDraftBackgroundItemId(itemId)
      if (loadLibraryImageUrl) {
        const url = await loadLibraryImageUrl(itemId, 'image/jpeg')
        setLibraryThumbs((current) => ({ ...current, [itemId]: url }))
      }
    } catch (error) {
      setFormError(error?.message || '画像のアップロードに失敗しました。')
    } finally {
      setFormBusy(false)
    }
  }

  const handleSubmitEditor = async (event) => {
    event.preventDefault()
    const label = draftLabel.trim().slice(0, MAX_SPACE_LABEL_LENGTH)
    if (!label) {
      setFormError('場所の名前を入力してください。')
      return
    }

    setFormBusy(true)
    setFormError(null)
    try {
      if (editorMode === 'create') {
        const created = await onCreateCustomSpace?.({
          label,
          particle: draftParticle,
          ambient: draftAmbient,
          backgroundItemId: draftBackgroundItemId,
        })
        if (created?.id) {
          handleSpacePick(created.id)
        }
      } else {
        await onUpdateCustomSpace?.(spaceId, {
          label,
          particle: draftParticle,
          ambient: draftAmbient,
          backgroundItemId: draftBackgroundItemId,
        })
      }
      closeEditor()
    } catch (error) {
      setFormError(error?.message || '場所の保存に失敗しました。')
    } finally {
      setFormBusy(false)
    }
  }

  const handleDeleteCustom = async () => {
    if (!isCustomActive) return
    const confirmed = window.confirm(`「${activeSpace.label}」を削除しますか？`)
    if (!confirmed) return
    setFormBusy(true)
    setFormError(null)
    try {
      await onDeleteCustomSpace?.(spaceId)
      closeEditor()
    } catch (error) {
      setFormError(error?.message || '場所の削除に失敗しました。')
    } finally {
      setFormBusy(false)
    }
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
            おすすめ: {resolveListeningSpace(suggestedSpaceId, customSpaces).labelShort}
          </button>
        ) : null}
      </div>

      <div className="listening-space-chips" role="group" aria-label="場所を選ぶ">
        {allSpaces.map((space) => (
          <button
            key={space.id}
            type="button"
            className={`listening-space-chip${space.id === spaceId ? ' is-active' : ''}${space.custom ? ' is-custom' : ''}`}
            onClick={() => handleSpacePick(space.id)}
          >
            <SpaceSceneryPreview
              spaceId={space.id}
              backgroundUrl={chipPreviewUrl(space.id)}
              customSpaces={customSpaces}
            />
            <span>{space.labelShort}</span>
          </button>
        ))}
      </div>

      <div className="listening-space-manage">
        <button
          type="button"
          className="secondary-button"
          disabled={!canAddSpace || formBusy}
          onClick={openCreateEditor}
        >
          場所を追加
        </button>
        {isCustomActive ? (
          <>
            <button
              type="button"
              className="secondary-button"
              disabled={formBusy}
              onClick={openEditEditor}
            >
              編集
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={formBusy}
              onClick={() => void handleDeleteCustom()}
            >
              削除
            </button>
          </>
        ) : null}
      </div>

      {editorOpen ? (
        <form className="listening-space-editor" onSubmit={handleSubmitEditor}>
          <p className="listening-space-editor-title">
            {editorMode === 'create' ? '新しい場所' : '場所を編集'}
          </p>
          <label className="listening-space-editor-field">
            <span>名前</span>
            <input
              type="text"
              value={draftLabel}
              maxLength={MAX_SPACE_LABEL_LENGTH}
              placeholder="例：静かな夜"
              onChange={(event) => setDraftLabel(event.target.value)}
              disabled={formBusy}
            />
          </label>
          <label className="listening-space-editor-field">
            <span>雰囲気</span>
            <select
              value={draftAmbient}
              onChange={(event) => setDraftAmbient(event.target.value)}
              disabled={formBusy}
            >
              {AMBIENT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="listening-space-editor-field">
            <span>エフェクト</span>
            <select
              value={draftParticle}
              onChange={(event) => setDraftParticle(event.target.value)}
              disabled={formBusy}
            >
              {PARTICLE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="listening-space-editor-bg">
            <span className="listening-space-bg-label">背景</span>
            <SpaceSceneryPreview
              spaceId={editorMode === 'edit' ? spaceId : draftPreviewSpace.id}
              backgroundUrl={draftPreviewUrl}
              customSpaces={editorPreviewSpaces}
              className="listening-space-bg-thumb"
            />
            <input
              ref={formFileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => void handleFormUpload(event)}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={formBusy}
              onClick={() => formFileInputRef.current?.click()}
            >
              画像を選ぶ
            </button>
            <button
              type="button"
              className={`secondary-button${libraryOpen ? ' is-active' : ''}`}
              disabled={formBusy}
              onClick={() => setLibraryOpen((current) => !current)}
            >
              ライブラリ
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={formBusy || !draftBackgroundItemId}
              onClick={() => setDraftBackgroundItemId(null)}
            >
              クリア
            </button>
          </div>
          {formError ? <p className="listening-space-bg-error">{formError}</p> : null}
          <div className="listening-space-editor-actions">
            <button type="submit" className="primary-button" disabled={formBusy}>
              {formBusy ? '保存中…' : editorMode === 'create' ? '追加する' : '保存する'}
            </button>
            <button type="button" className="secondary-button" disabled={formBusy} onClick={closeEditor}>
              キャンセル
            </button>
          </div>
        </form>
      ) : null}

      {!editorOpen ? (
        <>
          <div className="listening-space-bg-controls">
            <span className="listening-space-bg-label">背景</span>
            <SpaceSceneryPreview
              spaceId={spaceId}
              backgroundUrl={activeBgUrl || chipPreviewUrl(spaceId)}
              customSpaces={customSpaces}
              className="listening-space-bg-thumb"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => void handleUploadPick(event)}
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
              onClick={() => void handleResetBackground()}
            >
              リセット
            </button>
          </div>
          {bgError ? <p className="listening-space-bg-error">{bgError}</p> : null}
          {isBuiltInSpaceId(spaceId) ? null : (
            <p className="listening-space-custom-hint">
              雰囲気: {AMBIENT_OPTIONS.find((option) => option.id === activeSpace.ambient)?.label || activeSpace.ambient}
              {' / '}
              エフェクト: {PARTICLE_OPTIONS.find((option) => option.id === activeSpace.particle)?.label || activeSpace.particle}
            </p>
          )}
        </>
      ) : null}

      {libraryOpen ? (
        <div className="listening-space-library" role="listbox" aria-label="ライブラリから背景を選ぶ">
          {libraryImages.length === 0 ? (
            <p className="listening-space-library-empty">ライブラリに画像がありません。</p>
          ) : (
            libraryImages.slice(0, 48).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`listening-space-library-item${(
                  editorOpen
                    ? draftBackgroundItemId === item.id
                    : activeEntry?.source === 'library' && activeEntry.itemId === item.id
                ) ? ' is-active' : ''}`}
                onClick={() => void handleLibraryPick(item)}
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
