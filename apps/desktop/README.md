# iDepot Desktop (Windows / macOS) — Tauri 2 POS terminal

Native shell around the iDepot web app: durable local SQLite (offline
replica + transactional outbox via `@idepot/offline`), hardware bridges
(ESC/POS printers, scanners, cash drawer via `@idepot/hardware`), and the
auto-update channel.

**Financial rule:** all money/stock/tax posting stays server-side. This
shell never computes or posts authoritative financials.

## Layout

```
src/main.ts               desktop frontend bootstrap (offline engine over tauri-plugin-sql)
src-tauri/tauri.conf.json Tauri 2 config (targets: MSI, NSIS, DMG; updater endpoint)
src-tauri/src/lib.rs      shell library (web app URL via IDEPOT_APP_URL env, SQLite plugin)
```

## Prerequisites

- Node ≥ 20 LTS, Rust ≥ 1.77 (`rustup`)
- Windows builds: MSVC toolchain + WiX Toolset (MSI) / NSIS
- macOS builds: Xcode Command Line Tools (DMG)
- The web bundle: `apps/web` standalone build copied into `dist-ui/` by the
  packaging step (never a live dev URL in production)

## Build / verify

```bash
npm run tauri build     # produces installers for the CURRENT host OS only
```

**Honest capability statement (Phase 6 handoff B1):** this repository
contains the complete source for the Windows and macOS applications, but an
installer may only be CLAIMED when CI (`.github/workflows/desktop.yml`,
gated on `windows-latest` / `macos-latest` runners) or a maintainer on the
matching host has actually produced and signed it. Until such an artifact
exists with published evidence, the status is **source-ready, not shipped**.

The updater public key (`plugins.updater.pubkey`) is a placeholder and MUST
be replaced with the real signing key before any release; update endpoints
point at the Lightworld update host and are deployment configuration.

## Device pairing

1. An administrator issues a pairing code: `POST /api/devices/pairing-codes`.
2. The terminal signs in (any `sync:device` user), calls
   `POST /api/auth/devices` with its `deviceCode`, then
   `POST /api/devices/pair` with the code — adopting the branch and
   hardware profile attached to the code.
3. Revocation (`POST /api/devices/:id/revoke`) immediately blocks the
   terminal's sync — the credential-rotation path.
