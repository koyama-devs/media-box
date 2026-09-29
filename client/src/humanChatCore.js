const DEFAULT_MAX_MESSAGES = 300
const DEFAULT_MAX_OUTBOX = 40

function textValue(value) {
  return String(value || '').trim()
}

function timestampValue(message) {
  return Date.parse(message?.createdAtIso || message?.createdAt || '') || 0
}

function messageKey(message) {
  const clientId = textValue(message?.clientId)
  if (clientId) return `client:${clientId}`
  return `id:${textValue(message?.id)}`
}

export function sortHumanMessages(messages = [], maxMessages = DEFAULT_MAX_MESSAGES) {
  const byKey = new Map()
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.deleted) continue
    const key = messageKey(message)
    if (!key || byKey.has(key)) continue
    byKey.set(key, message)
  }
  return [...byKey.values()]
    .sort((a, b) => {
      const diff = timestampValue(a) - timestampValue(b)
      if (diff) return diff
      return textValue(a?.id).localeCompare(textValue(b?.id))
    })
    .slice(-Math.max(1, Number(maxMessages) || DEFAULT_MAX_MESSAGES))
}

export function createHumanMessage({
  clientId,
  text = '',
  sender,
  createdAtIso,
  ...payload
} = {}) {
  const id = textValue(clientId)
  const timestamp = textValue(createdAtIso) || new Date().toISOString()
  return {
    id,
    clientId: id,
    pending: true,
    sendFailed: false,
    sender: sender === 'hana' ? 'hana' : 'guest',
    role: sender === 'hana' ? 'hana' : 'guest',
    text: textValue(text),
    rawText: textValue(text),
    createdAt: timestamp,
    createdAtIso: timestamp,
    ...payload,
  }
}

export function mergeHumanServerMessages(serverMessages = [], localMessages = []) {
  return sortHumanMessages([
    ...(Array.isArray(serverMessages) ? serverMessages : []),
    ...(Array.isArray(localMessages) ? localMessages.filter((message) => message?.pending) : []),
  ])
}

export function createHumanChatController({
  adapter,
  maxMessages = DEFAULT_MAX_MESSAGES,
  maxOutbox = DEFAULT_MAX_OUTBOX,
  now = () => new Date().toISOString(),
} = {}) {
  if (!adapter) throw new Error('Human chat adapter is required.')
  let stopped = false
  let unsubscribe = () => {}
  let threadId = ''
  let guestKey = ''
  let messages = []
  const inFlight = new Map()
  const outbox = new Map()
  const listeners = new Set()

  const emit = () => {
    const snapshot = messages.slice()
    listeners.forEach((listener) => listener(snapshot))
  }

  const setMessages = (next) => {
    messages = sortHumanMessages(next, maxMessages)
    emit()
  }

  const putOutbox = (entry) => {
    outbox.set(entry.clientId, entry)
    while (outbox.size > maxOutbox) outbox.delete(outbox.keys().next().value)
    adapter.saveOutbox?.([...outbox.values()])
  }

  const removeOutbox = (clientId) => {
    const removed = outbox.get(clientId)
    outbox.delete(clientId)
    if (removed) adapter.removeOutbox?.(removed)
    adapter.saveOutbox?.([...outbox.values()])
  }

  const applyServer = (serverMessages) => {
    const server = sortHumanMessages(serverMessages, maxMessages)
    const serverClientIds = new Set(server.map((message) => textValue(message.clientId)).filter(Boolean))
    outbox.forEach((entry, clientId) => {
      if (serverClientIds.has(clientId)) removeOutbox(clientId)
    })
    setMessages(mergeHumanServerMessages(server, messages))
  }

  const subscribe = (listener) => {
    listeners.add(listener)
    listener(messages.slice())
    return () => listeners.delete(listener)
  }

  const connect = async ({ nextThreadId, nextGuestKey = '' } = {}) => {
    stopped = false
    unsubscribe()
    threadId = textValue(nextThreadId)
    guestKey = textValue(nextGuestKey)
    messages = sortHumanMessages(await adapter.loadCache?.(threadId, guestKey), maxMessages)
    emit()
    if (!threadId) return messages.slice()
    unsubscribe = adapter.subscribe(
      threadId,
      guestKey,
      (next) => {
        if (!stopped) applyServer(next)
      },
      () => {},
    ) || (() => {})
    return messages.slice()
  }

  const send = async (payload = {}) => {
    const clientId = textValue(payload.clientId) || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const createdAtIso = textValue(payload.createdAtIso) || now()
    const sendThreadId = textValue(payload.threadId) || threadId
    const sendGuestKey = textValue(payload.guestKey) || guestKey
    const local = createHumanMessage({ ...payload, clientId, createdAtIso })
    putOutbox({ ...local, threadId: sendThreadId, guestKey: sendGuestKey })
    const existingIndex = messages.findIndex((message) => message.clientId === clientId)
    setMessages(existingIndex >= 0
      ? messages.map((message, index) => (index === existingIndex ? { ...message, ...local } : message))
      : [...messages, local])
    const existing = inFlight.get(clientId)
    if (existing) return existing
    const promise = adapter.send({
      ...payload,
      threadId: sendThreadId,
      guestKey: sendGuestKey,
      clientId,
      createdAtIso,
    }).then((serverId) => {
      removeOutbox(clientId)
      setMessages(messages.map((message) => (
        message.clientId === clientId
          ? { ...message, id: serverId || message.id, serverId: serverId || '', pending: false, sendFailed: false }
          : message
      )))
      return serverId
    }).catch((error) => {
      setMessages(messages.map((message) => (
        message.clientId === clientId ? { ...message, pending: false, sendFailed: true } : message
      )))
      throw error
    }).finally(() => inFlight.delete(clientId))
    inFlight.set(clientId, promise)
    return promise
  }

  const retry = (clientId) => {
    const entry = outbox.get(textValue(clientId))
    if (!entry) return Promise.resolve(null)
    return send(entry)
  }

  const stop = () => {
    stopped = true
    unsubscribe()
    unsubscribe = () => {}
  }

  return {
    connect,
    send,
    retry,
    stop,
    subscribe,
    getState: () => ({ threadId, guestKey, messages: messages.slice(), outbox: [...outbox.values()] }),
  }
}
