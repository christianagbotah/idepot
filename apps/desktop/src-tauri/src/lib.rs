//! iDepot desktop shell library (Tauri 2).
//!
//! Responsibilities (pos-hardware.md §1–§3, offline-sync.md §2):
//!  - load the iDepot web app (backend URL configured per deployment, never
//!    hardcoded to a secret);
//!  - expose SQLite storage to the frontend (tauri-plugin-sql) for the
//!    offline replica + transactional outbox (@idepot/offline engine);
//!  - [Phase 6 hardware spikes] device bridges: barcode scanner
//!    (USB HID needs no bridge — keyboard wedge), ESC/POS printers,
//!    cash drawer kick, label printers.
//!
//! What this shell deliberately does NOT do: financial posting, price/tax
//! computation, or any authoritative business decision — the server-side
//! Posting Coordinator is the single writer of financial truth.

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // The deployment's web app base URL arrives via the
            // IDEPOT_APP_URL environment variable or a settings file next to
            // the executable — never baked into the binary.
            if let Ok(url) = std::env::var("IDEPOT_APP_URL") {
                let window = app
                    .get_webview_window("main")
                    .expect("main window defined in tauri.conf.json");
                let _ = window.eval(&format!("window.location.replace('{url}')"));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running iDepot desktop");
}
