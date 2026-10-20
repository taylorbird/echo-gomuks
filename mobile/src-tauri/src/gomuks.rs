// The gomuks backend linked into the app through its C FFI (pkg/ffi/gomuksffi.h), and the
// three ways the frontend reaches it: Tauri commands for its JSON command protocol, a
// Tauri event for everything it pushes, and the gomuks:// URL scheme for the _gomuks
// HTTP paths the frontend still uses (media and URL previews), since there is no server.

use std::collections::HashMap;
use std::ffi::{c_char, c_int, CStr, CString};
use std::fs;
use std::sync::{Mutex, OnceLock};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::http::{Request as HttpRequest, Response as HttpResponse, StatusCode};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Builder, Emitter, Manager, Wry};

#[repr(C)]
struct BorrowedBuffer {
  base: *const u8,
  length: usize,
}

#[repr(C)]
struct OwnedBuffer {
  base: *mut u8,
  length: usize,
}

#[repr(C)]
struct Response {
  buf: OwnedBuffer,
  // Static in gomuks: reused for every response, never freed.
  command: *const c_char,
}

type Handle = usize;
type EventCallback = extern "C" fn(*const c_char, i64, OwnedBuffer);
type ProgressCallback = extern "C" fn(f64);
type StreamCallback = Option<extern "C" fn(BorrowedBuffer)>;

extern "C" {
  fn GomuksInit(root: *mut c_char) -> Handle;
  fn GomuksStart(handle: Handle, callback: EventCallback) -> c_int;
  fn GomuksDestroy(handle: Handle);
  fn GomuksSubmitCommand(handle: Handle, command: *mut c_char, data: BorrowedBuffer) -> Response;
  fn GomuksUploadMediaBytes(
    handle: Handle,
    params: BorrowedBuffer,
    media: BorrowedBuffer,
    cb: ProgressCallback,
  ) -> Response;
  fn GomuksDownloadMediaPath(handle: Handle, params: BorrowedBuffer, cb: StreamCallback) -> Response;
  fn GomuksFreeBuffer(buf: OwnedBuffer);
}

static APP: OnceLock<AppHandle<Wry>> = OnceLock::new();
// Zero until GomuksStart succeeds. Every other Gomuks* call panics in Go before that.
static HANDLE: Mutex<Handle> = Mutex::new(0);

fn borrow(bytes: &[u8]) -> BorrowedBuffer {
  BorrowedBuffer { base: bytes.as_ptr(), length: bytes.len() }
}

// Copies an owned buffer out and hands it back to gomuks to free.
fn take_string(buf: OwnedBuffer) -> String {
  if buf.base.is_null() {
    return String::new();
  }
  let text = unsafe { String::from_utf8_lossy(std::slice::from_raw_parts(buf.base, buf.length)).into_owned() };
  unsafe { GomuksFreeBuffer(buf) };
  text
}

// ("response" | "error", JSON).
fn response_parts(resp: Response) -> (String, String) {
  let command = if resp.command.is_null() {
    String::from("error")
  } else {
    unsafe { CStr::from_ptr(resp.command) }.to_string_lossy().into_owned()
  };
  (command, take_string(resp.buf))
}

fn started_handle() -> Result<Handle, String> {
  match *HANDLE.lock().unwrap() {
    0 => Err(String::from("gomuks isn't running")),
    handle => Ok(handle),
  }
}

#[derive(Clone, Serialize)]
struct FfiEvent {
  command: String,
  request_id: i64,
  data: String,
}

// Called on gomuks's goroutine threads for every event (sync, client state, typing...).
extern "C" fn on_event(command: *const c_char, request_id: i64, data: OwnedBuffer) {
  let command = if command.is_null() {
    String::new()
  } else {
    unsafe { CStr::from_ptr(command) }.to_string_lossy().into_owned()
  };
  let data = take_string(data);
  if let Some(app) = APP.get() {
    let _ = app.emit("gomuks-event", FfiEvent { command, request_id, data });
  }
}

extern "C" fn ignore_progress(_progress: f64) {}

