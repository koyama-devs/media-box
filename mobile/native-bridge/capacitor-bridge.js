/**
 * Injected only into mobile/www (not into client/).
 * Registers Capacitor Push Notifications when running inside the native shell.
 */
;(function initHanaCapacitorBridge() {
  const w = typeof window !== 'undefined' ? window : null
  if (!w) return

  const Cap = w.Capacitor
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) {
    return
  }

  w.__HANA_CAPACITOR__ = {
    platform: Cap.getPlatform?.() || 'native',
    pushToken: null,
    ready: false,
  }

  async function setupPush() {
    try {
      const Push = Cap.Plugins?.PushNotifications
      if (!Push) {
        console.warn('[hana-mobile] PushNotifications plugin missing')
        return
      }

      // Android 8+: ensure a default channel exists for FCM display.
      if (Cap.getPlatform?.() === 'android' && typeof Push.createChannel === 'function') {
        try {
          await Push.createChannel({
            id: 'hana_chat',
            name: 'チャット',
            description: 'Hana Mediabox chat messages',
            importance: 5,
            visibility: 1,
            sound: 'default',
            vibration: true,
          })
        } catch (channelError) {
          console.warn('[hana-mobile] createChannel', channelError)
        }
      }

      let perm = await Push.checkPermissions()
      if (perm.receive !== 'granted') {
        perm = await Push.requestPermissions()
      }
      if (perm.receive !== 'granted') {
        console.warn('[hana-mobile] Push permission not granted')
        return
      }

      await Push.register()

      await Push.addListener('registration', (token) => {
        const value = token?.value || ''
        w.__HANA_CAPACITOR__.pushToken = value
        w.__HANA_CAPACITOR__.ready = true
        try {
          w.localStorage.setItem('hana_fcm_token', value)
        } catch {
          /* ignore */
        }
        w.dispatchEvent(
          new CustomEvent('hana-push-token', {
            detail: { token: value, platform: Cap.getPlatform?.() },
          }),
        )
        console.info('[hana-mobile] FCM token ready')
      })

      await Push.addListener('registrationError', (err) => {
        console.error('[hana-mobile] Push registration error', err)
      })

      await Push.addListener('pushNotificationReceived', (notification) => {
        const raw = notification?.data?.badge ?? notification?.badge
        const n = Math.max(0, Math.floor(Number(raw) || 0))
        try {
          if (n > 0 && typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function') {
            void navigator.setAppBadge(n).catch(() => {})
          }
        } catch {
          /* ignore */
        }
        w.dispatchEvent(
          new CustomEvent('hana-push-received', { detail: notification }),
        )
      })

      await Push.addListener('pushNotificationActionPerformed', (action) => {
        w.dispatchEvent(
          new CustomEvent('hana-push-action', { detail: action }),
        )
      })
    } catch (error) {
      console.error('[hana-mobile] Push setup failed', error)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void setupPush()
    })
  } else {
    void setupPush()
  }
})()
