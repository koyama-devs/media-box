import { useEffect, useRef } from 'react'
import {
    bootstrapConversationRowsAsync,
    bootstrapConversationRowsSync,
} from './chatBootstrap.js'
import { mergeMessagesByClientId } from './chatMerge.js'

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
    const syncRows = bootstrapConversationRowsSync({
      conversationId,
      relatedIds,
      memoryCache,
      guestUserId,
    })
    if (syncRows.length && !cancelled) {
      onRowsRef.current?.(syncRows, { phase: 'sync' })
    }
    void bootstrapConversationRowsAsync({
      conversationId,
      relatedIds,
      memoryCache,
      guestUserId,
    }).then((asyncRows) => {
      if (cancelled) return
      const merged = mergeMessagesByClientId(syncRows, asyncRows)
      if (merged.length) onRowsRef.current?.(merged, { phase: 'idb' })
      onHydratedRef.current?.()
    })
    return () => { cancelled = true }
  }, [enabled, conversationId, guestUserId, relatedKey])
}