// Starts gomuks with its data under the app's own data directory. A reloaded page calls
// this again, and gets a fresh instance so it receives the initial state it needs.
fn start(app: &AppHandle<Wry>) -> Result<(), String> {
  let _ = APP.set(app.clone());
  let mut handle = HANDLE.lock().unwrap();
  if *handle != 0 {
    unsafe { GomuksDestroy(*handle) };
    *handle = 0;
  }
  let root = app.path().app_data_dir().map_err(|err| err.to_string())?;
  fs::create_dir_all(&root).map_err(|err| format!("couldn't create {}: {err}", root.display()))?;
  let root = CString::new(root.to_string_lossy().into_owned()).map_err(|err| err.to_string())?;
  let new_handle = unsafe { GomuksInit(root.as_ptr() as *mut c_char) };
  if new_handle == 0 {
    return Err(String::from("gomuks failed to initialize"));
  }
  let rc = unsafe { GomuksStart(new_handle, on_event) };
  if rc != 0 {
    unsafe { GomuksDestroy(new_handle) };
    return Err(format!("gomuks failed to start (code {rc})"));
  }
  *handle = new_handle;
  Ok(())
}

#[tauri::command]
async fn gomuks_start(app: AppHandle<Wry>) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || start(&app))
    .await
    .map_err(|err| err.to_string())?
}

fn submit(command: &str, data: &str) -> Result<(String, String), String> {
  let handle = started_handle()?;
  let command = CString::new(command).map_err(|err| err.to_string())?;
  let resp = unsafe { GomuksSubmitCommand(handle, command.as_ptr() as *mut c_char, borrow(data.as_bytes())) };
  Ok(response_parts(resp))
}

// One request of the same JSON protocol the websocket carries. Blocking in gomuks, so off
// the async runtime: some commands (pagination, room state) wait on the homeserver.
#[tauri::command]
async fn gomuks_command(command: String, data: String) -> Result<(String, String), String> {
  tauri::async_runtime::spawn_blocking(move || submit(&command, &data))
    .await
    .map_err(|err| err.to_string())?
}

// Raw file bytes as the body, upload parameters (filename, encrypt) in a header.
#[tauri::command]
async fn gomuks_upload(request: Request<'_>) -> Result<(String, String), String> {
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err(String::from("upload body must be raw bytes"));
  };
  let bytes = bytes.clone();
  let params = request
    .headers()
    .get("x-gomuks-params")
    .and_then(|value| value.to_str().ok())
    .unwrap_or("{}")
    .to_owned();
  tauri::async_runtime::spawn_blocking(move || {
    let handle = started_handle()?;
    let resp = unsafe { GomuksUploadMediaBytes(handle, borrow(params.as_bytes()), borrow(&bytes), ignore_progress) };
    Ok(response_parts(resp))
  })
  .await
  .map_err(|err| err.to_string())?
}

fn parse_query(query: &str) -> HashMap<String, String> {
  query
    .split('&')
    .filter(|pair| !pair.is_empty())
    .map(|pair| {
      let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
      let decode = |part: &str| percent_decode_str(&part.replace('+', " ")).decode_utf8_lossy().into_owned();
      (decode(key), decode(value))
    })
    .collect()
}

fn respond(status: StatusCode, content_type: &str, body: Vec<u8>) -> HttpResponse<Vec<u8>> {
  HttpResponse::builder()
    .status(status)
    .header("Content-Type", content_type)
    // Media is also fetched (downloads, the lightbox's file details), not only shown in <img>.
    .header("Access-Control-Allow-Origin", "*")
    .header("Cache-Control", "private, max-age=86400")
    .body(body)
    .unwrap()
}

fn respond_error(status: StatusCode, message: &str) -> HttpResponse<Vec<u8>> {
  respond(status, "text/plain; charset=utf-8", message.as_bytes().to_vec())
}

// Same letter tile as pkg/gomuks/mediadownload.go's fallbackAvatarTemplate, for avatars
// that fail to load: the frontend asks for it with fallback=<colour>:<letter>.
fn fallback_avatar(fallback: &str) -> Option<HttpResponse<Vec<u8>>> {
  let (color, letter) = fallback.split_once(':')?;
  let letter = letter.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
  let color = color.replace(['"', '<', '>'], "");
  let svg = format!(
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1000 1000\">\n  \
     <rect x=\"0\" y=\"0\" width=\"1000\" height=\"1000\" fill=\"{color}\"/>\n  \
     <text x=\"500\" y=\"750\" text-anchor=\"middle\" fill=\"#fff\" font-weight=\"bold\" font-size=\"666\"\n    \
     font-family=\"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif\"\n  \
     >{letter}</text>\n</svg>"
  );
  Some(respond(StatusCode::OK, "image/svg+xml", svg.into_bytes()))
}

