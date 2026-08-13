import { memo, useEffect, useMemo, useState } from 'react'
import {
  WEIGHT_GARDEN_STAGE_COUNT,
  logWeightGardenEntry,
  setWeightGardenGoal,
  weightGardenProgress,
} from './firebase'

const ENCOURAGE = [
  'ゆっくりで大丈夫。今日の一歩が咲きはじめ。',
  '少しずつ、桜は近づいているよ。',
  'がんばってるね。花びらがもう見えてる。',
  '半分を越えたら、風も味方になる。',
  'もうかなり近い。満開が待ってるよ。',
  '満開！一緒に喜ぼう。',
]

function encourageFor(progress, reached) {
  if (reached) return ENCOURAGE[5]
  if (progress >= 0.8) return ENCOURAGE[4]
  if (progress >= 0.5) return ENCOURAGE[3]
  if (progress >= 0.25) return ENCOURAGE[2]
  if (progress > 0) return ENCOURAGE[1]
  return ENCOURAGE[0]
}

function formatLogDate(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const m = d.getMonth() + 1
    const day = d.getDate()
    return `${m}/${day}`
  } catch {
    return ''
  }
}

function SakuraBloom({ stage, reached }) {
  const petals = Array.from({ length: WEIGHT_GARDEN_STAGE_COUNT }, (_, i) => i < stage)
  return (
    <div className={`hana-chat-weight-bloom${reached ? ' is-full' : ''}`} aria-hidden="true">
      <div className="hana-chat-weight-tree">
        <span className="hana-chat-weight-trunk" />
        <span className="hana-chat-weight-canopy">
          {petals.map((on, i) => (
            <span
              key={i}
              className={`hana-chat-weight-petal${on ? ' is-on' : ''}`}
              style={{ '--petal-i': i }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}

/**
 * Shared Hana↔Gabu weight garden panel (sakura bloom by progress).
 * Guest can log weight / edit goal; owner views only.
 */
const ChatWeightGarden = memo(function ChatWeightGarden({
  garden,
  canEdit,
  threadId,
  onClose,
  onError,
}) {
  const stats = useMemo(() => weightGardenProgress(garden), [garden])
  const [kgDraft, setKgDraft] = useState(() => String(stats.currentKg))
  const [noteDraft, setNoteDraft] = useState('')
  const [goalDraft, setGoalDraft] = useState(() => String(stats.goalKg))
  const [busy, setBusy] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)

  useEffect(() => {
    setKgDraft(String(stats.currentKg))
    setGoalDraft(String(stats.goalKg))
  }, [stats.currentKg, stats.goalKg])

  const encourage = encourageFor(stats.progress, stats.reached)
  const recentLogs = stats.logs.slice(0, 8)

  const submitLog = async (event) => {
    event.preventDefault()
    if (!canEdit || !threadId || busy) return
    setBusy(true)
    try {
      await logWeightGardenEntry(threadId, { kg: kgDraft, note: noteDraft })
      setNoteDraft('')
    } catch (err) {
      onError?.(err?.message || '記録に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const submitGoal = async (event) => {
    event.preventDefault()
    if (!canEdit || !threadId || busy) return
    setBusy(true)
    try {
      await setWeightGardenGoal(threadId, goalDraft)
      setEditingGoal(false)
    } catch (err) {
      onError?.(err?.message || '目標の更新に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hana-chat-weight-panel" role="dialog" aria-label="ガブさんの桜ガーデン">
      <div className="hana-chat-weight-panel-head">
        <div className="hana-chat-weight-panel-copy">
          <span className="hana-chat-weight-kicker">ガブさんの桜ガーデン</span>
          <strong className="hana-chat-weight-title">
            {stats.reached ? '満開' : `咲き具合 ${stats.stage}/${WEIGHT_GARDEN_STAGE_COUNT}`}
          </strong>
        </div>
        <button
          type="button"
          className="hana-chat-weight-collapse"
          aria-label="閉じる"
          title="閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <SakuraBloom stage={stats.stage} reached={stats.reached} />

      <div className="hana-chat-weight-stats">
        <div className="hana-chat-weight-stat">
          <span className="hana-chat-weight-stat-label">いま</span>
          <strong>{stats.currentKg}<span>kg</span></strong>
        </div>
        <div className="hana-chat-weight-stat">
          <span className="hana-chat-weight-stat-label">目標</span>
          <strong>{stats.goalKg}<span>kg</span></strong>
        </div>
        <div className="hana-chat-weight-stat">
          <span className="hana-chat-weight-stat-label">あと</span>
          <strong>{stats.reached ? '0' : stats.remaining}<span>kg</span></strong>
        </div>
      </div>

      <p className="hana-chat-weight-encourage">{encourage}</p>

      {canEdit ? (
        <form className="hana-chat-weight-form" onSubmit={submitLog}>
          <label className="hana-chat-weight-field">
            <span>体重 (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="30"
              max="200"
              value={kgDraft}
              disabled={busy}
              onChange={(e) => setKgDraft(e.target.value)}
              required
            />
          </label>
          <label className="hana-chat-weight-field is-note">
            <span>ひとこと</span>
            <input
              type="text"
              maxLength={80}
              value={noteDraft}
              disabled={busy}
              placeholder="任意"
              onChange={(e) => setNoteDraft(e.target.value)}
            />
          </label>
          <button type="submit" className="hana-chat-weight-save" disabled={busy}>
            {busy ? '記録中…' : '記録する'}
          </button>
        </form>
      ) : (
        <p className="hana-chat-weight-owner-hint">ガブさんが記録すると、ここに花が咲きます。</p>
      )}

      {canEdit ? (
        <div className="hana-chat-weight-goal-row">
          {editingGoal ? (
            <form className="hana-chat-weight-goal-form" onSubmit={submitGoal}>
              <label className="hana-chat-weight-field">
                <span>目標 (kg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="40"
                  max="80"
                  value={goalDraft}
                  disabled={busy}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="hana-chat-weight-goal-btn" disabled={busy}>更新</button>
              <button
                type="button"
                className="hana-chat-weight-goal-btn is-quiet"
                disabled={busy}
                onClick={() => {
                  setGoalDraft(String(stats.goalKg))
                  setEditingGoal(false)
                }}
              >
                キャンセル
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="hana-chat-weight-goal-edit"
              onClick={() => setEditingGoal(true)}
            >
              目標を変える
            </button>
          )}
        </div>
      ) : null}

      {recentLogs.length ? (
        <ul className="hana-chat-weight-logs" aria-label="最近の記録">
          {recentLogs.map((entry) => (
            <li key={`${entry.atIso}-${entry.kg}`}>
              <time dateTime={entry.atIso}>{formatLogDate(entry.atIso)}</time>
              <strong>{entry.kg} kg</strong>
              {entry.note ? <span>{entry.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hana-chat-weight-empty">まだ記録なし。スタートは {stats.startKg} kg。</p>
      )}
    </div>
  )
})

export function WeightGardenChip({
  garden,
  expanded,
  chipRef,
  onToggle,
}) {
  const stats = useMemo(() => weightGardenProgress(garden), [garden])
  return (
    <button
      ref={chipRef}
      type="button"
      className={`hana-chat-weight-chip${expanded ? ' is-open' : ''}${stats.reached ? ' is-full' : ''}`}
      aria-expanded={expanded}
      aria-label={
        stats.reached
          ? 'ガブさんの桜ガーデン、満開。詳細を開く'
          : `ガブさんの桜ガーデン、咲き具合${stats.stage}/${WEIGHT_GARDEN_STAGE_COUNT}。詳細を開く`
      }
      title="ガブさんの桜ガーデン"
      onClick={onToggle}
    >
      {stats.reached ? (
        <span className="hana-chat-weight-chip-full">満開</span>
      ) : (
        <span className="hana-chat-weight-chip-count">
          <span className="hana-chat-weight-chip-num">{stats.stage}</span>
          <span className="hana-chat-weight-chip-unit">/{WEIGHT_GARDEN_STAGE_COUNT}</span>
        </span>
      )}
    </button>
  )
}

export default ChatWeightGarden
