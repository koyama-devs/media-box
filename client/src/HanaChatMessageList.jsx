import { memo } from 'react'
import ChatSwipeBubble, { canMutateOwnMessage } from './ChatSwipeBubble'
import { EMOTION_MOMENTS } from './EmotionMoment'
import {
    deliveryStatusLabel,
    formatChatFileSize,
    formatChatTimestamp,
    getChatMessageAttachment,
} from './firebase'
import { CHAT_PARTY_REACTION } from './FlowerRain'
import HanaSticker, { isHanaSticker } from './HanaStickers'
import OwnerMessageAssist from './OwnerMessageAssist'

/** Stable empty reactions object so `|| {}` does not defeat memo. */
export const EMPTY_CHAT_REACTIONS = Object.freeze({})

/**
 * One message row. Memoized so draft/typing re-renders in the parent do not
 * remount ~300 swipe bubbles.
 */
const HanaChatMessageRow = memo(function HanaChatMessageRow({
  message,
  delivery,
  isOwn,
  avatarSrc,
  defaultReaction,
  reactorId,
  coarsePointer,
  translation,
  quoteLabelFor,
  ownerAssist,
  ownerAssistCollapsed,
  editWindowMs,
  onBubbleAction,
  onOpenImage,
  onOwnerAssistRetry,
}) {
  const timeLabel = formatChatTimestamp(message.createdAt)
  const showsSticker = !message.deleted && isHanaSticker(message.sticker)
  const attachment = !message.deleted ? getChatMessageAttachment(message) : null
  const showsImage = Boolean(attachment && attachment.kind === 'image')
  const showsVideo = Boolean(attachment && attachment.kind === 'video')
  const showsFile = Boolean(attachment && attachment.kind === 'file')
  const showsMedia = showsImage || showsVideo || showsFile
  const effectEmoji = !message.deleted && message.effect
    ? (String(message.effectEmoji || '').trim()
      || EMOTION_MOMENTS.find((item) => item.id === message.effect)?.emoji
      || (message.effect === 'party' ? CHAT_PARTY_REACTION : '')
      || (message.effect === 'flower' ? defaultReaction : ''))
    : ''
  const showsEffect = Boolean(effectEmoji)
  const mutable = isOwn && canMutateOwnMessage(message, {
    unreadByPartner: delivery === 'sent',
    windowMs: editWindowMs,
  })
  const sideClass = isOwn ? 'is-own' : 'is-other'
  const reactions = message.reactions || EMPTY_CHAT_REACTIONS
  const messageId = message.id

  if (message.kind === 'call-log' || message.callLog) {
    const callStatus = message.callLog?.status || ''
    const callDur = Number(message.callLog?.durationSec) || 0
    return (
      <div className="hana-chat-msg-row is-call-log">
        <div className={`hana-chat-call-log is-${callStatus || 'ended'}`} role="status">
          <span className="hana-chat-call-log-icon" aria-hidden="true">📞</span>
          <span className="hana-chat-call-log-text">{message.text}</span>
          {timeLabel ? <time dateTime={message.createdAt || undefined}>{timeLabel}</time> : null}
          {callStatus === 'ended' && callDur > 0 ? (
            <span className="hana-chat-call-log-meta">完了</span>
          ) : null}
          {callStatus === 'missed' ? (
            <span className="hana-chat-call-log-meta is-missed">不在</span>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={`hana-chat-msg-row ${sideClass}`}>
      {!isOwn ? (
        <img className="hana-chat-msg-avatar" src={avatarSrc} alt="" />
      ) : null}
      <div className="hana-chat-msg-column">
        <div className="hana-chat-msg-main">
          {isOwn && (timeLabel || !message.deleted || (message.editedAt && !message.deleted)) ? (
            <div className="hana-chat-msg-aside">
              {isOwn && !message.deleted ? (
                <span className={`hana-chat-delivery is-${delivery || 'sent'}`}>
                  {delivery ? deliveryStatusLabel(delivery) : '送信済'}
                </span>
              ) : null}
              {timeLabel ? (
                <time dateTime={message.createdAt || undefined}>{timeLabel}</time>
              ) : null}
              {message.editedAt && !message.deleted ? <span className="hana-chat-msg-edited">編集済</span> : null}
            </div>
          ) : null}
          <ChatSwipeBubble
            className={`${sideClass} is-${message.role}`}
            canReply={!message.deleted}
            canEdit={mutable && !showsSticker && !showsEffect && !showsMedia}
            canDelete={mutable}
            canReact={!message.deleted}
            showFlowerReact={!message.deleted && !isOwn}
            defaultReaction={defaultReaction}
            reactions={reactions}
            reactorId={reactorId}
            coarsePointer={coarsePointer}
            copyText={message.deleted || showsMedia ? '' : (message.rawText || message.text || '')}
            onCopy={(ok) => onBubbleAction(messageId, 'copy', ok)}
            onReply={() => onBubbleAction(messageId, 'reply')}
            onEdit={() => onBubbleAction(messageId, 'edit')}
            onDelete={() => onBubbleAction(messageId, 'delete')}
            onReact={(emoji, options) => onBubbleAction(messageId, 'react', { emoji, options })}
            onMenuAction={(actionId) => onBubbleAction(messageId, 'menu', actionId)}
            onEffect={(payload) => onBubbleAction(messageId, 'effect', payload)}
          >
            <div
              className={`hana-chat-bubble ${sideClass} is-${message.role}${message.kind === 'human-switch' || message.kind === 'intro' ? ' is-notice' : ''}${message.deleted ? ' is-deleted' : ''}${showsSticker ? ' is-sticker' : ''}${showsEffect ? ' is-effect' : ''}${showsImage ? ' is-image' : ''}${showsVideo ? ' is-video' : ''}${showsFile ? ' is-file' : ''}${message.uploading ? ' is-uploading' : ''}`}
            >
              {message.replyTo ? (
                <div className="hana-chat-quote">
                  <strong>{quoteLabelFor(message.replyTo.sender || message.replyTo.role)}</strong>
                  <span>{message.replyTo.text}</span>
                </div>
              ) : null}
              {showsSticker ? (
                <HanaSticker id={message.sticker} size={104} title={message.text} />
              ) : showsImage ? (
                <button
                  type="button"
                  className="hana-chat-image-link"
                  disabled={Boolean(message.uploading)}
                  aria-label="画像を拡大表示"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (message.uploading) return
                    onOpenImage({
                      src: attachment.url,
                      alt: attachment.fileName || message.text || '写真',
                    })
                  }}
                >
                  <img
                    className="hana-chat-image"
                    src={attachment.url}
                    alt={attachment.fileName || message.text || '写真'}
                    loading="lazy"
                  />
                  {message.uploading ? (
                    <span className="hana-chat-image-status">送信中…</span>
                  ) : null}
                </button>
              ) : showsVideo ? (
                <div className="hana-chat-video-wrap" data-no-bubble-press="true">
                  <video
                    className="hana-chat-video"
                    src={attachment.url}
                    controls
                    playsInline
                    preload="metadata"
                  />
                  {message.uploading ? (
                    <span className="hana-chat-image-status">送信中…</span>
                  ) : null}
                </div>
              ) : showsFile ? (
                <a
                  className="hana-chat-file-card"
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  download={attachment.fileName || true}
                  data-no-bubble-press="true"
                >
                  <span className="hana-chat-file-icon" aria-hidden="true">📄</span>
                  <span className="hana-chat-file-meta">
                    <strong className="hana-chat-file-name">{attachment.fileName}</strong>
                    <span className="hana-chat-file-sub">
                      {attachment.fileSize ? formatChatFileSize(attachment.fileSize) : 'ファイル'}
                    </span>
                  </span>
                </a>
              ) : showsEffect ? (
                <div className="hana-chat-effect-msg">
                  <span className="hana-chat-effect-msg-emoji" aria-hidden="true">{effectEmoji}</span>
                  <p className="hana-chat-effect-msg-caption">{message.text}</p>
                </div>
              ) : (
                <p>{message.text}</p>
              )}
              {translation ? (
                <p className="hana-chat-translation">{translation}</p>
              ) : null}
            </div>
          </ChatSwipeBubble>
          {!isOwn && (timeLabel || (message.editedAt && !message.deleted)) ? (
            <div className="hana-chat-msg-aside">
              {timeLabel ? (
                <time dateTime={message.createdAt || undefined}>{timeLabel}</time>
              ) : null}
              {message.editedAt && !message.deleted ? <span className="hana-chat-msg-edited">編集済</span> : null}
            </div>
          ) : null}
        </div>
        {ownerAssist ? (
          <OwnerMessageAssist
            assist={ownerAssist}
            collapsed={Boolean(ownerAssistCollapsed)}
            onRetry={() => onOwnerAssistRetry(messageId)}
          />
        ) : null}
      </div>
    </div>
  )
})

const HanaChatMessageList = memo(function HanaChatMessageList({
  messages,
  ownSender,
  actingAsOwner,
  guestOnHuman,
  resolveDelivery,
  avatarSrcForMessage,
  defaultReaction,
  reactorId,
  coarsePointer,
  translations,
  ownerAssist,
  ownerAssistCollapseById,
  editWindowMs,
  quoteLabelFor,
  onBubbleAction,
  onOpenImage,
  onOwnerAssistRetry,
  emptyOwnerHint,
  emptyGuestHint,
}) {
  return (
    <>
      {actingAsOwner && emptyOwnerHint ? (
        <p className="hana-chat-empty">{emptyOwnerHint}</p>
      ) : null}
      {!actingAsOwner && guestOnHuman && messages.length === 0 && emptyGuestHint ? (
        <p className="hana-chat-empty">{emptyGuestHint}</p>
      ) : null}
      {messages.map((message) => {
        const isOwn = (message.sender || message.role) === ownSender
          || (!actingAsOwner && !guestOnHuman && message.role === 'guest')
        return (
          <HanaChatMessageRow
            key={message.id}
            message={message}
            delivery={resolveDelivery(message)}
            isOwn={isOwn}
            avatarSrc={avatarSrcForMessage(message)}
            defaultReaction={defaultReaction}
            reactorId={reactorId}
            coarsePointer={coarsePointer}
            translation={translations[message.id] || ''}
            quoteLabelFor={quoteLabelFor}
            ownerAssist={actingAsOwner && !isOwn ? (ownerAssist[message.id] || null) : null}
            ownerAssistCollapsed={Boolean(ownerAssistCollapseById?.[message.id])}
            editWindowMs={editWindowMs}
            onBubbleAction={onBubbleAction}
            onOpenImage={onOpenImage}
            onOwnerAssistRetry={onOwnerAssistRetry}
          />
        )
      })}
    </>
  )
})

export default HanaChatMessageList
