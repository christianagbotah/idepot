# iDepot Mobile (Android / iOS) — React Native field terminal

Shared contracts (`@idepot/contracts`), offline engine (`@idepot/offline`),
hardware HAL (`@idepot/hardware`) and print templates
(`@idepot/print-templates`) with the React Native surface: login + device
pairing, sync status UX (Online / Syncing n pending / Attention m
conflicts), conflict review, camera barcode entry and salesrep sale capture
arrive as scoped follow-ups on this scaffold.

**Financial rule:** the mobile app NEVER posts authoritative financials —
offline captures flow through `POST /api/sync/push` and are applied by the
server-side Posting Coordinator or land in an explicit conflict queue.

## Layout

```
App.tsx                          login, device registration, sync status UI, conflict review
src/offline/expo-sqlite-storage  OfflineStorage adapter over expo-sqlite
```

## Build prerequisites (per host OS)

- Android: Android Studio SDK + emulator/device; `npm run android`
- iOS: macOS + Xcode + CocoaPods; `npm run ios`
- Full project init (`react-native init` native folders, Podfile,
  gradle wrapper) is a scoped follow-up when the mobile CI runners are
  agreed — the app logic here compiles against the shared packages.

## Honest capability statement

Per the Phase 6 handoff: builds are verified where runners exist; platform
limitations are stated rather than papered over. **No Android APK or iOS
build is claimed by this repository until CI evidence exists.**
