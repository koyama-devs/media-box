/**
 * Firestore chat I/O — UI/outbox use logical conversation ids; repository resolves Firestore paths.
 */

export {
    fetchChatMessages,
    markThreadDelivered,
    markThreadRead,
    sendChatMessage,
    subscribeChatMessages
} from '../firebase.js'

export {
    conversationIdForGuestUser, firestoreThreadId,
    normalizeConversationId
} from './chatIdentity.js'

