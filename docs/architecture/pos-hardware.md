# Windows / macOS POS Hardware Integration Architecture

Implements master prompt §10. The legacy system has effectively **no** hardware layer (the ESC/POS helper is a dead demo — `helpers/receipt_helper.php:16-86`), so this is new capability, not a port.

## 1. Hardware abstraction layer (HAL)

The business/domain layer never sees device commands. It emits intents:

```
PrintReceipt { template, data }      → hardware.printer.<id>
OpenDrawer  { profile }              → hardware.drawer.<id>
PrintLabel  { template, product }    → hardware.labelprinter.<id>
Scan        (event)                  → from hardware.scanner.<id>
```

Adapters live in the **Tauri Rust bridge** (desktop) and behind an interface in React Native (mobile, reduced set). The web PWA gets printer support only through a paired desktop app or network printers via server-side print service (no browser-only workaround for hardware needing native access — master prompt §10).

## 2. Device adapters (Tauri 2 / Rust)

| Device | Class | Transport | Notes |
|---|---|---|---|
| Barcode/QR scanner | `scanner` | USB HID (keyboard wedge), USB serial, Bluetooth SPP | HID is zero-config; serial via `serialport` crate; scanner profiles for prefix/suffix |
| Receipt printer | `printer` | USB, serial, Ethernet/WiFi (RAW 9100), Bluetooth | **ESC/POS** command set (82/80/58mm profiles); text + barcode + QR + logo (NV bitfield) |
| Cash drawer | `drawer` | Kick via ESC/POS (`ESC p m t1 t2`), or serial RTS/DTR | Triggered through the printer profile; direct-serial variant for standalone drawers |
| Label printer | `labelprinter` | ESC/POS label mode, ZPL (Zebra), TSPL (TSC) | Product/price/shelf labels with barcode (EAN-13/Code128) |
| Customer display | `display` | Serial/USB (POS customer displays), or browser window on 2nd screen (profile) | Line total + change display |
| Weighing scale | `scale` (optional, later) | Serial (common protocols) | Quantity-from-weight on POS line |

Rust crates: `escpos`* (or custom formatter), `serialport`, `rusb`, `tokio` for async device tasks. *Chosen for maturity; alternatives evaluated in Phase 6 spike.

## 3. Terminal profiles & setup

- `terminal` registry: name, branch, hardware profile set (printer × n, drawer, scanners, label printer, display), default template bindings.
- **Hardware test/setup screen** in the desktop app: device discovery, test print, drawer kick, scanner test, connection diagnostics — per master prompt §10.
- Profiles stored per device (synced); hot-plug handling; offline operation mandatory (all printing is local).

## 4. Printing pipeline

1. Domain event (e.g. `ReceiptPrintRequested`) → desktop app print queue (persistent, survives restart).
2. Template engine (shared TS/Rust-mirrored layout defs) renders to device commands: thermal receipt (58/80mm), A4/A5 invoice, waybill, labels, customer-statement print.
3. **Reprint policy**: reprint requires `invoice.reprint` / `receipt.reprint` permission; every (re)print writes an `audit_event` (who, when, what, device) — the audit found no such control in legacy.
4. Print failure UX: clear error, retry, fallback printer, queue persistence.

## 5. Templates (Ghana-ready)

- Thermal receipt: business header (name/TIN/phone), items (qty × unit + price), discount line, tax breakdown per current effective rates, tender breakdown, change, balance owed (this receipt's scope — fixing the legacy whole-customer-balance print, `receipt_pos.php:96-101`), footer message, QR (optional).
- A4/A5 tax invoice + proforma; waybill (with booklet-style numbering); deposit slip; customer statement; labels (product, price, shelf/bin).

## 6. Security

- Device permissions are OS-level (USB/serial access); no hardware command exposed to the web layer.
- Drawer kick requires an authenticated shift (cash drawer only opens within an open cashier shift with the invoking user recorded).
- Print service on the API (for network printers in on-prem deployments) is authenticated + audit-logged.

## 7. Mobile (Android/iOS) hardware scope

- Camera-based barcode scanning (ML Kit / VisionCamera code scanner) as default.
- Bluetooth ESC/POS printing via native module for receipt printing on the road (sales-rep flows); label printing out of scope for phones initially.
- No drawer control on mobile.

## 8. Contract testing

- Each adapter has a hardware-adapter contract test (virtual device implementations replaying command streams).
- Golden-byte tests for rendered ESC/POS output per template/profile.
- Physical-lab checklist (Phase 6): tested device matrix published in docs (make/model/transport).
