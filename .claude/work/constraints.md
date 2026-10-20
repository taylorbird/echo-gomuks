# Constraints Ledger

Each constraint is dated with its origin and rationale. One-liners live in current.md for quick reference; full details here.

## 2026-10-19 (MSC4529 profile overrides, profile card, 0.7.4)

### Anything sent to a room uses real names
Mentions (autocomplete, sender-click), widget userDisplayName, and any other room-bound text use `getRealDisplayname`. `getDisplayname` and `getAvatarURL` apply overrides. **Rationale:** a private nickname is local-only and must never reach the room.

### Profile override storage and encryption rules
Account data `org.matrix.msc4529.profile_overrides`; the stable `m.profile_overrides` type is preferred when present; writes go to whichever type was read (MSC unstable-prefix rules). Module: web/src/api/profileoverrides.ts (leaf module, no store imports). MSC4483-encrypted override events are ignored and editing is refused. **Rationale:** plaintext must never overwrite ciphertext.

### User profiles open as a card, not the side panel
`MainScreen.setRightPanel({type:"user"})` is intercepted and calls `openProfileCard` (web/src/ui/profilecard/open.tsx), opened as a nestable modal so its sub-pop-ups stack above it. The side-panel UserInfo view is unreachable but left untouched for clean upstream syncs. Lists (members, threads, pinned, search) stay in the docked right panel. **Rationale:** the 300px panel was cramped on a 14-inch MacBook; the card is also meant for a future right-click card.

### Custom modal boxes: inner wrapper overflow visible
profile-card-box and profile-override-box set `div.modal-box-inner` to `overflow: visible`. **Rationale:** that wrapper is overflow:auto (ui/modal/Lightbox.css); content past its edge lets WebKit scroll the box sideways on focus/hover and clips absolutely positioned bars.

### Override and profile pictures: PNG, JPEG, WebP, GIF only, decode-checked
`preparePicture` in web/src/ui/modal/uploadavatar.ts; also applied to the own-profile editor. **Rationale:** an SVG uploaded fine but the server cannot thumbnail it, so it showed as a letter tile.

### Card avatar loads full resolution
**Rationale:** the backend answers a failed thumbnail with a fallback tile (200), not an error, so an onError fallback cannot trigger.

### Start chat confirms before creating a DM
Commit 833e143b. **Rationale:** the Start chat button creates a new DM on the server; the user asked for a confirmation first.

