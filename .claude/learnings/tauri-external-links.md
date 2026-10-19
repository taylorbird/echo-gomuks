# External Links in a Tauri Webview

## Root Cause: Three Handlers, One Silent Failure

The gomuks Go backend writes `target="_blank"` on every link it emits (`pkg/hicli/html.go` lines 228, 243, 409, 417, 442). A Tauri webview has nowhere to put a new tab, so links would silently drop — **except** we installed a click listener to open them via the system browser.

But links still didn't work in production (0.3.0–0.3.5) because of a three-way race in the DOM event bubble phase:

1. `tauri-plugin-shell` unconditionally injects an init script (`js_init_script` in plugin lib.rs, no opt-out) that installs a body click listener.
2. This shell listener captures `target="_blank"` links and calls `plugin:shell|open` — a command that was never granted.
3. Our custom `@tauri-apps/plugin-opener` listener also installs on document, but bubble-phase listeners fire in source order.

The shell listener fires **first** and calls `preventDefault()`. Our listener then sees `evt.defaultPrevented` and bails, never calling `openUrl()`. All three handlers stay silent; the click disappears.

Earlier diagnosis wrongly blamed Tauri ACL remote-origin denial (which was ALSO a bug, but external links failed for a different reason — see tauri-acl.md for that separate issue).

## The Fix: Capture Phase + stopPropagation

Install the custom click listener in the **CAPTURE** phase on `document` (an ancestor):

```javascript
document.addEventListener("click", handleExternalLinks, true); // third arg true = capture phase
```

Capture listeners always fire **before** bubble listeners on the same element. So:

1. Our capture listener fires first and calls `stopPropagation()`.
2. The event no longer bubbles to body.
3. The shell listener never sees the click (propagation stopped at document).
4. Our listener opens the link successfully.

## Side Effect: Spoiler Order

The `TextMessageBody.tsx` component has a spoiler-reveal click handler **on the span itself** (not a document-level listener). Because our listener now fires in the capture phase and stops propagation, it runs **before** the spoiler handler:

- User clicks a spoiler link.
- Capture phase: our external-link handler fires, sees the link, opens it.
- Bubble phase: the spoiler-reveal handler never fires (propagation stopped).

**Fix:** add an explicit unrevealed-spoiler guard in the external-link handler. If the target is inside a spoiler (check `elem.closest('[data-mx-spoiler]')`), skip opening the link — let the spoiler handler run first in a second click.

## Implementation Pattern

```typescript
document.addEventListener(
  "click",
  (evt: Event) => {
    const target = evt.target as HTMLElement;
    
    // Only process left-clicks on links
    if ((evt as MouseEvent).button !== 0) return;
    if (!target.matches("a[href]")) return;
    
    // Skip if already handled
    if (evt.defaultPrevented) return;
    
    // Skip matrix: URIs (handled in-app)
    if (target.href.startsWith("matrix:")) return;
    
    // Skip unrevealed spoilers (let spoiler-reveal handler run first)
    if (target.closest("[data-mx-spoiler]")) return;
    
    // Skip same-origin links (no session cookie in system browser)
    if (isSameOrigin(target.href)) return;
    
    // Open external link
    evt.preventDefault();
    evt.stopPropagation(); // CRITICAL: stop shell listener
    openUrl(target.href);
  },
  true // CRITICAL: capture phase
);
```

## Gotchas

- The `tauri-plugin-shell` init script cannot be disabled — it's mandatory for the shell plugin to work (sidecar spawning depends on it). The competing listener is a side effect, not optional.
- If external links break again in the future, check for competing listeners in the bubble phase (shell plugin is mandatory and will always be there).
- Same-origin media/download links still do nothing (opening them in the system browser would fail auth). This needs a separate solution (in-app viewer, or a signed short-lived URL).

## Opener Plugin: Split Permission

Note that `@tauri-apps/plugin-opener` has a split permission set:
- `opener:allow-open-url` grants the **command**
- `opener:allow-default-urls` grants the **URL scope** (http:/*, https:/*, mailto:*, tel:*)

Without the URL scope permission, all calls fail silently with `ForbiddenUrl` error. Both must be granted in capabilities/default.json.

## Same-Origin Download Links with Tauri on_download (2026-09-25)

**Problem (0.7.1):** Same-origin media/file links in chat (`href="/media/upload/xyz"` with `target="_blank"`) were silently dropped. The shell plugin's injected listener was consuming them.

**Solution:** Installed a capture-phase click handler that calls `stopPropagation()`, blocking the shell listener from seeing same-origin links. The handler re-clicks a target-less copy to trigger the browser's native download mechanic.

**macOS Tauri wry on_download callback (2026-09-25):**

The callback receives Requested and Finished events:
- **Requested event:** has the destination path where wry will save (e.g., `~/Downloads/<filename>` with `"(<n>)"` suffix on collision)
- **Finished event:** has the final result, but **no path field on macOS** — must remember the destination from the Requested event

**Pattern (lib.rs attachment_download_handler):**
1. Store destination from Requested: `pending_downloads.insert(url, path)`
2. On Finished, look up the path: `let path = pending_downloads.remove(&url)`
3. For allowlisted MIME types: open with `tauri_plugin_opener::open_path(path)`
4. For everything else: reveal in Finder with `reveal_item_in_dir(path)`
5. Downloads automatically carry `com.apple.quarantine` xattr (wry sets it; Gatekeeper marker)

**Allowlist for auto-opening (0.7.1):**
- Documents: pdf, txt, md, rtf, csv
- Office: docx, xlsx, pptx, odt, ods, odp
- Common media: mp3, m4a, aac, wav, flac, aiff, ogg, flv, mov, mp4, m4v, mkv, webm
- Everything else (images, scripts, pkg, app, html, unknown): reveal in Finder

Rationale: auto-opening executables, scripts, or HTML is a security risk; user can open them manually from Finder.
