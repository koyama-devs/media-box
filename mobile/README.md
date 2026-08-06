# Hana Mediabox — Mobile (Capacitor)

Project **song song** với `client/` (web). Không sửa code web khi sync; chỉ **copy một chiều** `client/dist` → `mobile/www`.

```
hana-mediabox/
  client/     ← web app (Firebase Hosting) — không đổi để chạy mobile
  mobile/     ← Capacitor shell (Android / iOS) — project này
```

## Yêu cầu

- Node.js 20+
- **Android:** Android Studio + JDK 17 khuyến nghị (JDK 11 có thể chạy được tùy AGP)
- **iOS:** macOS + Xcode (build iOS không làm được trên Windows)
- Firebase project `hana-mediabox` — thêm Android/iOS app trong Console để lấy:
  - `android/app/google-services.json`
  - `ios/App/App/GoogleService-Info.plist`

## Setup lần đầu

```bash
cd mobile
npm install
npm run sync:web:build    # build client + copy vào www + inject push bridge
npx cap add android       # một lần
# npx cap add ios         # trên máy Mac
npx cap sync
```

Đặt file Firebase:

1. Firebase Console → Project settings → Your apps → Add Android  
   - Package name: `app.hanamediabox.mobile`  
   - Tải `google-services.json` → `mobile/android/app/google-services.json`
2. (Mac) Add iOS app với Bundle ID `app.hanamediabox.mobile` → `GoogleService-Info.plist`

Mở native IDE:

```bash
npm run android   # Android Studio
npm run ios       # Xcode (Mac)
```

## Workflow hàng ngày (song song với web)

| Việc | Lệnh / nơi làm |
|---|---|
| Sửa UI/chat web | làm trong `client/` như bình thường |
| Cập nhật bản trong app | `cd mobile && npm run cap:sync:build` |
| Chỉ sync (đã build client) | `cd mobile && npm run cap:sync` |
| Chạy web local | `cd client && npm run dev` — **không** đụng `mobile/` |

Optional: load hosting live trong WebView (test shell, không bundle):

```bash
# PowerShell
$env:CAP_SERVER_URL="https://hana-mediabox.web.app"
# rồi chỉnh capacitor.config.json thêm server.url, hoặc dùng script riêng
npx cap sync
```

## Push notifications (đã scaffold)

- Bridge: `native-bridge/capacitor-bridge.js` — được inject vào `www/index.html` khi sync (chỉ bản mobile, **không** ghi vào `client/`).
- Trong native app, bridge gọi `@capacitor/push-notifications`, lưu token vào `localStorage` (`hana_fcm_token`) và emit event `hana-push-token`.

**Chưa xong (bước tiếp theo, khi bạn muốn):**

1. Lưu FCM token theo user vào Firestore (`pushTokens`)
2. Cloud Function: khi có tin chat mới → gửi FCM tới thiết bị người nhận
3. Deep link mở đúng phòng chat khi tap notify

Các bước đó sẽ thêm code **opt-in** (functions / rules) — làm khi bạn bảo deploy notify thật.

## App ID

- `appId` / applicationId / bundleId: `app.hanamediabox.mobile`
- Tên hiển thị: `Hana Mediabox`

## Xuất APK (có timestamp trên tên file)

```bash
cd mobile
npm run apk              # debug → apk-out/hana-mediabox-1.0-debug-YYYYMMDD-HHMMSS.apk
npm run apk:release      # release
npm run apk:sync         # build client + sync + debug APK
```

Build từ Android Studio cũng ra tên stamped trong  
`android/app/build/outputs/apk/{debug|release}/`.

## Lưu ý

- Thư mục `www/` là generated — đừng sửa tay; sửa bridge ở `native-bridge/`.
- `google-services.json` / `GoogleService-Info.plist` nằm trong `.gitignore` (secret/local).
- Web production vẫn deploy từ `client/` như cũ.