### Stay on gomuks; try the gomuks FFI mobile path first
Sable-next was evaluated and not chosen for now. **Rationale (observed):** it is Svelte + Rust (none of echo's React code transfers), about two months old, has one main author, and its CONTRIBUTING.md declines AI-generated contributions. Findings are in learnings/portability.md ("The FFI path", "Sable-next as an alternative base").

### Feature releases in 0.7.x are patch bumps
0.7.4 was a patch bump. **Rationale:** the 0.7.x convention is patch releases for features (0.7.1 and 0.7.3 followed it).

## 2026-07-28 (migrated from prior current.md)

### Architecture
**Tauri 2.0** — native macOS app shell (named "Seabug"), supports iOS/Android. **React frontend** in web/src/, connects to backend via WebSocket. **Go backend** spawned as sidecar, manages Matrix protocol, starts/stops with app. **Auth** via custom WebAuthLogin component for Tauri (browser uses HTTP Basic Auth).

### Theme
- Font: Lato (400 weight, 14px base)
- Surfaces (room list, space rail, right panel): Ferra warm with high-alpha tints (was transparent in Tauri, so tone would match the opaque chat pane)
- Chat pane: cool near-black `#16181f`, scoped to `div.room-view` only; composer `#1e212a` (lighter than pane)
- Body text: warm off-white `#efe7e1` (was saturated peach `#fecdb2`); secondary `#b8aca6` (was cool lavender `#d1d1e0`); sender name `.875rem` weight-600 tracking `.015em` (label over message, not competing)
- Accent glow: `#ffe484`
- Saturated candy sender colours: `#ff5d73`, `#ffa64d`, `#4dd6a8`, `#a78bfa`, `#4db8f5`, `#ffd93d`, `#ff7ac6`, `#4de0e0`, `#ff8a65`, `#a3e635`
- Room header: `--room-header-height` token (macOS: 4.75rem), title 1.375rem bold, avatar 3rem
- Right panel: raised over chat pane (mirrored shadow, z-index 3), background matches room-list
- Panes: square corners (no radius), floating with `.5rem` gaps, shadow, flush against title bar. Modals exception: `.625rem` box radius, `.375rem` section cards (blur backdrop makes sharp corners harsh)
- Icon: custom lobster/seabug on blue background
- Icon set: hand-authored outlined Lucide-style in `web/src/icons/modern/` for sidebar/space-rail/room-header/settings; filled Material Symbols for rest of app

### Technology
- Vite dev port pinned to 6173 with `strictPort: true` — otherwise port-walking could load a different local project into Seabug. `devUrl` in `tauri.conf.json` must match.
- All macOS-native chrome CSS scoped to `html[data-tauri]` so plain-browser use is unaffected
- App Store distribution NOT a constraint; `macOSPrivateApi: true` acceptable
- Reading surfaces (chat/timeline) stay fully opaque — text contrast never depends on wallpaper showing through vibrancy
- macOS "Reduce motion" is ON by default on this machine — every `prefers-reduced-motion` rule must require `data-ignore-reduce-motion` to be absent, or animation will never run
- Dark surfaces need light edge lines, not darker shadows — a pure black shadow is invisible on the near-black chat pane, so separation on dark surfaces comes from a light edge line
- Single `--room-header-height` token shared by room header, room-list search row, and right-panel header — keeps top edges aligned
- Do NOT build modal/settings surfaces on `--room-list-background-overlay` — forced `transparent` inside `html[data-tauri]` to show vibrancy; derive from `--background-color` via `color-mix` instead

### Mobile plans
**SUPERSEDED 2026-09-01** — see "Mobile strategy (2026-09-01)" below.

Tauri 2.0 supports iOS/Android. Plan to use **matrix-rust-sdk** for backend:
- Runs natively in Tauri's Rust layer (not a sidecar)
- Works on all platforms
- Used by Element X
- Single codebase for desktop + mobile

## 2026-08-06 (URL previews + Quick Switcher)

### Modal edge idiom
On warm modal surfaces, solid `border` lines in theme colors are INVISIBLE. Working edge treatment: `inset 0 0 0 1px rgba(255,255,255,.18)` hairline ring (light) + `0 0 0 1px rgba(0,0,0,.6)` dark seam + two-layer neutral drop shadow + faint accent underglow `0 36px 100px rgba(255,228,132,.06)`.

### Quick Switcher reduced frosting
Transient launcher gets less blur than other modals — scoped via `div.overlay.modal:has(> div.modal-box.quick-switcher-modal)` override: `blur(3px)`, `rgba(0,0,0,.12)` vs app-wide `20px`/`.5`.

### Section dividers in quick switcher
Edge-to-edge 1px lines under search and above actions use `--quick-switcher-divider: color-mix(in srgb, var(--semisecondary-text-color) 40%, transparent)`. The 40% value chosen so the line optically matches the weight of small ROOMS/ACTIONS label text — full-strength 1px line reads brighter than small text in same ink.

### E2EE URL preview privacy
Encrypted rooms never auto-fetch URL previews by default (new preference `auto_load_encrypted_url_previews`, default false) — fetching leaks URLs to the homeserver, exposing reading activity.

### Webview preview tier is click-only
Hidden-webview OG fetches deliberately never auto-run — not even for recent messages. Auto mode would execute arbitrary posted URLs' JS on the local machine. Click-only so user explicitly opts into fetches.

## 2026-08-21 (candy color + room-list redesign, space dashboard, cheat console, platform alignment)

### Room-list virtualization prohibited
Room-list entries (`div.room-entry`) must NOT use `content-visibility: auto` / `contain: strict`. Reason: WebKit defers repaints of these elements until the next browser event loop cycle. During fast Alt+↑/↓ navigation, the old room's `.active` class removal and the new room's `.active` class addition both paint-defer, leaving two rooms visually highlighted for ~100ms until HMR or user interaction triggers another repaint. The `useContentVisibility` React hook depends on the `contentvisibilityautostatechange` event firing on the element itself, so the CSS property and the hook must be removed together. Entries now render unconditionally (no lazy mounting), trading memory for reliable visual state.

### useSyncExternalStore snapshot stability
`useSyncExternalStore` snapshot getters (e.g., `RoomStateStore.getMembers()`) must return stable references for empty collections. Returning a fresh `[]` on each call — even when the collection is logically empty — causes an infinite re-render loop because React sees the snapshot change (new `[]` object !== old `[]` object) on every render cycle. Solution: use a module-level `emptyMembers` constant that all empty cases return. This latent bug was exposed by the dashboard rendering member-related hooks on freshly-opened spaces before the space had any member state loaded.

### Tauri version lockstep requirement
The `tauri` crate minor version in `src-tauri/Cargo.toml` must stay in lockstep with the `@tauri-apps/api` npm package minor version. Mismatched minors (e.g., tauri 2.10 + @tauri-apps/api 2.11) cause a version-mismatch error at startup and suspected failures in plugin IPC (external links, clipboard, etc.). Always align them when upgrading — check the installed CLI's crate version, match the npm package, and rebuild both.

### Clipboard write fallback for WKWebView
WKWebView on macOS rejects `navigator.clipboard.writeText()` with no permission delegate available (unlike UIWebView on iOS or full Safari). Replace all bare `navigator.clipboard.writeText()` calls with `web/src/util/clipboard.ts` `copyToClipboard()`, which tries the Clipboard API first and falls back to `execCommand("copy")` on a hidden textarea if the promise rejects. This is used in ShareModal, useSecondaryItems (toggle images), and elsewhere.

### Timeline sender colors and per-user overrides
Sender names in the timeline use per-color `sender-color-N` CSS classes (generated via `getUserColorIndex()` from palette). Custom user colors and cheat overrides apply via `getUserColorOverride()` returning an inline `style={{ color: overrideColor }}` on the text element itself, not via class. This is necessary because the timeline's `sender-color-N` classes live on the `span` containing the name, and inline styles have higher specificity than classes — without this, custom color settings never take effect. The same pattern applies in ReplyBody.tsx.

### Preference category declaration required
Every preference must declare a `category` field (`appearance` / `chat` / `media` / `input` / `notifications` / `advanced`, with `advanced` as the fallback). The decision rule for scope is: "Would a reasonable person set this differently per room vs. globally, or per device vs. globally?" If yes, keep it scoped to the narrower context; if no, move it to global (anyGlobalContext). In 2026-08-21, 15 preferences were moved to global (code_block_theme, code_block_line_wrap, pointer_cursor, uniform_room_list_color, custom_css, favicon, small_replies, show_date_separators, upload_dialog, map_provider, leaflet_tile_template, gif_provider, message_context_menu, ctrl_enter_send, ctrl_arrow_reply). Stored values in removed scopes are ignored (not deleted) so reverting is safe.

### Zero-lint / zero-tsc baseline
As of 2026-08-21, the project compiles with zero TypeScript errors and zero eslint errors across all touched files. This baseline must be maintained: new code must pass `npx tsc -b` and `npx eslint` clean, with no passing of `--fix` or `--ignore-errors` flags. Pre-existing errors in untouched files are not attributable to new work and may be addressed separately.

## 2026-08-25 (production architecture, ACL discovery, font/timeline revisions, rebrand)

### Production webview architecture
**Prod webview loads http://localhost:29325 directly** — the same-origin backend URL, NOT the static dist served via tauri://. Root cause analysis found cross-origin tauri://localhost → http://localhost:29325 is impossible without server changes: Go server has no CORS middleware (exhttp.AutoAllowCORS=false in cmd/gomuks/main.go), and gomuks_auth cookie is SameSite=Lax (insecure_cookies strips Secure, incompatible with SameSite=None). **Never revert to static dist serving in prod.** Implementation: `src-tauri/src/lib.rs` waits for backend TCP readiness (500ms connect timeout, 100ms interval, 15s deadline) then builds the window with url overridden to the backend origin; dev branch unchanged (cfg!(debug_assertions)); `tauri.conf.json` windows[0] got `"create": false`. Frontend plumbing kept from earlier cross-origin attempt (web/src/api/backend.ts: BACKEND_URL/BACKEND_WS_URL/isTauri exports; all _gomuks call sites routed through it; gomuksWebWasm guarded with !window.__TAURI_INTERNALS__) — harmless same-origin, keeps dev working. **Consequence:** sidecar go:embeds web/dist, so any frontend change shipping to prod requires npm run build → go build ./cmd/gomuks → npx tauri build, in that order.

### Tauri ACL remote-origin discovery
**capabilities/default.json must have a `remote.urls` entry for http://localhost:29325 or ALL prod IPC is silently denied.** When a window loads an http:// URL (even localhost), Tauri treats it as REMOTE origin. Capabilities need an explicit `remote.urls` block or every IPC call fails silently. Dev is exempt because devUrl is the app URL (local origin). Also: `core:window:allow-start-dragging` is NOT in core:default and must be granted explicitly. **Side effect fixed:** external link opening via opener plugin now works in prod. **Known gap:** fetch_og_tags app command still needs an app permission file + capability entry (URL-preview webview tier dead in prod, needs follow-up work).

### Fonts: Inter base + Space Grotesk display (2026-08-25) — AMENDED 2026-09-17
**Original (2026-08-25):** Base font Inter 400-700; Display font Space Grotesk 400-700 via `--display-font-stack` token (names, titles, usernames). Lato fully replaced 2026-08-24. **AMENDED:** Space Grotesk entirely removed 2026-09-17. See "Typography: Inter everywhere (2026-09-17)" above.

### Timeline sender styling refresh
Sender row gets `min-height: calc(var(--timeline-avatar-size) - .25rem)` so the name centers on the avatar and text starts below it. `--timeline-sender-name-content-gap` back to 0. Sender names dimmed via `opacity: .75` on span.event-sender (opacity chosen over color tokens so per-user overrides/cheats dim equally). All sender names now .875rem/600/.015em tracking ("label" treatment). `--timeline-avatar-gap` doubled .5rem → 1rem. Dark-mode `--sender-color-5` changed #ffd93d → #f0c674 (honey gold; pure yellow mustardy under 75% dim).

### Rebrand: Seabug → echo
**Bundle ID: com.tbird.echo** (was app.gomuks.desktop). Window title, productName in tauri.conf.json, SettingsView masthead eyebrow, WebAuthLogin heading ("echo"), index.html <title> all set to "echo" (lowercase brand). localStorage keys `seabug.collapsed_room_list_sections` + `seabug_active_cheats` deliberately NOT renamed (would wipe browser-user state; migration shim is the option if needed later). **Side effect:** Bundle-ID change reset WKWebView storage (custom colors, cheats, collapsed sections) — one-time cost, accepted. **SUPERSEDED 2026-08-27:** Bundle ID changed again to `dev.tbird.echo` to match debug-profile naming convention (dev builds use `-dev` suffix). This reset WKWebView a second time (acceptable, already reset in 0.3.1). Data now lives under `~/Library/{Application Support,Caches,Logs}/dev.tbird.echo/`.

### Icon locked: low-poly faceted penguin
**Source of truth:** design/ folder (echo-penguin-facet.svg exact SVG outline + facets, echo-penguin-layer.png 1024 transparent RGBA). Icon set regenerated via `npx tauri icon design/echo-penguin-layer.png`. @tauri-apps/cli bumped ^2.10.0 → ^2.11.0 (installed 2.11.4; adds .icon/Assets.car bundler support). **Known blocker:** User's Icon Composer .icon (echo.icon, echo penguin side profile, pale-blue belly, violets #A78BFA→#4C1D95, blues #BFDBFE→#2563EB) crashes actool deterministically with "attempt to insert nil object" when its SVG layer uses clipPath. **Workaround:** must re-export using PNG layer instead. Until then, production builds require temporarily removing "icons/echo.icon" from bundle.icon; restore after. The 18:03 build that appeared successful is unexplained (possibly actool cache).

## 2026-08-27 (release pipeline, icon actool fix, TAC, external links, auth, storage, release.sh bugs)

### Bundler must never run actool — icons/Assets.car pre-compiled by release.sh
**Blocker root cause:** The "attempt to insert nil object" crash is a wedged ibtoold daemon (actool's persistent daemon), not .icon content or SVG layers. Once wedged, EVERY .icon compile fails — same package, any path, any layer type — and the identical command that succeeded minutes earlier fails. `killall ibtoold` fixes it deterministically. **Solution:** tauri-bundler (tauri-cli 2.11.4 confirmed in source code) accepts a pre-compiled Assets.car in bundle.icon and skips actool entirely — it copies .car files as-is. **Implementation:** scripts/release.sh pre-compiles icons/Assets.car with `xcrun actool` before every `npx tauri build`, with a 5-attempt retry loop (killall ibtoold between attempts). tauri.conf.json bundle.icon lists "icons/Assets.car" first (echo.icon stays on disk as the source of truth; release.sh recompiles the car each release). **Consequence:** the Icon Composer .icon package (user's approved Facet Split design) can stay in place; the SVG-layer-crashes-actool issue is moot now that actool never runs.

### No tauri icon / tauri.conf edits while tauri dev runs (watcher restart storms kill sidecar)
**Gotcha:** `npx tauri dev` watches ALL of `web/src-tauri/` and restarts the app on every changed file. Running `npx tauri icon` while dev is running rewrites dozens of files under `src-tauri/icons/`, each triggering its own rebuild+restart. Rapid kill/spawn cycles race the sidecar on port 29325 and reliably end with a dead backend. Similarly, any `tauri.conf.json` edit restarts the app, and the backend is down for ~30-60s during handover. **Prevention:** Stop `tauri dev` before running release.sh (which invokes both `npx tauri icon` internally and `tauri build`). For dev-only icon tweaks, edit/test without tauri dev running, or set up a separate branch that commits icon changes.

### Tauri ACL: remote-origin commands require explicit app manifest + capability entries
**Root cause:** Tauri treats http:// URLs (including localhost) as **remote** origins. When a window loads a remote origin, every app-defined command (`#[tauri::command]`) is ACL-checked and denied unless a capability names it — unlike dev, where local origins bypass the check. This silently killed `restart_for_update` and `fetch_og_tags` in production (0.3.0–0.3.5) because commands were declared in Rust but had no capability entries. **Fix:** (1) Declare commands in `build.rs` via `tauri_build::AppManifest::new().commands(&[...])` to generate `allow-<kebab-command>` identifiers; (2) grant those generated identifiers in `capabilities/default.json` under the `remote.urls` block. The `remote.urls` block itself is also mandatory — without it, ALL IPC to remote origins is denied. Also: declaring an app manifest makes ALL app commands ACL-checked **including** local origins in dev, so this must be done correctly or both dev and prod break. **Consequence:** any new `#[tauri::command]` must be added to both build.rs and capabilities/default.json or it silently fails in both environments.

### opener plugin needs both command permission AND URL scope permission
**Gotcha:** `@tauri-apps/plugin-opener`'s permission set is split: `opener:allow-open-url` grants the COMMAND, while `opener:allow-default-urls` grants the URL SCOPE (http:/*, https:/*, mailto:*, tel:*). Having only the command permission causes all `openUrl` calls to fail silently with `ForbiddenUrl` error (swallowed to console.error). **Fix:** include both permissions in `capabilities/default.json`. Other plugins may split permissions similarly — check the plugin source code and the generated `allow-<command>` identifiers.

### External-link click handler must stay in CAPTURE phase
**Root cause:** `tauri-plugin-shell` unconditionally injects a body click listener via an init script (`js_init_script`, lib.rs:105, no opt-out). This listener captures `target="_blank"` links and calls `plugin:shell|open` — a command that was never granted. All three link-handler components (`tauri-plugin-opener`, `@tauri-apps/plugin-shell`, and custom handlers) compete in the bubble phase. The shell listener fires second (after custom handlers due to event source ordering) but `preventDefault()` gets called first, then the shell listener sees `defaultPrevented` and bails. **Fix:** install the custom handler in the **CAPTURE** phase on an ancestor (`document`). Capture listeners always fire before bubble listeners on the same element, so the custom handler fires first, calls `stopPropagation()`, and the shell listener never sees the event. **Side effect:** capture phase runs before the spoiler-reveal handler in `TextMessageBody`, so an explicit unrevealed-spoiler guard was added — otherwise clicking a spoiler would open the link it was hiding.

### Sidecar storage isolated via GOMUKS_*_HOME environment variables
**Problem:** The gomuks sidecar picked its own directories keyed on the name "gomuks", which collided with a real gomuks install on the user's machine. `tauri dev` shared both the SQLite database AND port 29325 with the production app. **Fix:** `lib.rs` passes `GOMUKS_CONFIG_HOME`, `GOMUKS_DATA_HOME`, `GOMUKS_CACHE_HOME`, `GOMUKS_LOGS_HOME` at sidecar spawn, resolved from Tauri's path API (keyed on the bundle identifier `dev.tbird.echo`). Debug builds get a `-dev` suffixed profile, so `tauri dev` can never touch installed-app data. **Migration:** one-time fs::rename of three directories with fallback to old directory if rename fails ("postpone tidiness rather than risk losing state"). Verified live: all three directories moved, database byte-identical, crypto operations worked immediately after. **Data locations:** `~/Library/{Application Support,Caches,Logs}/dev.tbird.echo/` (production); `~/Library/{Application Support,Caches,Logs}/dev.tbird.echo-dev/` (dev). A backup at `~/Library/Application Support/gomuks.backup-pre-migration` can be deleted once 0.3.7 is confirmed healthy.

### Backend auth fixed: no stdin prompts on fresh installs
**Problem:** `pkg/gomuks/config.go:139` prompts on stdin if auth is enabled and credentials are blank. A Tauri sidecar gets pipes, not a TTY, so the prompt fails with EOF and the backend exits before binding its port. echo ≤0.3.0 could not start for anyone without a pre-existing gomuks config. Note: the config key `disable_auth_because_i_want_my_account_to_be_hacked` does NOT avoid this — the prompt is gated on `DisableAuth`, not the config value. **Fix:** `ensure_backend_config` in `lib.rs` writes random bcrypt-hashed credentials before the sidecar spawns, discards the plaintext immediately. Nothing can log in with it (the password is never stored) and nothing needs to. The app authenticates by minting its own session token via the webview initialization script. Verified end-to-end on a genuinely fresh profile: backend starts cleanly, session token 200s, invalid tokens 401s.

### WebKit store is deliberately NOT migrated between bundle IDs
**Rationale:** The bundle ID changed from `com.tbird.echo` to `dev.tbird.echo` in 0.3.1, which cleared the WebKit-managed localStorage/sessionStorage (user colors, cheats, collapsed sections, all UI state). This was a one-time cost, accepted over the risk of corrupting the store with a rename operation on an undocumented container (macOS owns it, layout is not a public contract). **Consequence:** users see a re-login and reset UI prefs after 0.3.1. Backup exists at `~/Library/Application Support/gomuks.backup-pre-migration` for data recovery if needed.

### insecure_cookies: true is deliberate but NOT strictly required
**Rationale:** The config key `insecure_cookies: true` clears the `Secure` flag on HTTP cookies (`server.go:234`). Over `http://localhost:29325` a Secure cookie would not be sent at all; removing the flag allows SameSite-protected cookies to work. The cookie stays `HttpOnly` and `SameSite=Lax`, so the security posture remains: only code running on localhost:29325 can read the cookie, and it's safe against CSRF from other localhost ports. **Epistemic status:** verified the code behavior (what the flag does); did NOT empirically test whether WKWebView sends Secure cookies to localhost without it. "Strictly required" is inference, not proof. Kept deliberately to be safe.

### Assets.car and sidecar binary are gitignored build artifacts
**Rationale:** `web/src-tauri/icons/Assets.car` (~1.4MB) and `web/src-tauri/binaries/gomuks-aarch64-apple-darwin` (55MB) are regenerated on each release and tagged with git history. Earlier attempt to commit both cost 110MB in the push payload. Both are now in `.gitignore` with `.gitkeep` placeholders; release.sh regenerates them. Old commits with embedded binaries can be reclaimed by running `git gc` after deleting the `pre-blob-strip` local tag.

### shell:* permissions deliberately removed — never re-add them
**Note:** `shell:allow-spawn`, `shell:allow-kill`, `shell:allow-stdin-write` were granted to the remote origin but nothing used them (no @tauri-apps/plugin-shell calls in web/src). The sidecar is spawned from Rust, not from IPC. These permissions were removed to reduce remote-origin capability surface. If shell operations are needed in the future, they must come from Rust code, not IPC grants to the webview.

### release.sh has four latent bugs that bite only on release
(1) **TAURI_SIGNING_PRIVATE_KEY env var name is wrong.** Tauri uses `TAURI_SIGNING_PRIVATE_KEY` (contents, not path); the old name `TAURI_SIGNING_PRIVATE_KEY_PATH` is ignored. Signing fails silently after a full build + Apple notarization (the most expensive step). **Fix:** preflight that signs a throwaway file before building, so key+password are proven valid upfront. (2) **Cargo.lock is a fourth version file.** cargo build rewrites it automatically; release.sh bumped 3 files (tauri.conf.json, package.json, Cargo.toml) but not Cargo.lock. A failed release stranded Cargo.lock at the new version while the other 3 stayed old; a successful one tagged a commit with disagreement between manifest and lock file. **Fix:** bumped, verified, restored on abort, committed with the other 3. (3) **DMG notarization:** tauri notarizes and staples the `.app`, then builds the DMG around it — but the DMG itself was never notarized/stapled. `stapler staple` on it failed "Record not found". **Fix:** separate `notarytool submit` round trip for the DMG itself. (4) **gh account drift:** the active `gh` account changed mid-build (ADMIN→READ), so preflight passed as the right user and `gh release create` failed as the wrong one. `gh` reported it misleadingly as "workflow scope may be required". **Fix:** resolve a token for a required account upfront, export `GH_TOKEN`, which pins both `gh release create` and `git push` (credential helper is `gh auth git-credential`).

### Git history blob strip: git filter-branch to remove 110MB binary
**Done 2026-08-27:** Rewrote commits `c1529c6c..HEAD` (4 unpushed commits only) to strip `web/src-tauri/binaries/gomuks-aarch64-apple-darwin` (55MB, committed twice). Verified `git diff` between pre-rewrite and rewritten tip was EMPTY (identical tree). Upstream commits at/below `c1529c6c` untouched, so fork relationship + future `git merge upstream/main` still work. Backup tag `pre-blob-strip` still exists (can be deleted + `git gc` run to reclaim disk). Push payload went 110MB → 7.6MB.

## 2026-09-01 (Mobile strategy decision: iOS-only Element X fork)

### Mobile strategy (2026-09-01)
**Decision:** iOS app is an owned fork of Element X iOS (SwiftUI on matrix-rust-sdk), not a tracked fork and not Tauri-based.
- iOS-only native app; Android explicitly out of scope
- Fork once, stop rebasing on upstream Element X
- Pull matrix-rust-sdk updates via Swift package dependency only
- Keep Element X's hard parts as-is: session management, notification service extension (decrypted push content), verification flows, key backup, rust-sdk wiring
- Write new room list and timeline screens against an echo design-language document (not editing Element's versions; avoids "restyled Element" trap)
- Token-restyle remaining screens (settings, onboarding, verification) at Compound design-token layer only
- Consistency across desktop and iOS is a shared design language (tokens, colors, look and feel), not shared code; mobile UI is bespoke to mobile (window resizing, glow markers need not port literally)
- Desktop app stays: React/Tauri bundled with local Go sidecar backend (unchanged)
- Phone is a separate Matrix device on the same account (two devices, own keys and DBs; read state syncs via Matrix receipts; needs cross-signing and key backup)
- Design-language document becomes the source of truth for both codebases

### Alternatives evaluated and rejected (for future reference)
- **Linux/Windows desktop port:** moderate plumbing (CGO sqlite3 cross-compile, per-triple binary naming, Assets.car macOS-only, latent Windows data-dir bug in lib.rs, macOS-specific window chrome CSS, release.sh single-platform); no decision taken, findings in portability.md for reuse if ever picked up
- **Hosted gomuks backend + thin mobile frontend:** viable (frontend already has non-Tauri mode, WebAuthLogin, origin_patterns CORS config, web push); rejected because user does not want to run a server; if revisited, backend has no rate limiting (verified), tokens are HMAC-SHA256 7-day (token_key = master secret), security notes: would hold all E2EE keys, Tailscale recommended over public
- **gomuks WASM in Tauri iOS:** shares React frontend (wasmuks exists with build-wasm.sh), rejected for mobile because iOS suspension kills background sync, notifications cannot carry decrypted content (WASM backend cannot run in notification extension), on-phone performance unmeasured, native feel capped at web-app; worth remembering as zero-code phone test (build-wasm.sh + static host + mobile Safari)
- **Own SwiftUI app on matrix-rust-sdk from scratch ("option 2"):** cleaner end state but months of plumbing (notification extension especially) before design can be judged; option 3 (owned Element X fork with fresh-written screens) converges to it without a non-working interim
- **FluffyChat (Flutter, matrix-dart-sdk):** legitimate second scaffold; loses to Element X once Android is dropped

## 2026-09-01 (0.4.0–0.4.3 releases: settings redesign, unread red, parted rail, release-notes-in-app, Go SSO/membership fixes)

### Release ritual: RELEASE_NOTES.md statelessness
**Rationale:** `RELEASE_NOTES.md` at the repo root is read by `scripts/release.sh` in preflight, embedded verbatim in `latest.json` as the `notes` field, and rendered in-app. Unlike version files that reset per release, release notes are stateless — the file ships exactly as-is. This caught us twice: (1) release.sh reran with the SAME notes in place, shipping old 0.4.2 notes with 0.4.3, (2) the script clobbered notes by concatenating when appending should be documented elsewhere. **Discipline:** rewrite `RELEASE_NOTES.md` BEFORE every `release.sh` run. Archive old notes to `release-notes/<version>.md` and commit with the version bump (release.sh does this). Consider a preflight guard comparing against `release-notes/<previous>.md` to catch the same-notes trap. **Gotcha:** stale DMG mount at `/Volumes/echo` kills `bundle_dmg.sh` (fails to create volume with same name). Eject first with `hdiutil detach /Volumes/echo`, then rerun release.sh.

### Rail marker language: the glow pill = active view
**Constraint:** exactly one glow pill (`&.active::before` pill indicator, glow-yellow `#f5d76e` with box-shadow glow, left-edge on space/DM tiles) visible at any time. The pill marks the ACTIVE VIEW — the selected space, the selected sub-filter band when parted, or the selected room. When a space tile parted (band height 0fr → 1fr animation, .26s open / .52s close; AMENDED 2026-09-25 to .42s / .84s, see 2026-09-25 section), the tile's pill is handed to the selected sub-filter row inside the band; the space tile itself gives up the pill while the drawer is open. If no pill is visible, either no view is selected (early-boot before defaulting to Home) or the view is inside a closed drawer. This is the single visual truth for "which part of the rail is active right now."

### Animations: CSS media-query gate + JS exit-state skip for reduce-motion users
**Rationale:** CSS `prefers-reduced-motion: reduce` media query matches on this dev machine (enabled by default in macOS accessibility). Many animations were written with `animation: none` under that query, permanently disabling ALL animations when Reduce Motion is on — including ones added later that were never tested with it off. **Discipline:** (1) every animation rule gets two selectors: the motion rule AND an attribute-gated override `html:not([data-ignore-reduce-motion])` that makes the motion rule apply only when the override is absent (the override attribute is set by `StylePreferences.tsx` `useEffect` bound to the preference). (2) JS transition state machines (e.g., closing animations that use `animationend` event listener) must check the reduce-motion state AND the preference flag via `matchMedia` directly, then skip the exit-animation state entirely for reduce-motion users — `animationend` never fires under `animation:none`, so relying on it alone leaves transitions half-applied. **Examples:** band closing animation uses `0fr↔1fr` grid-template-rows with `min-height:0` on inner flex item (auto-minimum otherwise refuses collapse); both CSS rule and JS state machine gate the closing state.

### Behavioral verification standard: Playwright-WebKit harness against live dev
**Established:** Rail/visual/animation work requires verification beyond "code looks right" because CSS specificity bugs and animation-event races are invisible without live inspection. Two bugs were caught in 0.4.3 only through harness testing (closing-band animation excluding its tile, active-row edges silently beaten by hairline specificity). **Setup:** scratchpad/playwright + webkit installed, scripts (railwatch2.mjs, allchats.mjs, activerow.mjs) load localhost:6173 dev app authenticated via minted gomuks_auth cookie (recipe: read username + token_key from config.yaml; payload = compact JSON {"username":u,"expiry":now+3600}; token = b64url(payload)+"."+b64url(HMAC-SHA256(token_key, payload)) no-padding; set cookie at domain localhost path /_gomuks/auth). Sample DOM through rail transitions, verify assertions on tile state, drawer contents, room counts, animation timing. **Note:** harness is session-scoped tmp (dies at session end); the recipe is durable. **When:** use before marking visual work done; "verified by construction" is not enough.

### Unread colour: all tiers deliberately red (2026-08-30) — SUPERSEDED 2026-09-17
**Original decision:** Unread rooms used a single red treatment across all tiers (mention-tier pulses on preference enabled; all others static). Earlier design attempted a gradient (unread = amber, mention = red) but visual testing settled on red-only. **SUPERSEDED:** see 2026-09-17 "Unread tiers: blue vs red" below. The single-red decision relied on a PULSE to distinguish being named from ordinary traffic, but that pulse is gated by `prefers-reduced-motion` (OFF on this machine), making the tiers indistinguishable for Reduce Motion users. **New decision:** blue for message/notified, red+@ for mention; separation lives in hue + badge shape, not motion.

### Manual git push must pin GH_TOKEN to taylorbird
**Rationale:** `gh` CLI defaults to the currently-active authenticated account, which can drift if you're logged in to multiple accounts. Release.sh was hit by this mid-build (logged in as ADMIN, later session became active, `git push` + `gh release create` used READ account, 403 denied). **Discipline:** for any manual push after release work or when the active account is uncertain, first resolve the token explicitly: `GH_TOKEN="$(gh auth token --user taylorbird)" && git push`. Don't rely on "the active account is correct" — it drifts. Release.sh exports `GH_TOKEN` upfront to pin both `git push` and `gh release create`.

## 2026-09-04 (Timeline sender treatment refresh, room-list colour system, Unread section, reaction toggle, 0.5.0 release)

### Timeline colour system: room-aware sender allocation

**Decision:** Sender colour in any room context comes from `getSenderColor(roomID, userID)` only (media.ts → sendercolor.ts), never `getUserColorIndex` or `getUserColor`. The colour is carried as `--sender-color` inline on `div.timeline-event`, so it travels to all children (sender name, reply spine, etc.) without coupling.

**Storage and allocation:** new module `web/src/api/sendercolor.ts` exports `createSenderColorAllocator()` with injectable deps (userID overrides, custom colours); allocation runs on first appearance in a room, picks the palette index farthest in hue from the nearest taken hue (incremental/greedy, not maximin); persisted in localStorage `echo.room_sender_colors` as `{roomID: {userID: index}}`; never reshuffled.

**Palette exhaustion:** when >10 senders appear (common in loaded history), newcomer takes the least-used slot. Palette size is COUPLED to six places: `media.ts` `FALLBACK_COLOR_COUNT`, `index.css` dark/light sender-color token lists, `TimelineEvent.css` `.sender-color-N` rules, `ReplyBody.css` `.sender-color-N` rules, dormant `themes/cool-graphite.css`. Changing the count requires touch-ups in all six places.

**Side effect:** same person can have different colours in different rooms (accepted tradeoff; greedy allocation is simpler than maximin).

**Consequence:** Member list and mention pills still use per-user `getUserColor` (no room available), so they may disagree with timeline colours. Possible future refinement: thread room context through those layers too.

### Room-list name colours under uniform mode

**Decision:** names use a single `--room-list-name-color` token (RoomList.css) applied to every row via `div.room-entry`. Under uniform mode, the colour is ink `#c9c2cc`; the open room's name is pure white (`span.event-sender` under `.active`).

**Specificity gotcha fixed:** a specificity bug had defeated the uniform override since 0.4.1. Resting-row rule at (0,5,4) applied 38% accent mix to names, beating the uniform override at (0,4,4). Fixed by nesting a copy of the `--room-list-name-color` override INSIDE the resting rule at (0,6,5), so the override now wins. Uniform mode is dark-only.

**Alternative:** the comment in RoomList.css lists lavender-grey mix and plain-accent options for one-line swaps if the user prefers a different look.

### Resting room rows unbolded (emphasis on active row only)

**Decision reversed 2026-09-04:** initial design (V4 from mock-up) dimmed resting rows via opacity .62 on text + grayscale on avatar. User feedback: "Remove the dim — every row should have the same weight." Resting rows now have no dimming; all visual emphasis comes from the open room's wash + glow bars + badge.

### Timeline geometry: avatar gap widened for ring + rail + text

**Decision:** `--timeline-avatar-gap` widened from 1rem to 1.5rem to accommodate: double-avatar ring (2px --background-color gap + 2px --sender-color ring, 4px total bleed), 1.5px sender rail at `left: calc(...padding + avatar-size + 11px)`, and text with no squash.

**Rail rendering:** new `div.timeline-event::before` with height 1.5px in `--sender-color`, positioned `top: 2px` (first row) or `top: -var(--timeline-message-gap-same-sender)` (same-sender rows) so it's continuous, `bottom: 0` except `&:not(:has(+ div.timeline-event.same-sender))::before { bottom: 4px }` (last row of a run). Excluded on small/hidden/membership/small-thread/edit-history/pinned/notification/confirm-modal events.

### Mock-up comparison artifacts: reproduction pattern

**Established:** when choosing between visual variants, create a real-UI artifact with one card per variant (current first), showing exact CSS deltas per card so the user can pick. Successful pattern used five times this session:
1. Room list resting rows (V0–V5)
2. Room list type specimens (T0–T7)
3. Combined editorial recipe C1–C5 + bar heights
4. Sender palette sheet
5. Chat pane seven ideas C0–C6 + Chat pane revisions R1–R3

**Implementation:** generators live in session scratchpad as gen*.py scripts; die at session end. They hydrate from actual CSS token values and create side-by-side view where user can compare. User feedback from these artifacts converges faster than prose descriptions.

### Release 0.5.0 shipped 2026-09-04 as a minor bump

**Scope:** reaction chip toggle (own/redact path), room-aware sender colours (palette allocation per room), Unread section (new preference, collapsible drawer above Rooms/DMs), uniform room-list colour fix (specificity nested override), timeline sender treatment (ring + rail + plate), timeline geometry (avatar gap 1.5rem).

**Release process:** GitHub release with embedded notes via feed verified serving version 0.5.0 and updater.json with notes. Both app and DMG notarized and accepted. dev `tauri dev` was stopped before release.sh (no port conflicts, no restart storms).

### release.sh must be launched detached; tauri dev stopped first

**Gotcha:** release.sh runs 25–35 minutes (two Apple notarization waits). Claude Code's Bash tool caps background commands at 10 minutes. A first release attempt was stopped at frontend build; abort trap restored all four version files cleanly, proving early exit is safe. Run it detached:

```bash
nohup scripts/release.sh minor > <scratch>/release-<version>.log 2>&1 &
# then Monitor the log for '^==>' lines
```

**Critical:** stop `tauri dev` first. The script rewrites tauri.conf.json and Cargo.toml for the bump; the dev watcher triggers restarts on both files, causing restart storms and a dead sidecar. Kill by port: `lsof -ti :6173` and `lsof -ti :29325`, plus `pkill -f target/debug/app`.

### Subagent restrictions for mock-up builders

**Gotcha (2026-09-04):** Two subagents' cleanup (stray TaskStop, headless-Chrome cleanup) killed the running tauri dev process. The dev app was launched as a direct child of the harness, so cleanup signals also touched it.

**Fix:** subagent briefs for artifact builds now explicitly forbid: launching browsers, starting background tasks, calling TaskStop. Builders launched with `nohup` remain detached and survive cleanup.

## 2026-09-17 15:53 (Per-room colours removed, Recent as rail sub-filter, room name size)

### Room names: one colour, white (2026-09-17 15:53)
**Decision:** Room names are one colour (white, dark mode only) across all views: room list, room header, quick switcher, and space view. Per-room hash-derived accents are removed entirely (no `getRoomAccentColor()`, no `--room-accent` inline prop, no `uniform_room_list_color` preference). **Rationale:** a row's state is already carried by its wash, glow bar, and badge; a column of thirty per-room tints spent visual signal on the one property the column does NOT need to disambiguate (room names are the column's label; they need to be readable and uniform, not accent-coloured). Light mode (never touched): inherits body text colour (white would be invisible there).

**Implementation:** `--room-list-name-color: #ffffff` in RoomList.css (dark mode only under `prefers-color-scheme: dark`); replaced all `color-mix(in oklab, var(--room-accent, ...) 70%, ...)` rules with `color: #ffffff` in RoomViewHeader.css, QuickSwitcher.css, SpaceView.css (2 occurrences). Removed `getRoomAccentColor()` from web/src/api/media.ts (dead once CSS stopped reading it). Removed inline `style={{ "--room-accent": getRoomAccentColor(...) }}` props and imports from Entry.tsx, QuickSwitcher.tsx, SpaceView.tsx (2 sites), RoomViewHeader.tsx. Removed `uniform_room_list_color` preference from preferences.ts and its `data-uniform-room-list-color` attribute from StylePreferences.tsx (with one name colour, both states rendered identically; preference was dead).

### Room-list kind glyph accent deliberately retained (2026-09-17 15:53)
**Decision:** `room_list_color` preference (a single chosen accent for kind glyphs, default #bd93f9) is deliberately kept. It is now the ONLY place the accent shows at full strength, since room names are white and per-room colours are gone. **Rationale:** one accent on the glyph is acceptable UI; thirty accents would be busier. **User note:** on 2026-09-04 the user flagged the purple glyph as "sticking out" against ink room names; this constraint becomes actionable if the user decides the glyph should be unstated (change to inherit ink).

### Recent: space-rail sub-filter, never a sort (2026-09-17 15:53)
**Decision:** Recent is a sub-filter in the space rail alongside All chats / Rooms / Direct messages (a fourth option). It narrows NOTHING (every room is included); it exists purely to signal an ordering/layout mode to the room list. When Recent is active, the room list short-circuits to a single unsectioned section of all rooms reversed (newest first). NO Unread section in Recent view (deliberately: lifting badged rooms to the top would push the just-left conversation back down, defeating the view's purpose). **Rationale:** the per-section sort built earlier (with localStorage + cycle-on-click) was rejected as undiscoverable; Recent view sidesteps the interaction — it is a distinct view mode, not a sort within the grouped view, so the chip and the sub-filter are now one concept.

**Implementation:** `SpaceSubFilterID` now `"rooms" | "dms" | "recent"`. `SubFilteredSpace.include()` returns true for "recent"; it narrows nothing. `RoomList.tsx` `sections` useMemo short-circuits: when `activeSubFilter === "recent"` it returns a single unsectioned section containing `roomList.toReversed()`, with no Unread section. `activeSubFilter` moved earlier in component (above sections useMemo) — it's now read by the memo, so declaration must precede it (TDZ error otherwise).

### Section headers structure: single button again (2026-09-17 15:53) — SUPERSEDES 2026-09-17 15:15
**Reversal:** `button.room-list-section-header` is a single button again (not a `div` with nested button children). The multi-button div structure existed only to make the sort tag independently clickable; with the sort feature deleted (replaced by Recent sub-filter) and the tag gone, the complexity serves nothing. **Implementation:** CSS reverted to `button.room-list-section-header` with `&:hover, &:focus-visible`; `.section-mode` block deleted; no `:has(:focus-visible)` needed.

**Superseded entry:** "Section headers structure: div with nested button children (2026-09-17 15:15)" — that structure was reverted this checkpoint.

## 2026-09-17 15:15 (Unified title bar, room-list sort, unread colour ramp, Inter-only typography, section header structure)

### Section headers structure: div with nested button children (2026-09-17 15:15) — SUPERSEDED 2026-09-17 15:53
~~**Decision:** `button.room-list-section-header` became `div.room-list-section-header` containing three controls: `button.section-toggle` (icon + name), optional `button.section-mode` (the sort tag), `button.section-chevron-button` (tabIndex={-1}, aria-hidden="true", repeats toggle for pointer only). **Rationale:** a button cannot nest inside a button; the sort tag must be independently operable. **Interaction:** the div owns the band/tone/hover; hover uses `:has(:focus-visible)` since focus now lands on a child button.~~

**Superseded:** Section headers reverted to a single button 2026-09-17 15:53 when the sort tag was removed.

### No separate title bar band (2026-09-17 15:15)
**Decision:** Removed the separate `div.app-titlebar` band that occupied its own space above the main grid. Rationale: the macOS traffic lights sit within the left 66pt of the space rail's own column (`--space-bar-width: 5.5rem`), so ONLY the rail needs to reserve vertical room. **Implementation:** `--traffic-light-strip: 2rem` (the square needed for lights + 1rem left margin) on the space rail only, plus .5rem deliberate breathing room between lights and first space tile. Every other pane (room list, room view, right panel) runs to the window's top edge. This reclaims ~108px compared to the separate-band approach. **Critical consequence:** removing the band reopens the seam the band originally closed (between the space rail and room list) ONLY if pane top margins stop being 0. Constraint: keep all pane `margin-top: 0`. The app wordmark "echo" now appears only in the menu bar and Dock, not in-window.

### Section headers structure: div with nested button children (2026-09-17)
**Decision:** `button.room-list-section-header` became `div.room-list-section-header` containing three controls: `button.section-toggle` (icon + name), optional `button.section-mode` (the sort tag), `button.section-chevron-button` (tabIndex={-1}, aria-hidden="true", repeats toggle for pointer only). **Rationale:** a button cannot nest inside a button; the sort tag must be independently operable. **Interaction:** the div owns the band/tone/hover; hover uses `:has(:focus-visible)` since focus now lands on a child button.

### Unread tiers: blue vs red (2026-09-17)
**Decision:** Reverses the 2026-08-30 "one red for every tier" decision. New ramp: message = blue (hue only), notified/marked-unread = blue with count badge, mention = red + @ badge. **Rationale:** the August red-only decision relied on a PULSE (media query `prefers-reduced-motion`) to distinguish being named, but `prefers-reduced-motion: reduce` is ON on this machine (macOS Accessibility default), making the tiers literally indistinguishable for Reduce Motion users. **New separation:** hue (blue vs red) + badge shape (dot vs count badge vs @ badge) — both survive reduced motion and colour blindness. **Implementation:** tokens `--unread-counter-message-bg` blue, `--unread-counter-notification-bg` blue, `--unread-counter-highlight-bg` red; `--unread-glow-*` blue for message/notified, red for highlight; `--room-list-entry-unread-wash` blue. Badge tier for plain message collapses to .4375rem dot (font-size 0 hides digits in DOM but keeps accessibility tree intact).

### Typography: Inter everywhere (2026-09-17)
**Decision:** Space Grotesk entirely removed. One typeface: Inter 400-700 via Google Fonts, applied to all text including names/titles/usernames. **Token preservation:** `--display-font-stack` remains defined (`'Inter', -apple-system, BlinkMacSystemFont, sans-serif`) so the names/titles/usernames role survives as a named concept (for future reuse), but there is no second face. **Removal scope:** `--display-font-stack` deleted from direct CSS rules; Space Grotesk removed from index.html Google Fonts request (Inter only); RoomList.css room-name `text-transform: uppercase` removed, `letter-spacing` .08em → 0, `font-size` 1.0625rem → 1rem. **Rationale:** caps gave every name one volume so nothing could be louder when needed; mixed case + uniform weight allows emphasis via colour or context.

### Room-list names: mixed case, never uppercase (2026-09-17)
**Decision:** All room-list entry names render in mixed case (as stored in the room state). The earlier `text-transform: uppercase` style gave every name one volume, preventing emphasis when needed. **Implementation:** removed `text-transform: uppercase` from `.room-name` in RoomList.css; all other styling preserved. **Consequence:** names now vary in visual weight naturally per their own capitalization, and room colour + unread state become the primary emphasis tools.

### Space rail always-in-a-space pattern (2026-09-17)
**Decision:** Being logged in means the user is always in a space. The All chats tile is visually lit when `space === null`, and the room-list band should also be expanded (showing All chats' rooms). **Fix:** changed `const openIndex = space ? partables.indexOf(space.id) : -1` to `const openIndex = partables.indexOf(space?.id ?? allChatsSpace.id)`. **Consequence:** the lit tile (`isActive` prop) and the expanded sub-view band now agree. Nested spaces with no rail tile still return -1 (the documented "nothing to part around" case), preserved.

## 2026-09-13 (Timeline quieting: sender treatment refresh, reply-quote spine, tooling constraints, mock-up CSS bug)

### Timeline sender treatment: colour name only, no rail/ring/plate (2026-09-13)

**Decision:** After one week using 0.5.0 in production, user verdict: the timeline sender treatment (ring + rail + plate + room-aware palette) is "too busy". Three comparison artifacts (Sender Treatment Tryouts, Ink Name Iterations, Colour Name Iterations) iterated the design space. User selected option G1: sender names 1.0625rem (room-list name size), full opacity (not dimmed), 600 weight, room-aware colour, **without the ring**.

**Implementation (commit d8fc2245):** Removed all ring/rail/plate styling from TimelineEvent.tsx and TimelineEvent.css (deleted `::before` rail rules, second suppression block for membership events, both avatar ring `box-shadow` rules). Removed name plate (deleted inner `span.event-sender-text` and plate background rule). Sender name size .875rem → 1.0625rem; padding removed. Avatar gutter `--timeline-avatar-gap` returned to 1rem (was 1.5rem to fit ring+rail). Index.css glow bar reset from 2rem to match.

**SUPERSEDED 2026-09-13:** The 2026-09-04 constraints on timeline geometry (1.5rem avatar gap, ring, rail, plate) are now SUPERSEDED. The new constraint is: timeline sender names are colour-only (1.0625rem/600, full opacity), no rings, no rails, no plates; `--timeline-avatar-gap` is 1rem.

### Reply-quote spine: static neutral colour, never per-sender (2026-09-13)

**Decision:** Continuing from timeline quieting (above), the reply-quote spine was originally keyed to the quoted sender's colour (same palette as timeline senders). With the ring/rail/plate removal, the spine became the visual anchor for quoted messages. User feedback indicated the multiple-spine effect (rail + quote spine when a quoted message is sent) read as "busy"; unified the spine to a static neutral.

**Implementation (commit d8fc2245):** ReplyBody.css default `--reply-border-color: color-mix(in oklab, var(--secondary-text-color) 55%, transparent)` (static neutral derived from secondary-text-color). Deleted eleven `.sender-color-N` blockquote rules. ReplyBody.tsx: removed inline `--reply-border-color`/`spineColor` calculation, removed `sender-color-null` class assignment, dropped `getRoomAccentColor` import. Quote name and small avatar still use the quoted sender's colour.

**Knock-on effect:** Collapsed thread messages (`.timeline-thread-msg`) lost their thread-accent spine as a side-effect of sharing the border property. Not yet asked for restoration; marked as an open question if spine should return.

### In web/ never run pnpm until migration decided (2026-09-13)

**Incident:** The implementer agent (per user's global pnpm rule) ran `pnpm exec tsc` in web/. This repo is an npm project (package-lock.json). pnpm performed a full install, rewrote web/node_modules under the running Vite dev server, generated web/pnpm-lock.yaml and a placeholder web/pnpm-workspace.yaml that breaks all later pnpm commands with `ERR_PNPM_IGNORED_BUILDS`. Plugin versions resolved newer (eslint-plugin-react-hooks 7.1.1), introducing 2 eslint errors in untouched files.

**Fix:** Deleted both generated files; ran `npm ci` in web/ with dev stopped. Tooling constraint: In web/, use `npm run …` or `./node_modules/.bin/…` until migration is decided. Restore with `npm ci` (dev stopped) if accident happens again. Documented in learnings/dev-environment-gotchas.md ("pnpm exec in web/ triggers a full install").

### Mock-up custom-property declaration rule (2026-09-13)

**Bug found:** In CSS mock-ups, knobs declared as `--x: var(--sender-color)` on a parent element where `--sender-color` is not set resolve to invalid at declaration time; children inherit the invalid value. Names went grey, rings vanished.

**Fix:** Declare such knobs on the element that sets the inline variable (e.g., `.pane .ev`), with overrides via a more specific descendant selector (e.g., `.pane.v-x .ev`). The knob is now declared where the variable exists and override rules win via specificity.

**Related:** When building artifact mockups with headless Chrome, file:// URLs have no charset, causing UTF-8 punctuation (em-dashes, etc.) to mojibake. Use `&#8212;` HTML entities in artifact HTML instead of literal UTF-8 characters.

### Vite dev server binds IPv6 only

**Gotcha:** Vite's configured port (6173) binds to [::1] (IPv6 loopback) by default, not 127.0.0.1. An IPv4-only readiness probe (e.g., connecting to 127.0.0.1:6173) reports the server down even though it's running.

**Fix:** readiness probes must try ::1, or allow both IPv4 and IPv6. Affected: any harness/tooling that waits for Vite to start before launching the Tauri app.

### Prod backend logs include debug lines; grep for sends

**Fact:** ~/Library/Logs/dev.tbird.echo/gomuks.log carries debug output even in production builds. Search key: `"send/m.room.encrypted"` finds IPC message sends (47 sends found morning of 2026-09-02 during a network outage, zero reaction sends, confirming reactions never reached the backend).

**Also:** media 502 signature is `"Failed to copy media to temporary file"` (indicates homeserver media service down, not app fault).

### nohup-detached tauri dev survives harness cleanup

**Pattern:** `nohup npx tauri dev … &` detaches the dev process from the harness task list, so TaskStop or cleanup events don't kill it. The process is no longer trackable as a background task, so it must be manually killed by port or process name if cleanup is needed: `lsof -ti :6173` or `pkill -f target/debug/app`.

## 2026-09-20 (Batch 1 fixes, unread retune, loading redesign)

### Backend session token is 24h mint-once
**Verified:** `mint_backend_token` in `web/src-tauri/src/lib.rs:193-200` mints once at launch with `expiry = now + 24h`; the auth cookie has `max-age=86400`. The app had been up 25 hours during this session and fell back to a credentials form. The backend password is random and discarded at first run (`lib.rs:118`); the username is `echo` not `admin` (`lib.rs:97`) — so the credentials form is structurally unanswerable. A comment at `lib.rs:219` predicts exactly this scenario. **Impact:** any app left running longer than a day lands on an unanswered credentials form. **Remedy today:** relaunch. **Future:** re-minting on auth failure is a decision deferred pending user input.

### `--inverted-text-color` must be restated where `--background-color` re-scoped
**Pattern:** `--inverted-text-color` is defined at `:root` as `var(--background-color)`. Any surface that re-scopes `--background-color` (e.g., `div.pre-main.signed-out { --background-color: ... }`) must also restate `--inverted-text-color`, or buttons/text that rely on it will reference the old root value. This bit the signed-out surface and is the same class of bug as the white-on-cream button (2026-08-25). Solution: declare both together whenever a surface re-scopes background.

### Never use `npm run tauri dev` — no such script
**Gotcha:** This repository has no `tauri` script in `web/package.json` (scripts are dev/build/lint/preview/test). The correct invocation is `npm exec tauri dev` or `./node_modules/.bin/tauri dev`. Using the wrong one costs downtime during development while the error is diagnosed. Documented as a quick-reference constraint to prevent the mistake being made twice.

### New signal colours go through an alias, not a direct reference
**Pattern:** `--progress-color` now aliases `--unread-counter-message-bg` (the new blue) so the progress rule and sign-in focus ring can be severed from the badge palette in one edit. Any future retune of unread blues will update both progress/focus automatically. Direct references to unread badge tokens in visual effects should be avoided; alias instead.

### Unread blue is the candy family: neon pastels with inverted text
**Decision:** New unread message tier uses `--unread-counter-message-bg: #5cbbff` (message) and `--unread-counter-notification-bg: #85d6ff` (notified), matching the family `#ff4d6d` (red), `#a0e7c8` (mint), `#ff9eb5` (pink). Because counter digits are drawn near-white for every tier, near-white ink is unreadable on `#85d6ff`. Added `--unread-counter-blue-text: #10233a` and applied it to `.notified, .marked-unread` in RoomList.css. Red keeps near-white ink. Side benefit: dark-ink-on-blue vs light-ink-on-red is a second non-hue distinction for accessibility.

### Base-tier unread dot carries no glow — fill brightness only
**Decision:** `box-shadow: none` on the base-tier unread dot removes the halo. Brightness comes from the fill colour alone. Bars and counted badges keep their halos. Rationale: glow was visual noise on the smallest element; removal reduces visual clutter.

### Pre-app screens share one surface with no app shell
**Architecture:** All pre-authentication screens (`div.pre-main.signed-out`) render on one surface: no sidebar, no room header, no right panel — nothing that requires a room to exist. Includes: backend-auth WebAuthLogin rewrite, LoginScreen, VerificationScreen, sidecar connect wait (SyncBox). They share `.signin-column` styles from `web/src/ui/login/SignedOut.css`. Rationale: before sign-in there are no rooms, and a skeleton of data that does not exist reads as broken.

## 2026-09-21 (DisconnectedScreen, loading sweep, two releases shipped 0.6.0 and 0.6.1)

### Skeleton animation: one vocabulary app-wide
**Decision:** A single `@keyframes sk-sweep` animation (background-position left→right, 200%-wide gradient highlighting effect) is the single source of truth for all loading placeholders across the app. New placeholder shapes use `.sk` base class (+ weight modifiers `.sk-name`, `.sk-avatar`, `.sk-circle`, etc.) and automatically inherit the animation via CSS.

**Implementation:** web/src/ui/loading/Loading.css defines `sk-sweep` once with media-query reduce-motion gate. RoomListSkeleton and DisconnectedScreen pass their skeleton's `className="sk"` to enable the animation.

**Old pseudo-element skeletons** (e.g., `::before` shimmer rules) are named in Loading.css's selector list and repointed to `sk-sweep` via CSS, killing the need to touch their source files. 

**Critical discipline:** never re-add per-file shimmer animations. All new skeleton work plugs into the `.sk` system.

### Two loading states: skeleton or HairlineWait
**Decision:** Only two idioms across the entire app: (1) skeleton (the shape is known: profile avatar, name line, title block, etc.) with `sk-sweep` animation; (2) HairlineWait (the shape is unknown: awaiting data before layout is possible) showing text over a 2px `--hairline-color` rule, no animation.

**Removed:** react-spinners library entirely (package.json + lockfile). No ScaleLoaders, PulseLoaders, BarLoaders remain. All ten use sites converted to skeleton or HairlineWait.

**Implementation:** HairlineWait is a new component `web/src/ui/loading/HairlineWait.tsx` used in EventContextModal ("Getting the messages around this one"), EventEditHistory, SettingsView Monaco, LazyWidget, etc. Labels precede the hairline; margins set in Loading.css by `.sk-hairline` selector.

### DisconnectedScreen: full-window opaque skeleton, not blur
**Architecture:** New component `web/src/ui/DisconnectedScreen.tsx` renders an opaque skeleton of the entire app layout (rail, room list, timeline, composer under `filter: blur(3px)`) with an `rgba(0,0,0,.55)` tint. A centered box over the blurred background carries the message. This differs fundamentally from the old approach (red-bordered box floating over a live conversation).

**Box styling:** `.5rem` radius + AppKit shadow stack (identical to QuickSwitcher.css:11) — the same treatment used for transient modals, so it reads as intentional and consistent.

**Message contents:** "Lost the local server" + explanation + "Next attempt at …" + "Restart echo" button (calls `restartApp()` helper). The raw WebSocket close code moves to a `title` attribute on the box for diagnostics.

**Lockup placement:** echo penguin logomark (4rem) + wordmark beside it, positioned in the lower track of a `1fr auto 1fr` grid so it sits exactly halfway between the box and the window's bottom edge — an Easter egg and a visual anchor that the connection is being re-established.

**Rationale:** app behind is REPLACED not blurred (a frozen, unresponsive conversation would read as broken). Filter blur on the skeleton layer (not backdrop-filter on the overlay) keeps the blur off the box's compositing layer, improving perceived responsiveness.

### echo penguin logomark locked (not gomuks gopher)
**Fact:** The low-poly purple/blue penguin in `web/src-tauri/icons/echo.icon/` and `web/src/icons/echo-penguin.png` (256px downscale) is echo's own logo, created for this fork. It is NOT gomuks branding — upstream's mascot is the Go gopher with [m], visible in `web/public/gomuks*.png` (upstream leftovers).

**Known issue:** `web/index.html:5` still points the web favicon at `gomuks.png` (the gopher). Dock icon and browser favicon disagree. Not fixed this session but marked for next.

### release.sh gh token pinning (2026-09-21 refinement)
**Decision:** release.sh pinned `GH_TOKEN` to `taylorbird` upfront (2026-08-27), but the mechanism is worth repeating: if an alternative gh account becomes active mid-build, `git push` and `gh release create` silently switch accounts and fail 403. Running `GH_TOKEN="$(gh auth token --user taylorbird) scripts/release.sh"` or exporting the token in release.sh itself prevents the drift. Verified working 0.6.0 and 0.6.1.

### Reduce Motion gates: media query + data attribute pair
**Discipline:** Every animation rule lives under `@media (prefers-reduced-motion: reduce)` with an override `html:not([data-ignore-reduce-motion])` that makes the animation apply ONLY when the override is absent. Machine has Reduce Motion ON by default, so animations NEVER run unless StylePreferences explicitly sets the override attribute based on the `Ignore reduce motion` user preference.

**Pattern:** `@media (prefers-reduced-motion: reduce) { html:not([data-ignore-reduce-motion]) .animated-element { animation: none; transition: none; } }`

**JS side:** animation-end event listeners must also check the preference state and skip exit-animation states for reduce-motion users (animationend never fires under animation:none, so relying on it alone leaves animations half-applied).

### --room-list-width scope constraint
**Fact:** `--room-list-width` is declared on `main.matrix-main` (400px default, inline override per session). It is NOT declared at :root. Fixed layers outside the main element (e.g., modals, alerts, windows) cannot resolve it. For such layers, use `--space-bar-width` (declared at :root) or declare their own token.

## 2026-09-18 (UI release paused; external tester feedback; push-review findings)

### RELEASE_NOTES.md must be rewritten before release.sh run
**Discipline:** `RELEASE_NOTES.md` at the repo root ships verbatim into `latest.json` (updater feed), GitHub release body, and `release-notes/<version>.md` archive. It is STATELESS — not per-release; it is the file itself that ships to users. The current file holds unshipped notes for the release cut from f9795a08 (commit message: "chrome: unified title bar, Inter throughout, blue/red unread ramp, Recent sub-filter"). Before running `release.sh`, verify the file is correct for the release being cut; if stale notes remain, rewrite it. If the notes are correct but you rerun release.sh without rebuilding the app, THE SAME NOTES SHIP TWICE (happened on 0.4.2/0.4.3 boundary). **Guard:** compare RELEASE_NOTES.md against `release-notes/<previous-version>.md` before release.sh to catch rewrites that were forgotten.

### Prefer `[...arr].reverse()` over `Array.prototype.toReversed()`
**Rationale:** `RoomList.tsx` (2026-09-17 commit) added `roomList.toReversed()` for the Recent view. `Array.prototype.toReversed()` requires WebKit from macOS 13.3+; `tauri.conf.json` declares NO `minimumSystemVersion`, so a user on macOS 13.2 gets a silent TypeError that breaks the room list when Recent is active. **Standard:** use `[...roomList].reverse()` (equivalent, no floor) in this codebase; tsc with `lib: ESNext` cannot catch the gap, so lint discipline is required.

### Space membership comes from m.space.child edges; DMs structurally never children
**Fact:** `SpaceEdgeStore.include()` checks `this.#flattenedRooms.has(room.room_id)` where `#flattenedRooms` is built from `m.space.child` edges (the space membership source). DMs are essentially never added as `m.space.child` events (users don't join DMs to spaces). **Consequence:** any per-space filter over DMs is permanently empty (except `DirectChatSpace`, which ignores parent membership and uses `Boolean(room.dm_user_id)` only). Inside a real space, "Direct messages" and "Rooms" sub-filters may be dead weight — they are populated only in Home and the orphans pseudo-space. This was identified during the 2026-09-17 tester session as a structural design problem (options A–D recorded in questions.md).

## 2026-09-23 (release notes voice and format)

### Release notes: plain voice, one line per bullet
**Rule (user, 2026-09-23):** release notes must not read as AI-written. The user found the 0.4.0–0.6.1 notes over-explained and full of AI tells, and all eight were rewritten. The style rules live in the header comment of `RELEASE_NOTES.md`, and `release-notes/0.6.1.md` is the model to follow: plain area headings, short "what changed" bullets, no rationale or internals, no em dashes, no punchy closers, no "X, not Y" framing.
**Format:** one source line per bullet, never hard-wrapped. GitHub release bodies show wraps as line breaks. App versions up to 0.6.1 split a wrapped bullet into a one-line bullet plus a stray paragraph (parser fixed 2026-09-23, but old installs render the feed with the old parser).
**Between releases** `RELEASE_NOTES.md` holds only the header comment, so `release.sh` refuses to run until the notes are written.
**Past notes can be fixed without a release:** `gh release edit vX --notes-file` for the GitHub body (keep the "---\n\nDownload the DMG below…" footer), and for the Latest release only, download `latest.json`, replace `.notes` with jq, check that nothing else differs, and `gh release upload --clobber`. The updater signature covers the tarball, not latest.json.

## 2026-09-24 (upstream sync, 0.7.0)

### Go backend build tags: goolm and sqlite_fts5 both mandatory
**Fact:** As of gomuks v26.09, the backend build requires TWO tags: `go build -tags goolm,sqlite_fts5 ./cmd/gomuks`. The `goolm` tag (pure-Go olm implementation, available since mautrix v0.26.3) is already in place. The `sqlite_fts5` tag is NEW upstream (local message search in pkg/hicli/search.go); without it, `pkg/hicli/nofts.go` deliberately fails the build. Both are mandatory. go.mod specifies go 1.26 as the minimum (toolchain is go1.27.1).

### Node >= 22.12 required for Vite 8 + rolldown
**Fact:** Vite 8 uses rolldown (bundler rewrite), which ships a native binary rolldown-binding.darwin-arm64.node. Node 22.2.0 (the default fnm version on this machine) is too old; npm silently skips the native binary and fails to load any module. Builds complete but the app crashes at runtime with missing dependencies. Node 22.23.1 works. **Discipline:** prefix npm installs, `tauri dev`, and release.sh with `fnm exec --using=22.23.1` to guarantee the right Node version. The dev session snapshot (2026-09-23) ran as `nohup fnm exec --using=22.23.1 /Users/tbird/gomuks/scripts/release.sh minor > ~/Library/Logs/echo-release/release-0.7.0.log 2>&1 &` and `fnm exec --using=22.23.1 sh -c 'cd /Users/tbird/gomuks/web && exec ./node_modules/.bin/tauri dev'`.

### gh token lacks workflow scope; resolve workflows before pushing upstream syncs
**Fact:** The taylorbird gh token (personal account) lacks the `workflow` scope, which is required to push changes to `.github/workflows/*` files. This only comes up during upstream syncs, where merge commits may touch `.github/workflows/go.yml` or `.github/workflows/js.yml`. On an upstream sync, these files are pull-request-only (echo runs workflows locally, not in GitHub Actions), so resolution rule: KEEP echo's copies of those files (commit 86694d3b restored them after a rejected push). **Discipline:** before pushing any branch that touches `.github/workflows/*`, resolve them to echo's side (resolve conflicts to ours). If this approach ever changes, the full alternative is granting the token the `workflow` scope, but that broadens its permissions across all repos.

### @tauri-apps package versions must stay locked per Cargo.lock
**Fact:** The web/package-lock.json entries for `@tauri-apps/plugin-updater` (2.10.1), `@tauri-apps/plugin-opener` (2.5.4), and `@tauri-apps/cli` (2.11.4) must match the Cargo.lock versions exactly, or there are version mismatches at runtime. Additionally, `react-colorful` (5.6.1) is locked. These are verified in the web/src-tauri/Cargo.lock and must not drift. **During upstream syncs:** if Cargo.lock is regenerated as part of a merge conflict resolution, re-lock the npm packages to match before committing.

### OAuth device code via Matrix Authentication Service (legacy SSO removed)
**Fact:** Upstream gomuks removed the legacy SSO login endpoint (`pkg/gomuks/sso.go` deleted). In its place, all sign-in now uses OAuth device code flow via the homeserver's Matrix Authentication Service (MAS). The device code screen appears in `web/src/ui/login/LoginScreen.tsx` with only "Continue in your browser" visible (no username entry). Client registration uses a static `client_name: "echo"` set at the request time (not fetched from config). The consent page should display "echo" (if the MAS is configured with the right metadata), but on mssj.me it shows the raw redirect URL because that homeserver's well-known advertises legacy MAS without OIDC client registration metadata. This is upstream's limitation, not echo's.

### Inter 4.1 variable fonts bundled; Google Fonts removed
**Supersedes prior "Inter from Google Fonts" note.** web/src/fonts/ now holds Inter 4.1 variable fonts (InterVariable.woff2 and InterVariable-Italic.woff2), replacing upstream's static 400/500/700 set. The variable fonts support weight 600 (used by echo for sender names), which the static set lacked. Google Fonts link removed from index.html.

### DB schema v27 incompatible with pre-0.7.0 builds
**Fact:** The 0.7.0 release contains schema changes (upstream's DB evolution). Installs running 0.6.2 or earlier will auto-upgrade their database on first run of 0.7.0. Once upgraded, that database cannot be read by 0.6.2 or earlier — a downgrade will fail with schema mismatch. This is normal for Matrix clients and upstream's decision. Echo users should not downgrade after running 0.7.0.

### Release logs and dev logs in separate directories
**Fact:** Release builds log to `~/Library/Logs/echo-release/` (one file per release, named by version). Dev builds log to `~/Library/Logs/echo-dev/`. The distinction keeps release build diagnostics (for production testing) separate from the current dev session's logs.

### PreToolUse hook requires push review before git push
**Mechanism:** A PreToolUse hook in this environment (configured in ~/.claude/settings.json) requires that every `git push` be preceded by a push review (the `push-review` command or the equivalent tool). This is a permission control: unpushed commits cannot reach origin without review. **Exception:** release.sh pushes internally (as part of its release ritual) where the hook cannot intercept. The pattern is: do the push review manually before launching release.sh, or let release.sh's internal push succeed if the review is already done. Never try to work around the hook with a different approach (force push, shell redirection, subagent push); surface what's blocked and let the user decide.

## 2026-09-25 (0.7.1 release: space rail improvements, custom emoji markdown fix, attachments redesign, multi-file upload, profile editor)

### Custom emoji markdown title: parenthesised, never quoted
**Root cause:** macOS smart quotes curve the closing quote in composer text via execCommand("insertText") text substitution. Emoji markdown was `![:x:](mxc://… "Emoji: :x:")` which became `![:x:](mxc://… "Emoji: :x:")` (curled closing quote), so backend markdown parser failed to match the pattern and sent raw text instead. Already-sent broken messages stay broken. **Fix:** title now uses parentheses `![:x:](mxc://… (Emoji: :x:))` with internal parentheses and backslashes escaped (`\(`, `\)`, `\\`). Backend `pkg/hicli/mdext.CustomEmoji` verified rendering identically. **Applies to:** ANY markdown-format inserts via execCommand (not just emoji); always use parentheses for wrapping content and escape internal special characters.

### Space DM inclusion: Element's member-based rule (AMENDED from 2026-09-18)
**Original (2026-09-18):** DMs are never `m.space.child` edges, so space "Direct messages" filters are structurally empty. **Reality (0.7.1 implementation):** Spaces now include DMs based on membership, matching Element's rule: a DM belongs to a space if its `dm_user_id` is a member of the space (joined or invited) OR any descendant subspace (same check recursively). **Implementation:** `SpaceEdgeStore` gained `#members` (joined/invited user IDs), `#flattenedMembers` (transitive closure), `setMembers()`, and `includeByEdges()` method. Space unread badges are recomputed from scratch on member change (avoid running-total deltas that drift). "Outside spaces" orphans space uses `includeByEdges` so DMs stay visible there too. Member lists loaded at init_complete for spaces with `has_member_list`, otherwise `client.loadSpaceMembers` on space selection (recursive into subspaces). Tests added: web/src/api/statestore/space.test.ts.

### Download opening restricted to allowlist; others revealed in Finder
**Rule:** `lib.rs` attachment_download_handler uses `tauri_plugin_opener::open_path` to auto-open ONLY: pdf, txt, md, rtf, csv, and office document types (docx, xlsx, pptx, odt, ods, odp). Everything else (images, scripts, pkg, app, html, unknown MIME types) is revealed in Finder via `reveal_item_in_dir`. User can open those manually from the Finder. **Reason:** early version auto-opened any filetype, which is a security risk (scripts, executables, HTML with JS). Downloads carry `com.apple.quarantine` xattr (macOS Gatekeeper marker, verified via xattr -l).

### Pop-up visual pattern: two-column layout with ringed/filled buttons
**Pattern (new 0.7.1):** Download prompt, upload dialog, and profile editor all share one visual treatment. Left column: visual element (FileTypeIcon with tinted corner fold, preview, form input, etc.); right column: details (dl with dt/dd pairs). Buttons: ringed ghost "Cancel" (unambiguous secondary action) + filled primary "Download/Upload/Save" button pair (matches sign-in screen buttons). **Rationale:** one consistent interaction language across all transient dialogs; users learn it once.

### Lightbox renders above all modals; shown content drawn inside it
**Constraint:** `LightboxWrapper` has higher z-index and renders AFTER every `ModalWrapper` in the tree. Any pop-up shown FROM the lightbox (e.g., download prompt) must be rendered as a child INSIDE the lightbox div (div.lightbox-prompt), not as a separate modal. This prevents z-stacking and clipping issues caused by the modal's own stacking context. Implementation pattern: `<div.lightbox-prompt><DownloadPrompt /></div>`.

### Multi-file send: one event per file, text on last, first send clears composer
**Pattern (0.7.1):** When sending multiple files (multi-select, drop, paste), each is uploaded as a separate `m.room.message` event sequentially. Text content and reply mentions ride on the LAST file's event. Only the FIRST send clears the composer. Side effect: while the file chain is uploading, the user can continue typing new text, which will be sent with the final file (or the next separate send if they clear/resend). Upload chain is guarded with try/catch so one failure doesn't stall the rest. **State:** ComposerState.extraMedia holds pending files; upload chain via ref ensures sequential finish.

### Space rail visual changes: divider above spaces, animation timing slowed
**Factual update to 2026-09-24 rail release:** Space rail now shows a thin divider (1px, space-bar-divider class) above EVERY space when multiple spaces exist (never on single-space installs). Space avatars remain 40px (a 34px shrink was tested and reverted by user feedback). Rail drawer animation timings were slowed: open .26s → .42s, close .52s → .84s (close is 2× open per house curve for perceived speed). JS fallback timeout for close was 750ms → 1100ms (accommodates the slower animation). Rules in RoomList.tsx and RoomList.css.

## 2026-10-07 (0.7.2–0.7.3: YouTube embed, rail DMs, widget prompt, Linux builder)

### Rail DM tiles: no glow pill, double-click guard, inert while a drawer closes
**Constraint:** Rail DM tiles never take the glow pill. DM tiles ignore clicks with `evt.detail > 1`, and are `pointer-events: none` while any drawer is closing (`div.space-bar:has(> div.space-bar-under-layer.closing)`). Unread DMs (up to 3, one-to-one via dm_user_id, not invites) render as round avatar tiles at the top of the open space's drawer, newest first, between the space tile's sub-divider and the sub-filters. Preference `rail_unread_dms` (Appearance, default on).
**Rationale:** Verified from the backend log: switching spaces slid the closing drawer up, so the second click of a double-click landed on a DM tile, opened that DM and sent a read marker. The guard stops accidental mark-read. Placement was chosen by the user after iteration (top of rail rejected, bottom of drawer, then top of drawer as final).

### DM unread is a red dot by default (`dm_mention_colors`)
**Constraint:** DM unread renders as the red dot: `UnreadCount` with `asMention` gets class `dm-mention` (no @, no count, no pulse; row bar red, normal unread wash). The full red @ badge is reserved for real mentions (`unread_highlights`). Preference `dm_mention_colors` (Appearance, default on). Rail DM tiles otherwise use the room-list badge tiers (blue / light blue / red), not the space palette.
**Rationale:** The user rejected the full red @ badge for DMs as too loud. Mentions keep their full signal, so the @ badge still means "someone named you".

### YouTube embed: lazy fetch, one player, sandboxed iframe
**Constraint:** The YouTube embed (web/src/ui/urlpreview/YouTubeEmbed.tsx) makes no request (no oEmbed, no thumbnail) until the card is within 200px of the screen (IntersectionObserver). Only one player plays at a time (module-level `stopActivePlayer`). The click-to-play iframe is from youtube-nocookie.com with `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"`. If oEmbed fails, the card falls back to the normal URL preview. Shorts use a 9:16 frame (`isShort`). Preference `embed_youtube_links` (Media, default on). Encrypted rooms embed only when `auto_load_encrypted_url_previews` is on.
**Rationale:** Lazy fetching means YouTube is not contacted for links the user never scrolls to (inferred; the reason was not recorded in session). One player prevents overlapping audio. The embed is modelled on Sable's ClientPreview.tsx.

### Widget permission prompt: no autofocus on Allow
**Constraint:** The widget permission prompt (web/src/ui/widget/PermissionPrompt.tsx) never autofocuses the Allow button. It uses the two-column pattern (widget identity left, Toggle permissions right, raw capability in small code) with ringed "Deny all" and filled "Allow" / "Allow selected". The list scrolls. Styling selector is `form.confirm-message-modal.permission-prompt`, which wins over ConfirmModal.css regardless of import order (eslint import/order fixes that order).
**Rationale:** Pressing Enter on the prompt must not grant every requested permission.

### Linux builds: scoped config, OrbStack builder, secrets on stdin
**Constraint:** Linux-only config lives in web/src-tauri/tauri.linux.conf.json (merged automatically by the Tauri CLI; arrays are replaced, not merged) and in CSS under `html[data-tauri][data-platform="linux"]`; index.html sets `data-platform` from the user agent. macOS chrome CSS is untouched. Linux builds run through scripts/linux-build.sh in the OrbStack machine `echo-builder` (Debian bookworm arm64); `ARCH=amd64` uses `echo-builder-amd64` (untested). The signing key is passed on stdin, never as orb argv. Updater artifacts are produced only when TAURI_SIGNING_PRIVATE_KEY is set.
**Rationale:** Scoping keeps the macOS shell unaffected by Linux work. Command-line arguments appear in process listings, so the key goes over stdin.

### Disk cleanup under ~/Library/Caches: restart the app, clear the Go cache
**Constraint:** After any disk cleanup that touches ~/Library/Caches or ~/Library/Logs, restart the app: the gomuks backend creates its cache dir only at startup (pkg/gomuks/gomuks.go:177, MkdirAll), so images and avatars stay broken until restart. Before any release, run `go clean -cache`: the same cleanup corrupted ~/Library/Caches/go-build, and release.sh then failed with "github.com/dlclark/regexp2/v2: no non-test Go files" even though `go mod verify` passed.
**Rationale:** Observed 2026-10-05 and 2026-10-06 (the cleanup deleted dev.tbird.echo-dev and echo-dev/echo-release log dirs as well as caches).