fn serve_media(server: &str, media_id: &str, query: &HashMap<String, String>) -> HttpResponse<Vec<u8>> {
  let fallback = query.get("fallback").map(String::as_str).unwrap_or("");
  let thumbnail = query.get("thumbnail").map(String::as_str) == Some("avatar");
  let params = serde_json::json!({
    "mxc": format!("mxc://{server}/{media_id}"),
    "encrypted": query.get("encrypted").map(String::as_str) == Some("true"),
    "is_avatar": !fallback.is_empty(),
    "thumbnail_avatar": thumbnail,
  })
  .to_string();
  let fail = |status: StatusCode, message: &str| fallback_avatar(fallback).unwrap_or_else(|| respond_error(status, message));
  let handle = match started_handle() {
    Ok(handle) => handle,
    Err(err) => return fail(StatusCode::SERVICE_UNAVAILABLE, &err),
  };
  let (command, body) = response_parts(unsafe { GomuksDownloadMediaPath(handle, borrow(params.as_bytes()), None) });
  if command != "response" {
    return fail(StatusCode::NOT_FOUND, &body);
  }
  let info: serde_json::Value = match serde_json::from_str(&body) {
    Ok(info) => info,
    Err(err) => return fail(StatusCode::INTERNAL_SERVER_ERROR, &err.to_string()),
  };
  let text = |key: &str| info.get(key).and_then(|v| v.as_str()).unwrap_or("").to_owned();
  // Avatar thumbnails are always square WebP; without one, the original is the next best.
  let (path, mime) = match (thumbnail, text("thumbnail_path")) {
    (true, thumb) if !thumb.is_empty() => (thumb, String::from("image/webp")),
    _ => (text("path"), text("mime_type")),
  };
  match fs::read(&path) {
    Ok(bytes) => respond(StatusCode::OK, if mime.is_empty() { "application/octet-stream" } else { &mime }, bytes),
    Err(err) => fail(StatusCode::INTERNAL_SERVER_ERROR, &format!("couldn't read cached media: {err}")),
  }
}

fn serve_url_preview(query: &HashMap<String, String>) -> HttpResponse<Vec<u8>> {
  let params = serde_json::json!({
    "url": query.get("url").cloned().unwrap_or_default(),
    "encrypt": query.get("encrypt").map(String::as_str) == Some("true"),
  })
  .to_string();
  match submit("get_url_preview", &params) {
    Ok((command, body)) if command == "response" => respond(StatusCode::OK, "application/json", body.into_bytes()),
    Ok((_, body)) => respond_error(StatusCode::INTERNAL_SERVER_ERROR, &body),
    Err(err) => respond_error(StatusCode::SERVICE_UNAVAILABLE, &err),
  }
}

fn serve(request: HttpRequest<Vec<u8>>) -> HttpResponse<Vec<u8>> {
  let path = request.uri().path().to_owned();
  let query = parse_query(request.uri().query().unwrap_or(""));
  if let Some(rest) = path.strip_prefix("/_gomuks/media/") {
    let mut parts = rest.splitn(2, '/');
    let server = percent_decode_str(parts.next().unwrap_or("")).decode_utf8_lossy().into_owned();
    let media_id = percent_decode_str(parts.next().unwrap_or("")).decode_utf8_lossy().into_owned();
    if server.is_empty() || media_id.is_empty() {
      return respond_error(StatusCode::BAD_REQUEST, "bad media path");
    }
    return serve_media(&server, &media_id, &query);
  }
  if path == "/_gomuks/url_preview" {
    return serve_url_preview(&query);
  }
  respond_error(StatusCode::NOT_FOUND, &format!("{path} isn't available in the iOS app"))
}

pub fn install(builder: Builder<Wry>) -> Builder<Wry> {
  builder
    .invoke_handler(tauri::generate_handler![gomuks_start, gomuks_command, gomuks_upload])
    .register_asynchronous_uri_scheme_protocol("gomuks", |_ctx, request, responder| {
      // Downloads block on the homeserver; keep them off the webview's thread.
      std::thread::spawn(move || responder.respond(serve(request)));
    })
}
