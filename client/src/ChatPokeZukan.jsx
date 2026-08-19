import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
    actPokeWorld,
    adoptPokeWorldPartner,
    claimPokeCafeGift,
    duoActPokeWorld,
    nicknamePokeWorldPartner,
    orderPokeCafe,
    selectPokeWorldMon,
    serializePokeZukan,
    syncPokeWorld,
    visitPokeWorldPlace,
    wakePokeWorld,
} from './firebase'
import { PokeSprite, SleepCover, SleepNest, WorldScene } from './PokeWorldScenes'
import {
    CAFE_MENU,
    SHORT_SLEEP_MS,
    WORLD_DUO_ACTIONS,
    WORLD_PARTY_MAX,
    WORLD_PLACES,
    WORLD_STARTERS,
    applyPokeWorldDecay,
    cafeKindLabel,
    cafeMenuItem,
    coolLeftMs,
    formatSleepSpan,
    formatTokyoHm,
    formatTokyoStamp,
    pokeNameJa,
    sleepDurationMs,
    tokyoZukanYmd,
    trainerOwnsFamily,
    worldActiveMon,
    worldEvoHint,
    worldGestureAction,
    worldGuide,
    worldLogLine, WORLD_LOG_ICON,
    worldMonIsSleeping,
    worldMonStyle,
    worldPartyList,
    worldPlace,
    worldSleepNest,
    worldTrainer,
} from './pokeZukan'

function zukanState(raw) {
  return serializePokeZukan(raw)
}

function StatBar({ label, value, tone }) {
  const n = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className={`hana-chat-poke-bar is-${tone}`}>
      <span>{label}</span>
      <i><b style={{ width: `${n}%` }} /></i>
    </div>
  )
}

function monMood(mon) {
  if (!mon) return '…'
  if (worldMonIsSleeping(mon)) return 'すやすや…'
  if (mon.hunger < 28) return 'おなかすいた…'
  if (mon.health < 28) return 'つかれちゃった…'
  if (mon.energy < 24) return 'ねむいよ…'
  if (mon.mood < 32) return 'さみしいな'
  if (mon.bond >= 70) return 'だいすき！'
  if (mon.mood >= 78) return 'ごきげんだよ'
  return 'いっしょにいよう'
}

const ACT_BUBBLE = {
  pet: 'なでなで〜',
  feed: 'もぐもぐ',
  nap: 'すやすや…',
  walk: 'てくてく',
  find: 'なにかいる？',
  cafe: 'おいしい！',
  train: 'えい！',
  evolve: 'しんかした！',
  treat: 'ごちそうするね！',
  petFriend: 'いっしょにおせわ',
  cheer: 'ファイト！',
  gift: 'どうぞ〜',
  duo: 'いっしょにたのしい！',
  free: 'えへへ♪',
  freecombo: 'もっとあそぼ！',
}

const ACT_FX = {
  pet: ['♡', '✦', '♡'],
  feed: ['🍓', '✦', '🍪'],
  nap: ['z', 'Z', '☁'],
  walk: ['✦', '…', '✦'],
  find: ['?', '✦', '!'],
  cafe: ['☕', '♪', '✦'],
  train: ['⚡', '✦', '💥'],
  evolve: ['✨', '✦', '✨'],
  treat: ['☕', '♡', '✦'],
  petFriend: ['♡', '🐾', '✦'],
  cheer: ['⚑', '✨', '✦'],
  gift: ['🎁', '♡', '✨'],
  duo: ['♡', '✨', '♡'],
  free: ['♡', '♪', '✦'],
  freecombo: ['✨', '♡', '♪'],
}

