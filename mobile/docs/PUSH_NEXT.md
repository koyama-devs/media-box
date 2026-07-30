# Push notifications — next steps for you

## After code deploy

1. Rebuild + sync mobile app:
   ```powershell
   cd mobile
   npm run cap:sync:build
   npm run android
   ```
   Then ▶ Run lại trên emulator.

2. Trên emulator: login (`zen` hoặc `hana`), **Allow** notifications.

3. Test:
   - Emulator login `zen`, để app nền / Home
   - Trên web (hoặc máy khác) login `hana`, gửi tin vào thread của zen
   - Emulator phải hiện notify

## Firebase Console (optional check)

- Cloud Messaging API enabled (thường đã có khi thêm Android app)
- Functions → `notifyOnChatMessage` đã deploy
- Firestore → collection `pushTokens` có document sau khi login trên app
