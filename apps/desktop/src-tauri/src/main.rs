// iDepot desktop shell (Tauri 2). The business surface is the iDepot web
// app loaded over the configured backend URL; this shell adds what the
// browser cannot do: durable local SQLite (offline queue), native device
// transports (USB/serial/Bluetooth printers, scanners, drawer) and the
// auto-update channel.
//
// FINANCIAL RULE (PHASE6 handoff B1/B3): all money/stock/tax posting stays
// server-side — this shell NEVER computes or posts authoritative financials.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    idepot_desktop_lib::run();
}
