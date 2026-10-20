// echo for iOS. The frontend is echo's own (web/), and the gomuks backend is linked into
// the app through its C FFI instead of running as a separate server, which iOS doesn't
// allow. See gomuks.rs for the bridge and web/src/api/ffiClient.ts for the other side.

#[cfg(target_os = "ios")]
mod gomuks;

use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  #[cfg(target_os = "ios")]
  let builder = gomuks::install(builder);
  builder
    .setup(|app| {
      // Created here rather than in tauri.conf.json so the page is marked before any of
      // its scripts run: the frontend picks its backend client from __ECHO_FFI__.
      WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .initialization_script("window.__ECHO_FFI__ = true;")
        .build()?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running echo");
}
