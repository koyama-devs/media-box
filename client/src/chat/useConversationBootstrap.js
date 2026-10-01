import { useEffect, useRef } from 'react'
import {
    bootstrapConversationRowsAsync,
    bootstrapConversationRowsSync,
} from './chatBootstrap.js'
import { normalizeConversationId } from './chatIdentity.js'
import { mergeMessagesByClientId } from './chatMerge.js'
import { syncConversationMessagesFromServer } from './chatSync.js'

/**
 * Local-first conversation open: IndexedDB → UI, then Firestore listener merges (in parent).
 */
export function useConversationBootstrap({
  enabled,
  conversationId,
  guestUserId = '',
  relatedIds = [],
  memoryCache,
  onRows,
  onHydrated,
}) {
  const onRowsRef = useRef(onRows)
  const onHydratedRef = useRef(onHydrated)
  onRowsRef.current = onRows
  onHydratedRef.current = onHydrated
  const relatedKey = relatedIds.join('\0')

  useEffect(() => {
    if (!enabled || !conversationId) return undefined
    let cancelled = false
    const logicalId = normalizeConversationId(conversationId) || conversationId
    const syncRows = bootstrapConversationRowsSync({
      conversationId: logicalId,
      relatedIds,
      memoryCache,
      guestUserId,
    })
    if (syncRows.length && !cancelled) {
      onRowsRef.current?.(syncRows, { phase: 'sync' })
    }
    void bootstrapConversationRowsAsync({
      conversationId: logicalId,
      relatedIds,
      memoryCache,
      guestUserId,
    }).then(async (asyncRows) => {
      if (cancelled) return
      const localMerged = mergeMessagesByClientId(syncRows, asyncRows)
      if (localMerged.length) onRowsRef.current?.(localMerged, { phase: 'idb' })
      if (!cancelled) onHydratedRef.current?.()
      const serverMerged = await syncConversationMessagesFromServer({
        conversationId: logicalId,
        guestUserId,
        previousUiRows: localMerged,
      })
      if (!cancelled && serverMerged.length) {
        onRowsRef.current?.(serverMerged, { phase: 'server' })
      }
    })
    return () => { cancelled = true }
  }, [enabled, conversationId, guestUserId, relatedKey])
}
