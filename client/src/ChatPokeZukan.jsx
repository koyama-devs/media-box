import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
    flipPokeHuntTile,
    giftPokeDailyCard,
    serializePokeZukan,
    setPokeExpeditionPick,
    setPokeZukanCardPhoto,
    setPokeZukanCheer,
    stampPokeFoil,
    uploadChatAttachment,
} from './firebase'
import {
    CHEERS,
    HUNT_LIMIT,
    binderProgress,
    coverageScore,
    dailyBoss,
    dailyMatchupMode,
    energyPips,
    huntTiles,
    loadDailyCard,
    loadSpeciesCard,
    matchupTitle,
    resolveComboMatchup,
    resolveWeaknessMatchup,
    tokyoZukanYmd,
    typeAdvantage,
    typeLabel,
    wantedEvoIds,
} from './pokeZukan'

const TABS = [
  { id: 'hunt', label: 'めくる', icon: 'map' },
  { id: 'card', label: 'カード', icon: 'card' },
  { id: 'match', label: '勝負', icon: 'swords' },
  { id: 'album', label: 'アルバム', icon: 'book' },
]

function zukanState(raw) {
  return serializePokeZukan(raw)
}

function TabIcon({ kind }) {
  if (kind === 'map') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M5 5.5 10 4l4 2.5L19 5v14.5L14 21l-4-2.5L5 20z" opacity=".35" />
        <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M9 14.5c2.2-3.4 6-6.2 6-8.2A3 3 0 0 0 9 6a3 3 0 0 0-3 3c0 2 3.8 4.8 6 8.2z" />
        <circle cx="9" cy="9" r="1.2" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'card') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3.5" width="11" height="15" rx="2" fill="currentColor" opacity=".28" />
        <rect x="8" y="5.5" width="11" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  if (kind === 'swords') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M7 17 17 7M9 7h8v8" />
        <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="m17 17-4-4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M6 7h12v13H6z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M9 7V5.5A3 3 0 0 1 15 5.5V7" />
    </svg>
  )
}

function TrainerSeat({ src, name, mine, done, flips, limit }) {
  const used = Math.min(limit, flips)
  return (
    <div className={`hana-chat-poke-seat${mine ? ' is-mine' : ''}${done ? ' is-done' : ''}`}>
      <div className="hana-chat-poke-seat-face">
        {src ? <img src={src} alt="" /> : <span className="hana-chat-poke-seat-fallback">{name.slice(0, 1)}</span>}
        {done ? <i className="hana-chat-poke-stamp" aria-hidden="true">★</i> : null}
      </div>
      <strong>{name}</strong>
      <div className="hana-chat-poke-lives" aria-label={`${name} ${used}/${limit}`}>
        {Array.from({ length: limit }).map((_, i) => (
          <span key={i} className={i < used ? 'is-used' : ''} />
        ))}
      </div>
    </div>
  )
}

function WaitDuel({ mySrc, theirSrc, myName, theirName, myReady, theirReady }) {
  return (
    <div className="hana-chat-poke-duel" aria-live="polite">
      <div className={`hana-chat-poke-duel-side${myReady ? ' is-ready' : ''}`}>
        {mySrc ? <img src={mySrc} alt="" /> : null}
        <span className="hana-chat-poke-mini-card">{myReady ? '✓' : '?'}</span>
        <em>{myName}</em>
      </div>
      <span className="hana-chat-poke-vs">VS</span>
      <div className={`hana-chat-poke-duel-side${theirReady ? ' is-ready' : ''}`}>
        {theirSrc ? <img src={theirSrc} alt="" /> : null}
        <span className="hana-chat-poke-mini-card">{theirReady ? '✓' : '?'}</span>
        <em>{theirName}</em>
      </div>
    </div>
  )
}

