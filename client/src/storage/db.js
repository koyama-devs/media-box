import Dexie from 'dexie'

/**
 * Persistent local chat database (IndexedDB via Dexie).
 * Firebase remains server source of truth.
 */
export class ChatDatabase extends Dexie {
  constructor() {
    super('hana-chat-v2')

    this.version(1).stores({
      outbox: 'clientId, conversationId, nextRetryAt, status, createdAt',
      outboxArchive: 'clientId, conversationId, createdAt',
      messages: 'clientMessageId, conversationId, createdAt, status',
      messageThreads: 'conversationId, updatedAt',
      syncState: 'conversationId, updatedAt',
    })
  }
}

export const chatDb = new ChatDatabase()