const ChatPokeZukan = memo(function ChatPokeZukan({
  zukan,
  role = 'guest',
  threadId,
  hanaAvatar = '',
  guestAvatar = '',
  hanaName = 'はな',
  guestName = 'ぜん',
  onClose,
  onError,
}) {
  const state = useMemo(() => zukanState(zukan), [zukan])
  const ymd = tokyoZukanYmd()
  const me = role === 'hana' ? 'hana' : 'guest'
  const them = me === 'hana' ? 'guest' : 'hana'
  const world = useMemo(
    () => applyPokeWorldDecay(state.world || {}, new Date()),
    [state.world],
  )
  const serverPlace = me === 'hana' ? world.hanaPlace : world.guestPlace
  const theirPlace = me === 'hana' ? world.guestPlace : world.hanaPlace
  const [localPlace, setLocalPlace] = useState('')
  const myPlace = localPlace || serverPlace
  const place = worldPlace(myPlace)
  const [busy, setBusy] = useState(false)
  const [adopting, setAdopting] = useState('')
  const [view, setView] = useState('town')
  const [nickDraft, setNickDraft] = useState('')
  const [nickFocus, setNickFocus] = useState(false)
  const panelRef = useRef(null)
  const [anim, setAnim] = useState('')
  const [toast, setToast] = useState(null)
  const [localAsleep, setLocalAsleep] = useState(false)
  const [cafeOpen, setCafeOpen] = useState(false)
  const justWokeRef = useRef(false)
  const touchRef = useRef(null)
  const tapBurstRef = useRef({ count: 0, at: 0 })
  const busyRef = useRef(false)
  const skipClickRef = useRef(false)

  const trainer = worldTrainer(world, me)
  const mon = worldActiveMon(world, me)
  const theirMon = worldActiveMon(world, them)
  const party = worldPartyList(world, me)
  const names = { hana: hanaName, guest: guestName }
  const myName = me === 'hana' ? hanaName : guestName
  const theirName = me === 'hana' ? guestName : hanaName
  const myAvatar = me === 'hana' ? hanaAvatar : guestAvatar
  const theirAvatar = me === 'hana' ? guestAvatar : hanaAvatar
  const theyAreHere = theirPlace === place.id
  const duoStar = state.duoStarYmd === ymd
    || (world.trainers.hana.lastActYmd === ymd && world.trainers.guest.lastActYmd === ymd)
  const hint = useMemo(() => worldGuide(mon, place.id), [mon, place.id])
  const style = useMemo(() => worldMonStyle(mon), [mon?.id, mon?.speciesId])
  const duoRows = useMemo(
    () => Object.entries(WORLD_DUO_ACTIONS)
      .filter(([, spec]) => spec.place === 'any' || spec.place === place.id)
      .map(([id, spec]) => ({ id, ...spec })),
    [place.id],
  )

  useEffect(() => {
    if (localPlace && localPlace === serverPlace) setLocalPlace('')
  }, [localPlace, serverPlace])

  useEffect(() => {
    if (nickFocus) return
    setNickDraft(mon?.nickname || '')
  }, [mon?.id, mon?.nickname, nickFocus])

  useEffect(() => {
    if (!anim) return undefined
    const t = window.setTimeout(() => setAnim(''), 720)
    return () => window.clearTimeout(t)
  }, [anim])

  useEffect(() => {
    if (!toast) return undefined
    const t = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    setLocalAsleep(worldMonIsSleeping(mon))
  }, [mon?.id, mon?.sleepingUntilIso])

  useEffect(() => {
    if (!threadId) return undefined
    void syncPokeWorld(threadId).catch(() => {})
  }, [threadId])

  const fail = (err) => onError?.(err?.message || 'うまくいきませんでした。')

  const say = (kind, line, how = '') => {
    setToast({ kind, line, how, key: Date.now() })
  }

  const go = (nextPlace) => {
    if (nextPlace === myPlace) return
    if (view === 'album') setView('town')
    if (localAsleep) {
      const sleptMs = sleepDurationMs(mon)
      if (sleptMs > 0 && sleptMs < SHORT_SLEEP_MS) {
        say('say', `きょう${formatSleepSpan(sleptMs)}しかねてない`, '早く寝よう。けんこうのためにもう少し長く')
      }
    }
    setLocalPlace(nextPlace)
    setCafeOpen(false)
    setLocalAsleep(false)
    justWokeRef.current = false
    void visitPokeWorldPlace(threadId, { role: me, place: nextPlace }).catch(fail)
  }

  const playFree = () => {
    const now = Date.now()
    const last = tapBurstRef.current
    const combo = now - last.at < 900 ? Math.min(3, last.count + 1) : 1
    tapBurstRef.current = { count: combo, at: now }
    const burst = combo >= 3
    setAnim(burst ? 'freecombo' : 'free')
    say('say', burst ? 'すごい！たのしい！' : ACT_BUBBLE.free)
  }

  const wakeUp = () => {
    if (!localAsleep) return
    const sleptMs = sleepDurationMs(mon)
    setLocalAsleep(false)
    justWokeRef.current = true
    setAnim('free')
    if (sleptMs > 0 && sleptMs < SHORT_SLEEP_MS) {
      say('say', `きょう${formatSleepSpan(sleptMs)}しかねてない`, '早く寝よう。けんこうのためにもう少し長く')
    } else if (sleptMs > 0) {
      say('ok', '電気をつけたよ', `きょう${formatSleepSpan(sleptMs)}ねた`)
    } else {
      say('ok', '電気をつけたよ', 'おはよう')
    }
    void wakePokeWorld(threadId, { role: me }).catch(fail)
  }

  const act = async (action) => {
    if (!mon || !action) return
    const napNow = action === 'nap' && !localAsleep
    if (!napNow && coolLeftMs(mon, action) > 0) {
      playFree()
      return
    }
    setAnim(action)
    if (action === 'nap') {
      setLocalAsleep(true)
      justWokeRef.current = false
    }
    if (busyRef.current) return
    busyRef.current = true
    try {
      const next = await actPokeWorld(threadId, { role: me, action, ymd })
      const nextMon = worldActiveMon(next?.world || {}, me)
      if (nextMon?.speciesId && nextMon.speciesId !== mon.speciesId) {
        setAnim('evolve')
        say('ok', 'しんかした！', `${pokeNameJa(mon.speciesId, 'なかま')}は${pokeNameJa(nextMon.speciesId)}に`)
      } else if (action === 'find') {
        const foundId = Object.keys(next?.entries || {}).find((id) => !state.entries[id])
        if (foundId) say('ok', `${pokeNameJa(foundId, 'ポケモン')}をみつけた！`)
        else say('say', 'きょうはにげられちゃった')
      } else if (action === 'nap') {
        const kind = nextMon?.sleepKind
        const clock = formatTokyoHm(nextMon?.sleepAtIso)
        if (kind === 'early') say('ok', `${clock}におやすみ`, '早寝できた。けんこうアップ')
        else if (kind === 'late') say('say', `${clock}におやすみ`, '夜ふかし…けんこうダウン')
        else say('say', ACT_BUBBLE.nap, clock ? `${clock}にひるね` : '')
      } else {
        say('say', ACT_BUBBLE[action] || 'いいね！')
      }
    } catch (err) {
      if (action === 'nap') setLocalAsleep(false)
      say('say', err?.message || 'うまくいきませんでした。')
    } finally {
      busyRef.current = false
    }
  }

  const duoAct = async (action) => {
    if (!mon || !theirMon || !action) return
    if (coolLeftMs(mon, action) > 0) {
      playFree()
      return
    }
    setAnim(action)
    if (busyRef.current) return
    busyRef.current = true
    try {
      await duoActPokeWorld(threadId, { role: me, action })
      setAnim('duo')
      say('ok', ACT_BUBBLE[action] || 'いっしょにアクション！')
    } catch (err) {
      say('say', err?.message || '協力アクションに失敗しました。')
    } finally {
      busyRef.current = false
    }
  }

  const runGesture = (kind) => {
    if (localAsleep) {
      wakeUp()
      return
    }
    if (place.id === 'home' && justWokeRef.current && (kind === 'tap' || kind === 'hold')) {
      void act('nap')
      return
    }
    const suggested = hint && hint.wait <= 0 ? hint.action : ''
    const action = worldGestureAction(place.id, kind, suggested)
    if (action === 'cafe') {
      setCafeOpen(true)
      return
    }
    const napNow = action === 'nap'
    if (!action || (!napNow && coolLeftMs(mon, action) > 0)) {
      playFree()
      return
    }
    void act(action)
  }

  const onMonPointerDown = (event) => {
    if (event.button) return
    if (localAsleep) {
      skipClickRef.current = true
      wakeUp()
      return
    }
    skipClickRef.current = false
    window.clearTimeout(touchRef.current?.holdT)
    touchRef.current = {
      x: event.clientX,
      y: event.clientY,
      stroked: false,
      held: false,
      holdT: window.setTimeout(() => {
        if (!touchRef.current) return
        touchRef.current.held = true
        skipClickRef.current = true
        runGesture('hold')
      }, 220),
    }
  }

  const onMonPointerMove = (event) => {
    const t = touchRef.current
    if (!t || t.held) return
    const dx = event.clientX - t.x
    const dy = event.clientY - t.y
    if (!t.stroked && (dx * dx + dy * dy > 36 * 36)) {
      t.stroked = true
      window.clearTimeout(t.holdT)
    }
  }

  const onMonPointerUp = () => {
    const t = touchRef.current
    window.clearTimeout(t?.holdT)
    touchRef.current = null
    if (!t || t.held) return
    if (t.stroked) {
      skipClickRef.current = true
      runGesture('stroke')
    }
  }

  const onMonClick = () => {
    if (skipClickRef.current) {
      skipClickRef.current = false
      return
    }
    runGesture('tap')
  }

  const adopt = async (speciesId) => {
    const sid = String(Number(speciesId) || '').trim()
    if (!sid || adopting) return
    setAdopting(sid)
    try {
      await adoptPokeWorldPartner(threadId, { role: me, speciesId: sid })
      setView('town')
    } catch (err) {
      fail(err)
    } finally {
      setAdopting('')
    }
  }

  const pickMon = (monId) => {
    if (monId === trainer.activeId) return
    void selectPokeWorldMon(threadId, { role: me, monId }).catch(fail)
  }

  const saveNick = async () => {
    if (busy) return
    setBusy(true)
    try {
      await nicknamePokeWorldPartner(threadId, { role: me, nickname: nickDraft })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const orderCafe = async (itemId, target) => {
    if (!mon || busyRef.current) return
    busyRef.current = true
    const item = cafeMenuItem(itemId)
    try {
      const next = await orderPokeCafe(threadId, { role: me, itemId, target })
      const nextMon = worldActiveMon(next?.world || {}, me)
      setCafeOpen(false)
      if (nextMon?.speciesId && nextMon.speciesId !== mon.speciesId) {
        setAnim('evolve')
        say('ok', 'しんかした！', `${pokeNameJa(mon.speciesId, 'なかま')}は${pokeNameJa(nextMon.speciesId)}に`)
      } else if (target === 'mate') {
        setAnim('gift')
        say('ok', `${item?.emoji || ''} ${item?.name}をおくる`, `${theirName}が受け取るとげんきアップ`)
      } else {
        setAnim('cafe')
        say('ok', `${item?.emoji || ''} ${item?.name}`, 'おいしい！')
      }
    } catch (err) {
      say('say', err?.message || 'うまくいきませんでした。')
    } finally {
      busyRef.current = false
    }
  }

  const claimCafe = async (giftId) => {
    if (!mon || busyRef.current) return
    busyRef.current = true
    const claimed = (trainer.gifts || []).find((row) => row.id === giftId)
    const item = cafeMenuItem(claimed?.itemId)
    try {
      await claimPokeCafeGift(threadId, { role: me, giftId })
      setAnim('cafe')
      say('ok', `${item?.emoji || '🎁'} ${item?.name || '贈り物'}をもらった`, 'げんきがもどったよ')
    } catch (err) {
      say('say', err?.message || 'うまくいきませんでした。')
    } finally {
      busyRef.current = false
    }
  }

  const displayName = mon?.nickname || pokeNameJa(mon?.speciesId, 'なかま')
  const asleep = localAsleep
  const theirAsleep = worldMonIsSleeping(theirMon)
  const nestKind = worldSleepNest(mon?.speciesId)
  const theirNestKind = worldSleepNest(theirMon?.speciesId)
  const sleepKindLabel = mon?.sleepKind === 'early'
    ? '早寝'
    : mon?.sleepKind === 'late'
      ? '夜ふかし'
      : mon?.sleepKind === 'day'
        ? 'ひるね'
        : ''
  const albumIds = Object.keys(state.entries)
  const picking = view === 'pick' || !mon
  const shown = toast || (asleep
    ? { kind: 'hint', line: 'すやすや…電気を消したよ', how: 'タッチすると電気がついて起きる' }
    : (hint && hint.wait <= 0 ? {
        kind: 'hint',
        line: hint.line,
        how: hint.how,
      } : null))

  return (
    <div
      ref={panelRef}
      className={`hana-chat-poke-panel is-world${nickFocus ? ' is-nick-focus' : ''}`}
      role="dialog"
      aria-label="ポケの里"
    >
      <div className="hana-chat-poke-head">
        <div className="hana-chat-poke-copy">
          <span className="hana-chat-poke-kicker">{myName}のポケモン</span>
          <strong className="hana-chat-poke-title">
            {duoStar ? '★ 今日もいっしょ' : place.kicker}
          </strong>
        </div>
        <button type="button" className="hana-chat-poke-collapse" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="hana-chat-poke-trainers is-world">
        <div className={`hana-chat-poke-seat${me === 'hana' ? ' is-mine' : ''}`}>
          <div className="hana-chat-poke-seat-face">
            {hanaAvatar ? <img src={hanaAvatar} alt="" /> : <span className="hana-chat-poke-seat-fallback">{hanaName.slice(0, 1)}</span>}
          </div>
          <strong>{hanaName}</strong>
        </div>
        <span className="hana-chat-poke-link" aria-hidden="true" />
        <div className={`hana-chat-poke-seat${me === 'guest' ? ' is-mine' : ''}`}>
          <div className="hana-chat-poke-seat-face">
            {guestAvatar ? <img src={guestAvatar} alt="" /> : <span className="hana-chat-poke-seat-fallback">{guestName.slice(0, 1)}</span>}
          </div>
          <strong>{guestName}</strong>
        </div>
        <div className={`hana-chat-poke-star-chip${duoStar ? ' is-on' : ''}`} title="ふたり星">
          <b>★</b>
          <span>{state.duoStars}</span>
        </div>
      </div>

      {(trainer.gifts || []).map((gift) => {
        const item = cafeMenuItem(gift.itemId)
        if (!item) return null
        const fromName = gift.from === 'hana' ? hanaName : guestName
        return (
          <button
            key={gift.id}
            type="button"
            className="hana-chat-poke-gift is-cafe"
            onClick={() => { void claimCafe(gift.id) }}
          >
            <b aria-hidden="true">{item.emoji}</b>
            <span>{fromName}から{item.name}</span>
            <strong>もらう</strong>
          </button>
        )
      })}

      {picking ? (
        <div className="hana-chat-poke-adopt">
          <p className="hana-chat-poke-hint">
            {mon
              ? `もう1匹迎える（${party.length}/${WORLD_PARTY_MAX}）`
              : `${myName}のポケモンを選ぶ。相手とは別々。`}
          </p>
          <ul className="hana-chat-poke-starters">
            {WORLD_STARTERS.map((id) => {
              const owned = trainerOwnsFamily(trainer, id)
              return (
              <li key={id}>
                <button
                  type="button"
                  disabled={Boolean(adopting) || owned}
                  aria-label={owned ? `${pokeNameJa(id)}はすでにいる` : pokeNameJa(id)}
                  onClick={() => { void adopt(id) }}
                >
                  <PokeSprite id={id} />
                  <strong>{pokeNameJa(id)}</strong>
                  {owned ? <span>いる</span> : null}
                </button>
              </li>
              )
            })}
          </ul>
          {mon ? (
            <button
              type="button"
              className="hana-chat-poke-swap-cancel"
              disabled={busy}
              onClick={() => setView('town')}
            >
              やめる
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <nav className="hana-chat-poke-map" aria-label="里の場所">
            {WORLD_PLACES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === myPlace ? 'is-here' : ''}
                onClick={() => go(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={view === 'album' ? 'is-here' : ''}
              onClick={() => setView((v) => (v === 'album' ? 'town' : 'album'))}
            >
              ずかん
            </button>
            {party.length < WORLD_PARTY_MAX ? (
              <button
                type="button"
                className={view === 'pick' ? 'is-here' : ''}
                onClick={() => setView('pick')}
              >
                迎える
              </button>
            ) : null}
          </nav>

          {view !== 'album' && place.id === 'home' ? (
            <form
              className="hana-chat-poke-nick is-sticky"
              onSubmit={(event) => {
                event.preventDefault()
                void saveNick()
                event.currentTarget.querySelector('input')?.blur()
              }}
            >
              <input
                value={nickDraft}
                maxLength={16}
                placeholder="ニックネーム"
                aria-label="ニックネーム"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="done"
                onFocus={() => {
                  setNickFocus(true)
                  const el = panelRef.current
                  if (el) {
                    el.classList.add('is-nick-focus')
                    el.scrollTop = 0
                  }
                  if (window.scrollY) window.scrollTo(0, 0)
                }}
                onBlur={() => {
                  setNickFocus(false)
                  panelRef.current?.classList.remove('is-nick-focus')
                }}
                onChange={(event) => setNickDraft(event.target.value)}
              />
              <button type="submit" disabled={busy || nickDraft === (mon.nickname || '')}>つける</button>
            </form>
          ) : null}

          {view === 'album' ? (
            <div className="hana-chat-poke-album">
              {albumIds.length ? (
                <ul>
                  {albumIds.map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        disabled={Boolean(adopting) || party.length >= WORLD_PARTY_MAX || trainerOwnsFamily(trainer, id)}
                        onClick={() => { void adopt(id) }}
                      >
                        <PokeSprite id={id} />
                        <strong>{pokeNameJa(id, `#${id}`)}</strong>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hana-chat-poke-hint">こうえんでさがすと、ずかんが増える。</p>
              )}
            </div>
          ) : (
            <>
              <div className={`hana-chat-poke-scene is-${place.id}${asleep ? ' is-sleeping' : ''}`}>
                <WorldScene place={place.id} night={asleep && place.id === 'home'} />
                <div className="hana-chat-poke-scene-people">
                  <span className="hana-chat-poke-scene-me">
                    {myAvatar ? <img src={myAvatar} alt="" /> : <em>{myName.slice(0, 1)}</em>}
                  </span>
                  {theyAreHere ? (
                    <span className="hana-chat-poke-scene-them">
                      {theirAvatar ? <img src={theirAvatar} alt="" /> : <em>{theirName.slice(0, 1)}</em>}
                    </span>
                  ) : null}
                </div>
                <div
                  className={`hana-chat-poke-scene-mon is-live is-${style.rig} is-${style.temperament}${asleep || anim === 'nap' ? ' is-asleep' : ''}${anim ? ` is-act-${anim}` : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={asleep ? `${displayName}を起こす` : `${displayName}とあそぶ`}
                  onPointerDown={onMonPointerDown}
                  onPointerMove={onMonPointerMove}
                  onPointerUp={onMonPointerUp}
                  onPointerCancel={onMonPointerUp}
                  onClick={onMonClick}
                  onContextMenu={(event) => event.preventDefault()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onMonClick()
                    }
                  }}
                >
                  <div className="hana-chat-poke-figure">
                    <b className={`hana-chat-poke-nametag${mon.nickname ? ' is-nick' : ''}`}>
                      {displayName}
                    </b>
                    <span className="hana-chat-poke-sleep">
                      {asleep || anim === 'nap' ? <SleepNest kind={nestKind} /> : null}
                      <PokeSprite id={mon.speciesId} name={displayName} />
                      {asleep || anim === 'nap' ? <SleepCover kind={nestKind} /> : null}
                    </span>
                  </div>
                  {anim ? (
                    <div className={`hana-chat-poke-fx is-${anim}`} aria-hidden="true">
                      {(ACT_FX[anim] || ACT_FX.pet).map((glyph, i) => (
                        <span key={`${anim}-${i}`}>{glyph}</span>
                      ))}
                    </div>
                  ) : null}
                  <p className="hana-chat-poke-bubble">{ACT_BUBBLE[anim] || monMood(mon)}</p>
                </div>
                {theyAreHere && theirMon ? (
                  <div className={`hana-chat-poke-scene-foe${theirAsleep ? ' is-asleep' : ''}${anim === 'duo' || anim === 'treat' || anim === 'petFriend' || anim === 'cheer' || anim === 'gift' ? ' is-duo' : ''}`}>
                    <b className={`hana-chat-poke-nametag is-mini${theirMon.nickname ? ' is-nick' : ''}`}>
                      {theirMon.nickname || pokeNameJa(theirMon.speciesId)}
                    </b>
                    <span className="hana-chat-poke-sleep is-mini">
                      {theirAsleep ? <SleepNest kind={theirNestKind} /> : null}
                      <PokeSprite id={theirMon.speciesId} name={theirMon.nickname || pokeNameJa(theirMon.speciesId)} />
                      {theirAsleep ? <SleepCover kind={theirNestKind} /> : null}
                    </span>
                    <span>{theirName}</span>
                  </div>
                ) : null}
                {place.id === 'home' ? (
                  <button
                    type="button"
                    className="hana-chat-poke-bed-btn"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (asleep) wakeUp()
                      else void act('nap')
                    }}
                  >
                    {asleep ? 'おはよう' : 'おやすみ'}
                  </button>
                ) : null}
                {place.id === 'cafe' ? (
                  <button
                    type="button"
                    className="hana-chat-poke-bed-btn"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      setCafeOpen(true)
                    }}
                  >
                    メニュー
                  </button>
                ) : null}
                {shown ? (
                  <div className={`hana-chat-poke-guide is-${shown.kind}`} role="status">
                    <i className="hana-chat-poke-guide-mark" aria-hidden="true" />
                    <p>
                      <strong>{shown.line}</strong>
                      {shown.how ? <span>{shown.how}</span> : null}
                    </p>
                  </div>
                ) : (
                  <p className="hana-chat-poke-scene-cap">
                    {theyAreHere ? `${theirName}もここにいる` : place.hint}
                  </p>
                )}
              </div>

              {cafeOpen && place.id === 'cafe' ? (
                <div className="hana-chat-poke-cafe-menu" role="dialog" aria-label="カフェメニュー">
                  <div className="hana-chat-poke-cafe-menu-head">
                    <strong>きょうのメニュー</strong>
                    <span>◇ {trainer.coins}</span>
                    <button type="button" onClick={() => setCafeOpen(false)}>とじる</button>
                  </div>
                  {['drink', 'tea', 'food'].map((kind) => (
                    <section key={kind} className="hana-chat-poke-cafe-group">
                      <h4>{cafeKindLabel(kind)}</h4>
                      <ul>
                        {CAFE_MENU.filter((row) => row.kind === kind).map((item) => (
                          <li key={item.id}>
                            <span className="hana-chat-poke-cafe-emoji" aria-hidden="true">{item.emoji}</span>
                            <div>
                              <strong>{item.name}</strong>
                              <small>げんき+{item.energy} おなか+{item.hunger} ◇{item.coins}</small>
                            </div>
                            <button
                              type="button"
                              disabled={busy || trainer.coins < item.coins}
                              onClick={() => { void orderCafe(item.id, 'self') }}
                            >
                              あげる
                            </button>
                            <button
                              type="button"
                              disabled={busy || !theirMon || trainer.coins < item.coins}
                              onClick={() => { void orderCafe(item.id, 'mate') }}
                            >
                              おくる
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : null}

              {theyAreHere && theirMon ? (
                <div className="hana-chat-poke-duo">
                  <p className="hana-chat-poke-duo-copy">一緒だね。ふたりで何かしよう。</p>
                  <div className="hana-chat-poke-duo-actions">
                    {duoRows.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (item.id === 'treat') setCafeOpen(true)
                          else void duoAct(item.id)
                        }}
                      >
                        <strong>{item.id === 'treat' ? 'メニューでおごり' : item.label}</strong>
                        <span>いっしょに</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <ul className="hana-chat-poke-party">
                {party.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={row.id === trainer.activeId ? 'is-on' : ''}
                      onClick={() => pickMon(row.id)}
                    >
                      <PokeSprite id={row.speciesId} />
                    </button>
                  </li>
                ))}
                {party.length < WORLD_PARTY_MAX ? (
                  <li>
                    <button type="button" className="is-add" aria-label="ポケモンを迎える" onClick={() => setView('pick')}>+</button>
                  </li>
                ) : null}
              </ul>

              <div className="hana-chat-poke-status">
                <div className="hana-chat-poke-status-meta">
                  <strong>{displayName}</strong>
                  <span>Lv.{mon.level}</span>
                  <span className="hana-chat-poke-coin">◇ {trainer.coins}</span>
                </div>
                <StatBar label="おなか" value={mon.hunger} tone="food" />
                <StatBar label="きぶん" value={mon.mood} tone="mood" />
                <StatBar label="げんき" value={mon.energy} tone="energy" />
                <StatBar label="けんこう" value={mon.health} tone="health" />
                <StatBar label="なかよし" value={mon.bond} tone="bond" />
                {mon.sleepAtIso ? (
                  <p className={`hana-chat-poke-sleep-note is-${mon.sleepKind || 'day'}`}>
                    前回 {formatTokyoStamp(mon.sleepAtIso)} にねた
                    {sleepKindLabel ? `（${sleepKindLabel}）` : ''}
                  </p>
                ) : null}
                <p className="hana-chat-poke-hint">{worldEvoHint(mon, myPlace)}</p>
              </div>

              {mon.log?.length ? (
                <ol className="hana-chat-poke-log">
                  {mon.log.slice(0, 12).map((row, i) => (
                    <li key={`${row.at}-${row.action}-${i}`} data-action={row.action}>
                      <span className="poke-log-icon">{WORLD_LOG_ICON[row.action] || '▸'}</span>
                      <span className="poke-log-body">{worldLogLine(row, names)}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
})

export function PokeZukanChip({ expanded, pending, duoStar, chipRef, onToggle }) {
  return (
    <button
      ref={chipRef}
      type="button"
      className={`hana-chat-poke-chip${expanded ? ' is-open' : ''}${pending ? ' is-pending' : ''}${duoStar ? ' is-star' : ''}`}
      aria-expanded={expanded}
      aria-label="ポケの里を開く"
      title="ポケの里"
      onClick={onToggle}
    >
      <span className="hana-chat-poke-chip-mark">{duoStar ? '★' : '里'}</span>
      {pending ? <i className="hana-chat-poke-dot" /> : null}
    </button>
  )
}

export default ChatPokeZukan