function TileFace({ kind, open }) {
  if (!open) {
    return <span className="hana-chat-poke-tile-back" aria-hidden="true" />
  }
  if (kind === 'rare') {
    return (
      <span className="hana-chat-poke-tile-face is-rare">
        <b>★</b>
        <em>レア</em>
      </span>
    )
  }
  if (kind === 'energy') {
    return (
      <span className="hana-chat-poke-tile-face is-energy">
        <b />
        <em>パワー</em>
      </span>
    )
  }
  if (kind === 'clue') {
    return (
      <span className="hana-chat-poke-tile-face is-clue">
        <b>◇</b>
        <em>ヒント</em>
      </span>
    )
  }
  return (
    <span className="hana-chat-poke-tile-face is-empty">
      <b>—</b>
      <em>なし</em>
    </span>
  )
}

function TcgCard({ card, foil = false, photoUrl = '' }) {
  const type = card?.types?.[0] || 'normal'
  const art = card ? (photoUrl || card.sprite) : ''
  const [flipped, setFlipped] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 38 })
  const stageRef = useRef(null)

  if (!card) return null

  const onPointerMove = (event) => {
    const box = stageRef.current?.getBoundingClientRect()
    if (!box) return
    const px = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    const py = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
    setTilt({
      x: (0.5 - py) * 18,
      y: (px - 0.5) * 22,
      gx: px * 100,
      gy: py * 100,
    })
  }

  const spin = {
    transform: `rotateX(${tilt.x}deg) rotateY(${(flipped ? 180 : 0) + tilt.y * (flipped ? -1 : 1)}deg)`,
    '--gx': `${tilt.gx}%`,
    '--gy': `${tilt.gy}%`,
  }

  return (
    <div className={`hana-chat-tcg-slab${foil ? ' is-foil' : ''}`}>
      <i className="hana-chat-tcg-bolt is-tl" />
      <i className="hana-chat-tcg-bolt is-tr" />
      <i className="hana-chat-tcg-bolt is-bl" />
      <i className="hana-chat-tcg-bolt is-br" />
      <div
        ref={stageRef}
        className="hana-chat-tcg-stage"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setTilt({ x: 0, y: 0, gx: 50, gy: 38 })}
      >
        <button
          type="button"
          className={`hana-chat-tcg-spin${flipped ? ' is-flipped' : ''}`}
          style={spin}
          aria-label={flipped ? '表を見る' : 'うらを見る'}
          onClick={() => setFlipped((v) => !v)}
        >
          <article className={`hana-chat-tcg hana-chat-tcg-face is-front is-${type}${foil ? ' is-foil' : ''}`}>
            <header className="hana-chat-tcg-top">
              <strong className="hana-chat-tcg-name">
                {card.nameJa}
                {foil ? <b>★</b> : null}
              </strong>
              <span className="hana-chat-tcg-hp">
                <small>HP</small>
                {card.hp}
              </span>
              {(card.types || [type]).slice(0, 2).map((t) => (
                <span key={t} className={`hana-chat-tcg-pip is-${t}`} title={typeLabel(t)} />
              ))}
            </header>
            <div className="hana-chat-tcg-art">
              <div className="hana-chat-tcg-burst" aria-hidden="true" />
              <div className="hana-chat-tcg-spark" aria-hidden="true" />
              {art ? <img src={art} alt="" /> : null}
              <div className="hana-chat-tcg-glare" aria-hidden="true" />
            </div>
            <ul className="hana-chat-tcg-moves">
              {(card.moves || []).map((move) => (
                <li key={move.id}>
                  <span className={`hana-chat-tcg-pip is-${move.type}`} />
                  <em>{move.nameJa}</em>
                  <strong>{move.power || '—'}</strong>
                </li>
              ))}
            </ul>
            <footer className="hana-chat-tcg-bar">
              <span>
                弱点
                {(card.weaknesses || []).slice(0, 2).map((t) => (
                  <i key={t} className={`hana-chat-tcg-pip is-${t}`} title={typeLabel(t)} />
                ))}
              </span>
              <span className="hana-chat-tcg-no">#{String(card.id).padStart(3, '0')}</span>
            </footer>
          </article>
          <div className="hana-chat-tcg-face is-back" aria-hidden="true">
            <span className="hana-chat-tcg-back-swirl" />
          </div>
        </button>
      </div>
      <p className="hana-chat-tcg-help">傾ける・タップでうら</p>
    </div>
  )
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
  const other = me === 'hana' ? 'guest' : 'hana'
  const [tab, setTab] = useState('hunt')
  const [card, setCard] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [albumCards, setAlbumCards] = useState({})
  const photoRef = useRef(null)
  const [photoTarget, setPhotoTarget] = useState('')
  const foilStampedRef = useRef('')

  const expedition = state.expedition?.ymd === ymd ? state.expedition : null
  const myHunts = expedition?.hunts?.[me] || []
  const theirHunts = expedition?.hunts?.[other] || []
  const huntDone = myHunts.length >= HUNT_LIMIT
  const theirHuntDone = theirHunts.length >= HUNT_LIMIT
  const myRare = Boolean(expedition?.foundRare?.[me])
  const duoStar = state.duoStarYmd === ymd || (huntDone && theirHuntDone)
  const duo = state.duo?.ymd === ymd ? state.duo : null
  const tiles = useMemo(() => huntTiles(ymd), [ymd])
  const bosses = useMemo(() => dailyBoss(ymd), [ymd])
  const mode = useMemo(() => dailyMatchupMode(ymd), [ymd])
  const pips = useMemo(() => energyPips(ymd), [ymd])

  useEffect(() => {
    let alive = true
    setLoadErr('')
    loadDailyCard(ymd)
      .then((next) => {
        if (alive) setCard(next)
      })
      .catch((err) => {
        if (alive) setLoadErr(err?.message || '今日のカードを読めませんでした。')
      })
    return () => {
      alive = false
    }
  }, [ymd])

  const albumIds = Object.keys(state.entries)
  useEffect(() => {
    let alive = true
    if (!albumIds.length) return undefined
    Promise.all(albumIds.slice(0, 24).map((id) => loadSpeciesCard(id).catch(() => null)))
      .then((rows) => {
        if (!alive) return
        setAlbumCards((prev) => {
          const next = { ...prev }
          let changed = false
          rows.forEach((row) => {
            if (row?.id && !next[String(row.id)]) {
              next[String(row.id)] = row
              changed = true
            }
          })
          return changed ? next : prev
        })
      })
    return () => {
      alive = false
    }
  }, [albumIds.join(',')])

  const fail = (err) => onError?.(err?.message || 'うまくいきませんでした。')

  const flipTile = async (tile) => {
    if (busy || huntDone || myHunts.includes(tile.id)) return
    setBusy(true)
    try {
      await flipPokeHuntTile(threadId, {
        role: me,
        tileId: tile.id,
        kind: tile.kind,
        speciesId: card?.id,
        ymd,
      })
      if (myHunts.length + 1 >= HUNT_LIMIT) setTab('card')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const sendCheer = async (cheer) => {
    if (busy) return
    setBusy(true)
    try {
      await setPokeZukanCheer(threadId, { role: me, cheer, ymd })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const giftCard = async () => {
    if (busy || !card) return
    setBusy(true)
    try {
      await giftPokeDailyCard(threadId, { role: me, speciesId: card.id, ymd })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const pickField = async (field, value) => {
    if (busy) return
    setBusy(true)
    try {
      await setPokeExpeditionPick(threadId, { role: me, field, value, ymd })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const weakness = resolveWeaknessMatchup(
    expedition?.energyPick?.hana,
    expedition?.energyPick?.guest,
    bosses,
  )
  const combo = resolveComboMatchup(
    expedition?.comboMove?.hana,
    expedition?.comboMove?.guest,
    bosses,
  )
  const myTrade = expedition?.tradePick?.[me]
  const theirTrade = expedition?.tradePick?.[other]
  const tradeReady = Boolean(myTrade && theirTrade)
  const myTradeTypes = albumCards[myTrade]?.types || (String(myTrade) === String(card?.id) ? card?.types : [])
  const theirTradeTypes = albumCards[theirTrade]?.types || (String(theirTrade) === String(card?.id) ? card?.types : [])
  const tradeResult = tradeReady ? typeAdvantage(myTradeTypes, theirTradeTypes) : ''

  useEffect(() => {
    if (mode !== 'trade' || !tradeReady || tradeResult === 'draw') return
    const winId = tradeResult === 'a' ? myTrade : theirTrade
    const key = `${ymd}:${winId}`
    if (!winId || foilStampedRef.current === key) return
    foilStampedRef.current = key
    void stampPokeFoil(threadId, winId).catch(() => {})
  }, [mode, tradeReady, tradeResult, myTrade, theirTrade, ymd, threadId])

  const onPhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !photoTarget) return
    setBusy(true)
    try {
      const uploaded = await uploadChatAttachment(threadId, file)
      await setPokeZukanCardPhoto(threadId, {
        speciesId: photoTarget,
        photoUrl: uploaded.url,
      })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
      setPhotoTarget('')
    }
  }

  const regions = binderProgress(state.entries)
  const wanted = wantedEvoIds(state.entries, albumCards)
  const giftedToMe = expedition?.giftedSpeciesId && expedition.giftedBy && expedition.giftedBy !== me
  const entry = card ? state.entries[String(card.id)] : null
  const myName = me === 'hana' ? hanaName : guestName
  const theirName = me === 'hana' ? guestName : hanaName
  const myAvatar = me === 'hana' ? hanaAvatar : guestAvatar
  const theirAvatar = me === 'hana' ? guestAvatar : hanaAvatar
  const leftName = hanaName
  const rightName = guestName
  const leftAvatar = hanaAvatar
  const rightAvatar = guestAvatar
  const leftDone = me === 'hana' ? huntDone : theirHuntDone
  const rightDone = me === 'hana' ? theirHuntDone : huntDone
  const leftFlips = me === 'hana' ? myHunts.length : theirHunts.length
  const rightFlips = me === 'hana' ? theirHunts.length : myHunts.length

  return (
    <div className="hana-chat-poke-panel" role="dialog" aria-label="今日の探検">
      <div className="hana-chat-poke-head">
        <div className="hana-chat-poke-copy">
          <span className="hana-chat-poke-kicker">今日のルート</span>
          <strong className="hana-chat-poke-title">
            {duoStar ? '★ コンプ' : 'カードをさがす'}
          </strong>
        </div>
        <button type="button" className="hana-chat-poke-collapse" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="hana-chat-poke-trainers">
        <TrainerSeat
          src={leftAvatar}
          name={leftName}
          mine={me === 'hana'}
          done={leftDone}
          flips={leftFlips}
          limit={HUNT_LIMIT}
        />
        <span className="hana-chat-poke-link" aria-hidden="true" />
        <TrainerSeat
          src={rightAvatar}
          name={rightName}
          mine={me === 'guest'}
          done={rightDone}
          flips={rightFlips}
          limit={HUNT_LIMIT}
        />
        <div className={`hana-chat-poke-star-chip${duoStar ? ' is-on' : ''}`} title="ふたり星">
          <b>★</b>
          <span>{state.duoStars}</span>
        </div>
      </div>

      {duo?.cheer && duo.cheerBy !== me ? (
        <p className="hana-chat-poke-cheer-banner">♡ {duo.cheer}</p>
      ) : null}
      {giftedToMe ? (
        <p className="hana-chat-poke-cheer-banner">✉ カードが届いた</p>
      ) : null}

      <ol className="hana-chat-poke-path">
        {TABS.slice(0, 3).map((item, i) => (
          <li
            key={item.id}
            className={`${tab === item.id ? 'is-now' : ''} ${(item.id === 'hunt' || item.id === 'card') && huntDone ? 'is-cleared' : ''}`.trim()}
          >
            <button type="button" onClick={() => setTab(item.id)}>
              <i>{i + 1}</i>
              {item.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="hana-chat-poke-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-on' : ''}
            onClick={() => setTab(item.id)}
          >
            <TabIcon kind={item.icon} />
            {item.label}
            {item.id === 'hunt' && !huntDone ? <i className="hana-chat-poke-dot" /> : null}
          </button>
        ))}
      </div>

      {loadErr ? <p className="hana-chat-poke-err">{loadErr}</p> : null}

      {tab === 'hunt' ? (
        <div className="hana-chat-poke-hunt">
          <p className="hana-chat-poke-hint">
            うら向きのカードを3枚めくる
          </p>
          <div className="hana-chat-poke-grid">
            {tiles.map((tile) => {
              const open = myHunts.includes(tile.id)
              return (
                <button
                  key={tile.id}
                  type="button"
                  className={`hana-chat-poke-tile${open ? ` is-open is-${tile.kind}` : ''}`}
                  disabled={busy || huntDone || open}
                  aria-label={open ? tile.kind : 'うら'}
                  onClick={() => { void flipTile(tile) }}
                >
                  <TileFace kind={tile.kind} open={open} />
                </button>
              )
            })}
          </div>
          {huntDone ? (
            <p className="hana-chat-poke-ok">
              {myRare ? '★ レアゲット！カードを見てみよう' : 'みつけた。カードを見てみよう'}
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'card' ? (
        <div className="hana-chat-poke-card-tab">
          {huntDone && card ? (
            <>
              <TcgCard card={card} foil={Boolean(entry?.foil || myRare)} photoUrl={entry?.photoUrl} />
              <button type="button" className="hana-chat-poke-gift" disabled={busy} onClick={() => { void giftCard() }}>
                {expedition?.giftedBy === me ? '送った' : 'あいてに送る'}
              </button>
              <p className="hana-chat-poke-hint">応援を送る</p>
              <div className="hana-chat-poke-cheers">
                {CHEERS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={busy}
                    className={duo?.cheerBy === me && duo?.cheer === c ? 'is-on' : ''}
                    onClick={() => { void sendCheer(c) }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="hana-chat-poke-hint">先に3枚めくろう</p>
          )}
        </div>
      ) : null}

      {tab === 'match' ? (
        <div className="hana-chat-poke-match">
          <div className="hana-chat-poke-gym" aria-label="今日のジム">
            {bosses.map((t) => (
              <span key={t} className={`hana-chat-poke-gym-orb is-${t}`}>
                <i className={`hana-chat-tcg-pip is-${t}`} />
                {typeLabel(t)}
              </span>
            ))}
          </div>
          {albumIds.length >= 3 ? (
            <div className="hana-chat-poke-cover" title="手持ちカバー">
              {Array.from({ length: 3 }).map((_, i) => (
                <i key={i} className={i < Math.min(3, coverageScore(
                  albumIds.slice(0, 3).flatMap((id) => albumCards[id]?.types || []),
                  bosses,
                )) ? 'is-on' : ''} />
              ))}
            </div>
          ) : null}
          <p className="hana-chat-poke-q">{matchupTitle(mode)}</p>

          {mode === 'weakness' ? (
            <>
              <p className="hana-chat-poke-hint">色を1つ置く。2人そろったら弱点が見える。</p>
              <div className="hana-chat-poke-choices">
                {pips.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={busy || Boolean(expedition?.energyPick?.[me])}
                    className={expedition?.energyPick?.[me] === t ? 'is-picked' : ''}
                    onClick={() => { void pickField('energyPick', t) }}
                  >
                    <i className={`hana-chat-tcg-pip is-${t}`} />
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
              <WaitDuel
                mySrc={myAvatar}
                theirSrc={theirAvatar}
                myName={myName}
                theirName={theirName}
                myReady={Boolean(expedition?.energyPick?.[me])}
                theirReady={Boolean(expedition?.energyPick?.[other])}
              />
              {weakness.ready ? (
                <p className="hana-chat-poke-ok">
                  {weakness.duoOk
                    ? `★ ${weakness.covered.map((t) => typeLabel(t)).join(' / ')}`
                    : '割れなかった。明日また。'}
                </p>
              ) : null}
            </>
          ) : null}

          {mode === 'combo' ? (
            <>
              <p className="hana-chat-poke-hint">技を1つ。違う色で弱点を突けたら星。</p>
              <div className="hana-chat-poke-choices">
                {(card?.moves || []).map((move) => (
                  <button
                    key={move.id}
                    type="button"
                    disabled={busy || Boolean(expedition?.comboMove?.[me])}
                    className={expedition?.comboMove?.[me] === move.type ? 'is-picked' : ''}
                    onClick={() => { void pickField('comboMove', move.type) }}
                  >
                    <i className={`hana-chat-tcg-pip is-${move.type}`} />
                    {move.nameJa}
                  </button>
                ))}
              </div>
              <WaitDuel
                mySrc={myAvatar}
                theirSrc={theirAvatar}
                myName={myName}
                theirName={theirName}
                myReady={Boolean(expedition?.comboMove?.[me])}
                theirReady={Boolean(expedition?.comboMove?.[other])}
              />
              {combo.ready ? (
                <p className="hana-chat-poke-ok">{combo.duoOk ? '★ コンボ！' : '色が同じか、弱点を外した。'}</p>
              ) : null}
            </>
          ) : null}

          {mode === 'trade' ? (
            <>
              <p className="hana-chat-poke-hint">1枚伏せる。同時にめくって勝負。</p>
              <div className="hana-chat-poke-choices">
                {(albumIds.length ? albumIds : card ? [String(card.id)] : []).slice(0, 9).map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy || Boolean(myTrade)}
                    className={myTrade === id ? 'is-picked' : ''}
                    onClick={() => { void pickField('tradePick', id) }}
                  >
                    {albumCards[id]?.sprite ? <img src={albumCards[id].sprite} alt="" /> : null}
                    {albumCards[id]?.nameJa || card?.nameJa || `#${id}`}
                  </button>
                ))}
              </div>
              <WaitDuel
                mySrc={myAvatar}
                theirSrc={theirAvatar}
                myName={myName}
                theirName={theirName}
                myReady={Boolean(myTrade)}
                theirReady={Boolean(theirTrade)}
              />
              {tradeReady ? (
                <p className="hana-chat-poke-ok">
                  {tradeResult === 'draw'
                    ? '引き分け'
                    : tradeResult === 'a'
                      ? '勝ち。ホイル！'
                      : '負け。あいてにホイル。'}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'album' ? (
        <div className="hana-chat-poke-album">
          <ul className="hana-chat-poke-regions">
            {regions.map((region) => (
              <li key={region.id}>
                <span>{region.label}</span>
                <strong>{region.have}/{region.total}</strong>
              </li>
            ))}
          </ul>
          {wanted.length ? (
            <p className="hana-chat-poke-hint">手配：進化の先がまだいない（{wanted.length}）</p>
          ) : null}
          {albumIds.length ? (
            <ul>
              {albumIds.map((id) => {
                const row = albumCards[id]
                const item = state.entries[id]
                return (
                  <li key={id} className={item?.foil ? 'is-foil' : ''}>
                    {item?.photoUrl ? (
                      <img src={item.photoUrl} alt="" />
                    ) : row?.sprite ? (
                      <img src={row.sprite} alt="" />
                    ) : (
                      <span className="hana-chat-poke-slot">?</span>
                    )}
                    <strong>{row?.nameJa || `#${id}`}</strong>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPhotoTarget(id)
                        photoRef.current?.click()
                      }}
                    >
                      写真
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="hana-chat-poke-hint">まだゼロ。探索で一枚見つけよう。</p>
          )}
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => { void onPhoto(event) }}
          />
        </div>
      ) : null}
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
      aria-label="今日の探索を開く"
      title="今日の探索"
      onClick={onToggle}
    >
      <span className="hana-chat-poke-chip-mark">{duoStar ? '★' : '◆'}</span>
      {pending ? <i className="hana-chat-poke-dot" /> : null}
    </button>
  )
}

export default ChatPokeZukan
