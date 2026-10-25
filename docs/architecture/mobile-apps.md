# Android / iOS Application Architecture

The legacy `Mobile.php` API is a school-era remnant (dead + insecure) — nothing is ported. The new mobile clients are first-class iDepot apps for field/workshop flows, with the POS heavy-lifting remaining on desktop/web.

## 1. Stack

- **React Native 0.7x + Expo** (bare workflow / dev clients where native modules require it — SQLite, Bluetooth printing).
- Shared `packages/domain` (pure TS) for totals/status math; `packages/contracts` for API types; `packages/sync` for the offline engine; `packages/ui` subset adapted to native.
- State/data: repository pattern over **SQLite replica** (expo-sqlite) + background sync worker.
- Navigation: Expo Router; design system tokens shared with web.

## 2. Supported flows (role-scoped)

| Role | Flows |
|---|---|
| Sales representative | customer list/search/create (phone-first, dedupe-assisted), new sales order (catalog + customer prices), quotation, receive payment (cash/MoMo/cheque tenders with reference capture), customer statement view/share, route plan day summary |
| Branch manager | approvals (discounts, returns), branch dashboard/KPIs, cash variance review |
| Owner/Director | executive dashboard, AI daily briefing, alerts |
| Warehouse officer | stock lookup, transfer acknowledgment, count sessions (tablet-friendly) |
| Cashier (secondary) | quick sale on phone/tablet for markets/roadside points (reduced POS) |

## 3. Offline behavior

Identical protocol to desktop: scoped SQLite replica, transactional outbox, UUIDv7 ids, document-number leases per device, idempotent push, resumable pull (see [offline-sync.md](offline-sync.md)). Phone-specific: aggressive image/logo caching, low-bandwidth mode (skip images), sync on wifi-preferred policy.

## 4. Device integration (mobile subset)

- Camera barcode/QR scanning (ML Kit).
- Bluetooth ESC/POS receipt printing (sales-rep receipts).
- Biometric unlock for app + supervisor override (stored as device credential, full user identity preserved server-side).
- Push notifications (FCM/APNs) via the notifications service (alerts, approvals, briefings).

## 5. Security

- Encrypted SQLite (SQLCipher or OS-encrypted storage) for the scoped replica.
- Tokens in Keychain/Keystore; short-lived access + rotating refresh; device registration and remote revocation.
- No client-side authorization decisions — every mutation validated server-side (and locally by domain invariants only as a UX aid).
- Screenshot-blocking toggle for sensitive screens (optional tenant policy).

## 6. Release engineering

- EAS Build + OTA updates (JS-only changes); native changes via store releases.
- Detox/Maestro critical-flow tests: login → offline order → sync; payment capture; statement view.
- Minimum: Android 8+ / iOS 15+; distribution via Play Store / App Store (or MDM for dedicated devices).
