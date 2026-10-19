# Dev Environment Gotchas

## Key Facts
- Vite does NOT reserve its configured/default port — if it's taken, it silently walks forward to the next free one. Combined with a hardcoded Tauri `devUrl`, this once caused the Tauri app window to load a completely different local project's dev server without any error. Always pin the port with `server.strictPort: true` in `vite.config.ts` and keep `devUrl` in `tauri.conf.json` in sync with it — `strictPort` turns a silent wrong-app load into a loud startup failure.

## Gotchas
- Visual verification of the running app is unavailable in this environment:
  - `screencapture` fails with "could not create image from display" — the terminal (ghostty) lacks macOS Screen Recording permission.
  - The chrome-devtools MCP cannot attach without Chrome already running with a debug port; a fresh profile only reaches a login screen.
  - `osascript` System Events reports 0 windows for the Tauri window — not evidence the app failed to render. **Corrected 2026-09-17:** this is NOT a quirk of transparent windows. `yaak-app-client`, an unrelated Tauri app, returns the identical signature (0 windows, `AXMenuBar` only), so it is Tauri/WRY-wide and unrelated to `transparent: true` or `macOSPrivateApi: true`. Ghostty returns 1 window from the same permitted terminal, so the method itself is sound. (Finder also returns 0, but only when it has no windows open — that coincidence makes the method look broken when it isn't.) Consequence beyond screenshots: AX-driven assistive tools have nothing to attach to — see the Cotypist entry in `.claude/work/questions.md`.
- Deleting an icon/asset file before updating the import that references it causes a transient Vite "Failed to resolve import" error (and a stale error overlay). Update the import first, or force a full page reload afterward (e.g. by touching `index.html`) to clear it.
- A Bash PreToolUse hook in this environment rejects some compound/looping shell commands — e.g. `for` loops using `lsof`, or chained commands like `screencapture ...; ls`. Use python3 one-liners or separate single-purpose Bash calls instead.
- WebKit defers repaints of elements using `content-visibility: auto` + `contain: strict`. During rapid class changes (e.g., `.active` toggled on two different elements in quick succession), both paint-defers, leaving the old and new states both visually highlighted for ~100ms until a later event loop cycle triggers a repaint. This became visible during fast Alt+↑/↓ room navigation when room-list entries used `content-visibility: auto`. Solution: abandon virtualization for room lists and render entries unconditionally (room lists are small enough that DOM size is acceptable).
- After a Tauri shell rebuild (sidecar recompile), the webview's first `/_gomuks/auth` request can beat the sidecar to port 29325, resulting in ECONNREFUSED (misreported as "auth fail" to the user). FIXED in production 2026-08-25: lib.rs waits for backend TCP readiness before creating the window. Dev can still hit it after a shell rebuild; workaround there: `touch web/index.html` (triggers Vite full reload).

## Patterns That Work
- To confirm a Tauri webview is alive without visual access: check for an ESTABLISHED TCP connection from the `com.apple.WebKit.WebContent` process to the Vite dev port, e.g. `lsof -nP -iTCP:6173 -sTCP:ESTABLISHED`. Combined with Vite's HMR (so changes appear live) and the user directly looking at the screen and reporting back, this closes the feedback loop fast enough to iterate on visual changes despite having no screenshot capability.

## Headless Chrome / Chromium SVG Rendering
- **SVG → PNG export works but hangs on exit:** Headless Chrome (`chromium-browser --headless --screenshot --default-background-color=00000000`) renders SVG correctly to transparent PNG but hangs indefinitely on exit (process never terminates). The hang is not a crash — the process sleeps, possibly waiting for a file handle or resource cleanup.
- **Workaround:** Run headless Chrome in the background with a defined timeout or kill it explicitly after the screenshot is written. Example:
  ```bash
  chromium-browser --headless --screenshot=output.png --default-background-color=00000000 file:///path/to/icon.svg &
  sleep 2 && kill %1
  ```
  The PNG is written promptly (within the first second), and the background job + explicit kill avoids waiting for the hung process to exit naturally.
- **Note:** This hang does not appear in interactive Chrome or in other Headless tools (e.g., Puppeteer with `browser.close()` works fine); it's specific to the command-line headless mode with file:// URLs.

## Never use `npm run tauri dev` (2026-09-20)

**Gotcha:** This repository has no `tauri` script in `web/package.json`. The scripts are: dev, build, lint, preview, test. Attempting `npm run tauri dev` silently does nothing or runs an unrelated script.

**Correct invocations:**
- `npm exec tauri dev` (uses installed @tauri-apps/cli)
- `./node_modules/.bin/tauri dev` (direct path)
- `cd web && npx tauri dev` (from the web directory)

Not catching this mistake costs minutes of dev downtime while debugging why the app won't launch.

## Build Commands
Requires Rust. **No longer requires libolm or any CGO flags** — the sidecar builds with
`-tags goolm`, which selects mautrix-go's pure-Go olm implementation (available since
mautrix v0.26.3). Without the tag the default is still the libolm cgo binding, so the tag is
not optional: drop it and the Homebrew dependency comes back.
Since the gomuks v26.06 merge the backend also needs `sqlite_fts5` (local message search);
without it `pkg/hicli/nofts.go` makes the build fail on purpose. So the tags are
`-tags goolm,sqlite_fts5` everywhere, including `go build`/`go vet` checks.
Since the gomuks v26.09 merge go.mod says `go 1.26.0` (toolchain go1.27.1), so Go 1.26 is
the minimum; an older local Go fetches the toolchain itself when GOTOOLCHAIN allows it.

```bash
# Frontend dist FIRST — the sidecar go:embeds web/dist (web/frontend.go), so the
# Go binary must be rebuilt after any frontend change that should ship in prod
cd web && npm run build

# Go backend sidecar (package is ./cmd/gomuks — `./...` does NOT work with -o)
go build -tags goolm,sqlite_fts5 -o web/src-tauri/binaries/gomuks-aarch64-apple-darwin ./cmd/gomuks

# Run Tauri dev (loads http://localhost:6173 via Vite proxy, no custom icon in dev)
cd web && npx tauri dev

# Production build. Prod window loads http://localhost:29325 (same-origin with
# sidecar; see lib.rs) after a TCP readiness wait — NOT the static dist.
cd web && npx tauri build

# Open production app
open /Users/tbird/gomuks/web/src-tauri/target/release/bundle/macos/echo.app
```

For an actual **release**, don't run these by hand — use `scripts/release.sh <version|patch|minor>`.
It enforces the build order above, bumps the three version files that must stay in sync
(`web/src-tauri/tauri.conf.json`, `web/package.json`, `web/src-tauri/Cargo.toml`), signs and
notarizes via `npx tauri build`, verifies stapling, generates the updater `latest.json`, and
publishes the GitHub release. It deliberately commits only the three version files, since this
branch carries a lot of unrelated uncommitted work.

## The tauri dev watcher vs the sidecar (restart storms)

`npx tauri dev` watches ALL of `web/src-tauri/` and restarts the app on every changed
file. Two consequences (both observed 2026-08-26):

- **Never run `npx tauri icon` while `tauri dev` is running.** It rewrites dozens of
  files under `src-tauri/icons/`, each triggering its own rebuild+restart. The rapid
  kill/spawn cycles race the sidecar on port 29325 and reliably end with the surviving
  app instance having a dead sidecar.
- **Any `tauri.conf.json` edit restarts the app**, and the backend is down for ~30-60s
  during the handover. During that window the frontend shows misleading errors:
  "authentication failure" (dev vite proxy ECONNRESET) or "Authentication failed:
  Internal Server Error" (vite's own 500 when the upstream is refused). These are NOT
  auth problems.

The sidecar can also die silently in these handovers: it logs "Server started" to
`~/Library/Logs/gomuks/gomuks.log` (rotated per start) and then panics to stderr,
which lib.rs drops (`let (_rx, child) = sidecar.spawn()`). If the app is up but login
fails, check `lsof -nP -iTCP:29325 -sTCP:LISTEN` first. Recovery: stop tauri dev,
pkill leftover `target/debug/app` / `gomuks-aarch64-apple-darwin`, relaunch.

## actool "attempt to insert nil object" is a wedged ibtoold daemon, NOT the .icon content

Correction to the earlier "Icon Composer SVG layer crashes actool deterministically"
diagnosis: the crash `Exception while running actool: *** -[__NSPlaceholderArray
initWithObjects:count:]: attempt to insert nil object from objects[0]` is caused by
ibtoold (actool's persistent daemon) getting into a bad state. Once wedged, EVERY
.icon compile fails — same package, any path, any layer type — and the identical
command that succeeded minutes earlier fails. `killall ibtoold` fixes it
deterministically (verified 2026-08-26: 3 consecutive failures → kill → same command
clean). The SVG-vs-PNG-layer theory was a coincidence of daemon state. scripts/release.sh
now does `killall ibtoold || true` before `npx tauri build`; do the same before any
manual `actool`/`tauri build` run that fails this way.

## release.sh: Four Latent Bugs That Bite Only on Release

These bugs were discovered by actually running the release script to completion (not
just unit-testing the parts). Each one cost a full or nearly-full build cycle before
failing, making them expensive to debug:

### Bug 1: TAURI_SIGNING_PRIVATE_KEY env var name is wrong
The Tauri CLI expects `TAURI_SIGNING_PRIVATE_KEY` (the key **contents**, not a path).
An earlier implementation used `TAURI_SIGNING_PRIVATE_KEY_PATH`, which the CLI ignores.
Signing fails silently after the entire build + Apple notarization (the most expensive
step — 15+ minutes, then another 15+ waiting for Apple's servers). By the time it fails,
you've burned 30+ minutes and can't retry until the notarization expires.

**Fix:** preflight that signs a throwaway file before building. If key+password don't
work, fail immediately (5 seconds) before any expensive operations.

### Bug 2: Cargo.lock is a fourth version file
`cargo build` automatically rewrites `Cargo.lock` to match the manifest. The release
script bumped three version files (tauri.conf.json, package.json, Cargo.toml) but not
Cargo.lock. If the release failed partway through, Cargo.lock was stranded at the new
version while the other three reverted to the old version (via trap handler), leaving
an inconsistent state. A successful release would tag a commit whose manifest and lock
file disagreed (manifest = new, lock = new, but they were bumped separately and could
diverge if `cargo build` had other interactions).

**Fix:** include Cargo.lock in the `write_versions()` routine. Bump it explicitly, then
`cargo check` to verify it's still consistent, then restore it along with the other
three on abort.

### Bug 3: DMG file never notarized
Tauri's build pipeline notarizes and staples the `.app` bundle, then builds the DMG
around it. But the DMG file itself is never notarized, so `stapler staple` on it fails
with "Record not found" (Notary API found no record of the DMG's hash). Users downloading
the DMG see "can't be opened because it hasn't been notarized by Apple" when trying to
extract it.

**Fix:** after the DMG is built, run a separate `notarytool submit` round-trip on it,
then `stapler staple` on the DMG. Verify both succeed before uploading.

### Bug 4: gh account drift during build
The GitHub CLI (`gh release create`) uses the currently-active `gh auth` account, which
can drift if you're logged in to multiple accounts. The preflight checks passed as the
ADMIN account, but 12 minutes into the build, a browser session to another account
became active and `gh auth` switched. When `git push` + `gh release create` ran, they
used the READ-only account instead, and GitHub returned 403 as a 404 (GitHub's answer
to permission-denied writes). The error message was misleading: "workflow scope may be
required" (pointing at CI/CD, not auth).

**Fix:** resolve the correct token upfront and export `GH_TOKEN=<token>`. This pins both
`git push` (via the credential helper `gh auth git-credential`) and `gh release create`
to use that token, independent of the active CLI account. Verify the token works before
building (part of the preflight).

## Git History Rewrite: Stripping 55MB Binary

The sidecar binary (web/src-tauri/binaries/gomuks-aarch64-apple-darwin, 55MB) was
accidentally committed twice in the unpushed commits (2026-08-27). Git history now
carried 110MB total, and every `git push` would upload that chunk.

**Fix:** git filter-branch to rewrite only unpushed commits (c1529c6c..HEAD, 4 commits):

```bash
git filter-branch --tree-filter 'rm -f web/src-tauri/binaries/gomuks-aarch64-apple-darwin' -- c1529c6c..HEAD
```

Verified the tree was identical before/after (0-byte diff). Kept a backup tag `pre-blob-strip`
for recovery if needed. Upstream commits (at/below c1529c6c) were untouched, so the fork
relationship and future `git merge upstream/main` still work correctly.

After filtering, run `git gc` to reclaim the disk space (~110MB local storage in `.git/objects`).
The local tag `pre-blob-strip` can then be deleted.

## Playwright-WebKit Behavioral Verification Harness

For rail/visual/animation work, live inspection against the dev server is required — CSS specificity bugs and animation-event races are invisible in static analysis.

**Setup:**
- Playwright + WebKit already installed in `/private/tmp/claude-501/.../scratchpad`
- Scripts: `railwatch2.mjs`, `allchats.mjs`, `activerow.mjs` load `localhost:6173` dev app
- Authenticated via minted `gomuks_auth` cookie

**Cookie Recipe (durable, session-independent):**
```
Read config: ~/Library/Application Support/dev.tbird.echo/config.yaml
Extract: username, token_key

Payload: compact JSON {"username": "<username>", "expiry": <now + 3600>}
Token: b64url(payload) + "." + b64url(HMAC-SHA256(token_key, payload))
       — NO padding on either b64url segment

Cookie: domain=localhost, path=/_gomuks/auth, value=<token>
(matches pkg/gomuks/server.go signToken; pinned test vector in lib.rs)
```

**Harness Instance:**
- Session-scoped tmp at `/private/tmp/claude-501/-Users-tbird-gomuks/5b417af2-8cc0-498f-bc0e-cbf16fcf78cd/scratchpad`
- Dies at session end (expected; recipe is the durable part)
- Verified: 18/18 Home rail transitions, 40 rooms + 18 DMs partition, room rendering, tile handoff during band animation

**When to Use:**
Before marking visual work done on rail animations, space transitions, or column-based layouts. "Code looks right" + "no obvious lint errors" is not enough; race conditions in animation events and CSS specificity bugs need live inspection.

## bundle_dmg.sh Stale Volume Failure

**Gotcha:** if a volume named "echo" is already mounted (leftover from a previous DMG install),
`bundle_dmg.sh` fails with "Device busy" or similar when trying to create a volume with the
same name.

**Symptom:** `npx tauri build` succeeds (it creates the `.app`), but the DMG bundler step fails.

**Fix:** eject the stale mount and rerun release.sh:
```bash
hdiutil detach /Volumes/echo
scripts/release.sh <version|patch|minor>
```

The version-restore trap in release.sh handles abort cleanup correctly.

## Manual git push: pin GH_TOKEN to taylorbird

**Gotcha:** `gh` CLI defaults to the currently-active authenticated account. If you're logged in
to multiple accounts (e.g., taylorbird and another org account), the active account can drift
after a browser session becomes active, causing `git push` to fail with 403 (misreported as 404).

**When to do this:** after release.sh runs, or whenever the active `gh` account is uncertain.

**Command:**
```bash
GH_TOKEN="$(gh auth token --user taylorbird)" && git push
```

This pins both `git push` (via credential helper `gh auth git-credential`) and any subsequent
`gh release create` to the correct account. release.sh exports `GH_TOKEN` upfront to avoid
this issue entirely.

## Vite dev server binds IPv6 only

**Gotcha (2026-09-04):** Vite's configured port (6173) binds to `[::1]` (IPv6 loopback) by default, not `127.0.0.1` (IPv4). An IPv4-only readiness probe (e.g. TCP connect to 127.0.0.1:6173) reports the server down even when it's running.

**Impact:** any harness/tooling that waits for Vite readiness before launching the Tauri app will timeout if it only tries IPv4.

**Fix:** readiness probes must try `::1`, or allow both IPv4 and IPv6. Simplest: connect to `[::1]:6173` instead of `127.0.0.1:6173`.

## WKWebView localStorage access via sqlite

**Fact (2026-09-04):** WKWebView stores all localStorage/sessionStorage in a sandboxed sqlite database:
- Dev build (`dev.tbird.echo-dev`): `~/Library/WebKit/dev.tbird.echo/*/WebsiteData/Default/*/*/LocalStorage/localstorage.sqlite3` (UTF-16LE values)
- Prod build (`dev.tbird.echo`): `~/Library/WebKit/dev.tbird.echo/...` (same structure)

**Use case:** diagnosing storage state without a devtools connection (devtools unavailable in prod or CI). Query the sqlite directly to inspect preference values, custom colours, collapsed sections, etc.

**Example:** user's custom user colour #ad9cfe vanished in dev profile after a build; checking the dev sqlite showed `gomuks_custom_user_colors` became `{}`, but the prod profile retained its values. Cause unknown (possibly user-removed, possibly dev-only reset).

## Production backend logs include debug output

**Fact (2026-09-04):** prod builds don't suppress debug logging. Log file at `~/Library/Logs/dev.tbird.echo/gomuks.log` (rotated per start).

**Search keys:**
- `"send/m.room.encrypted"` finds all IPC message sends. During 2026-09-02 network outage, 47 sends found but zero reaction sends, confirming reactions never reached the backend.
- `"Failed to copy media to temporary file"` indicates homeserver media service is down (not an app fault; the 502 that results is expected).

## nohup-detached tauri dev survives harness cleanup

**Pattern (2026-09-04):** `nohup npx tauri dev … &` detaches the process from the harness task list, so TaskStop signals or cleanup events don't kill it.

**Consequence:** the process is no longer trackable as a background task. If cleanup is needed, kill it explicitly by port or process name:
- By port: `lsof -ti :6173` or `lsof -ti :29325`
- By process: `pkill -f target/debug/app` or `pkill -f gomuks-aarch64-apple-darwin`

**Use case:** release.sh takes 25–35 minutes (two Apple notarization waits), but Claude Code's Bash tool caps background commands at 10 minutes. Launching detached ensures the script can run to completion uninterrupted.

## Subagent cleanup killed tauri dev twice

**Gotcha (2026-09-04):** Two subagents' cleanup routines (one via stray TaskStop, one via headless-Chrome cleanup) killed the running dev app. The process was launched as a direct child of the harness task, so cleanup signals propagated to it.

**Fix:** subagent briefs for any work that might spawn side effects must explicitly forbid:
- Launching browsers (headless or interactive)
- Starting background tasks with nohup or similar
- Calling TaskStop or other termination signals

**Recovered pattern:** Briefs should document these forbidden actions explicitly so the subagent knows the constraints.

## Vite HMR survives sidecar death (2026-09-21)

**Pattern:** Vite's HMR (Hot Module Reload) runs on its own socket (port 6173, independent of the gomuks backend on 29325). When only the sidecar is killed (backend dies but Vite keeps running), the browser window remains on the disconnected-screen forever — because there's no backend to reconnect to. **However:** Vite HMR still works. If you edit `web/src` files, the changes reload live in the window (CSS, TSX, etc.), giving you a way to iterate on the disconnected screen UI without a live backend.

**Use case:** testing DisconnectedScreen styling, animations, and layout without spinning up the full backend stack. Kill the sidecar, keep Vite running, edit CSS/TSX, and see the results live on the disconnected-screen display.

## eslint import/order: sorting quirk with @/ alias (2026-09-21)

**Fact:** The `eslint-plugin-import` rule `import/order` sorts imports in a specific sequence: Node.js built-ins, external packages, internal aliases (`@/`), relative paths (`./ ../`), then type imports. Within each group, items are sorted alphabetically. **Quirk:** image/icon imports (`@/icons/x.png`) sort alphabetically WITHIN the `@/` group, so they must come before relative `.tsx` imports if the rule is to pass. This can make the imports look "out of order" if you're not aware of the rule. **Pattern:** put all `@/` imports (including image files) before relative imports in the same group.

## sips for Downscaling UI Raster Assets (2026-09-21)

**Utility:** `sips` (scalable image processing system) is a macOS built-in command-line tool for image manipulation. For downscaling a 1024px icon/image to 256px: `sips -Z 256 in --out out` (where -Z is "scale to fit in square", in is the source file, --out specifies the output file).

**Example:** `sips -Z 256 web/src-tauri/icons/echo.icon/Assets/echo-icon-penguin-positioned\ 2.png --out web/src/icons/echo-penguin.png`

Used this session to create the 256px downscale of the echo penguin for DisconnectedScreen display. No external image tools needed; `sips` is already available on any Mac.

## Headless Chrome One-Look Render for Artifact HTML (2026-09-13)

**Use case:** visual verification of artifact HTML without a browser window. Headless Chrome renders the page to PNG for a quick "does it look right" check, useful when live dev browser is unavailable (CI, sandboxed environment, visual review after export).

**Command:**
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --window-size=1400,1500 \
  --virtual-time-budget=4000 \
  --screenshot=output.png \
  file:///path/to/artifact.html
```

**Behavior:** `--headless=new` (Tauri's new headless mode) exits on its own after the screenshot is taken, unlike the deprecated `--headless` (which hangs indefinitely on file:// URLs). `--virtual-time-budget=4000` gives 4 seconds of virtual wall-clock time for animations/fonts to load. Render PNG is readable immediately (within ~1 second).

**Gotcha:** file:// URLs have no charset declaration, so UTF-8 punctuation (em-dashes `—`, ellipses `…`) render as mojibake. Use HTML entities instead: `&#8212;` for em-dash, `&#8230;` for ellipsis.

## `pnpm exec` in web/ triggers a full install (2026-09-12)

**Gotcha:** this repo is an npm project (package-lock.json, no pnpm lockfile). Running
`pnpm exec tsc` or `pnpm run lint` in `web/` does NOT just run the tool: pnpm first performs a
full dependency install, rewriting `node_modules` into its symlinked layout, generating
`pnpm-lock.yaml`, and writing a placeholder `pnpm-workspace.yaml` (`allowBuilds: … set this to
true or false`) that then makes every later pnpm command fail with `ERR_PNPM_IGNORED_BUILDS`.
The install resolves fresh versions within package.json ranges (package-lock is ignored), so
plugin minors can drift — after one such install `eslint-plugin-react-hooks` 7.1.1 introduced
two new lint errors in untouched files.

**Until the pnpm-migration question is decided:** run tools as `./node_modules/.bin/tsc` and
`./node_modules/.bin/eslint` (or `npm run …`). Never `pnpm …` in `web/`. If an accidental
install has happened, delete the two generated files and run `npm ci` in `web/` with tauri dev
STOPPED to restore the lockfile-exact tree.

## lsof process name truncation and dev-vs-prod sidecar naming (2026-09-17)

**Gotcha 1: lsof truncates the process name column**, limiting visibility to ~15 characters. A process grep searching for "WebKit" or "WebContent" will never match — the WebContent process shows as "com.apple" in lsof output because the full name is truncated.

**Gotcha 2: sidecar process naming differs between dev and prod.** In dev (tauri dev), the sidecar spawned process is named `gomuks` (short name). In prod (npx tauri build output), the bundled binary is named `gomuks-aarch64-apple-darwin` (full triple). Readiness probes and cleanup scripts must account for this difference: `pgrep -f gomuks` matches both, but `pkill -f gomuks-aarch64-apple-darwin` only hits prod and `pkill -f 'target/debug/app'` only hits dev.

**Verified in this session:** attempted to validate running version via AX API (`osascript` System Events) using process name as the identifier. Recognized the lsof truncation issue (reported as "WebKit" not in process list) and corrected the method to use the WebContent process's TCP connection to the dev port instead.

## "0 windows from System Events" proves nothing (2026-09-17)

**Gotcha (corrected from earlier hypothesis, 2026-09-17):** `osascript -e 'tell application "System Events" to tell process "app" to get count of windows'` returns 0 for the echo window. This is NOT evidence that the window failed to render or that the app has no windows. **Verification required:** test the same command against an app known to have a window.

**Validated this session:**
- echo process: 0 windows (Accessibility API reports only AXMenuBar)
- yaak (unrelated Tauri app): 0 windows, identical signature
- Ghostty (native terminal, AX-permitted): 1 window (so the query method is sound)
- Finder: 0 windows when it has none open (the method is correct; 0 is a valid answer)

**Inference:** Tauri/WRY-wide behaviour where the NSWindow is absent from the Accessibility API tree. NOT a consequence of `transparent: true` or `macOSPrivateApi: true` (yaak has both and exhibits the same signature). Related to Cotypist (assistive text prediction) having no text field to attach to because the window is invisible in the AX tree.

**Corrected learning:** "0 windows from System Events" is not by itself evidence of anything. Always validate the query method against an app known to have a window before concluding the app under test has failed.

## Node >= 22.12 Required for Vite 8 + rolldown (2026-09-24)

**Gotcha:** Vite 8 bundles rolldown (rewrite of the JavaScript bundler), which includes a native binary rolldown-binding.darwin-arm64.node. The default fnm Node on this machine is 22.2.0, which is too old to load the native binding. npm silently skips loading it, and the build appears to succeed, but the app crashes at runtime with missing dependencies.

**Symptom:** frontend builds successfully; `tauri dev` launches the webview; page loads; then errors in devtools console indicate missing modules (e.g., "Could not find a default export").

**Fix:** use Node 22.23.1 or later. The machine's fnm has this version available. Prefix npm installs, `tauri dev`, and release.sh with:
```bash
fnm exec --using=22.23.1 npm install
fnm exec --using=22.23.1 npm run build
fnm exec --using=22.23.1 sh -c 'cd web && exec ./node_modules/.bin/tauri dev'
fnm exec --using=22.23.1 /path/to/scripts/release.sh minor
```

**Verified:** 0.7.0 release ran as `nohup fnm exec --using=22.23.1 .../scripts/release.sh minor ...` and both production and dev builds worked correctly.

## Build Tags: goolm and sqlite_fts5 Both Required (2026-09-24)

**Gotcha:** As of gomuks v26.09, the backend build requires TWO tags: `go build -tags goolm,sqlite_fts5 ./cmd/gomuks`. Both are mandatory. The `goolm` tag (pure-Go olm implementation) has been in place since mautrix v0.26.3. The `sqlite_fts5` tag is new upstream (local message search feature); without it, `pkg/hicli/nofts.go` deliberately fails the build.

**Minimum Go version:** go.mod specifies go 1.26 as the minimum (installed toolchain is go1.27.1).

**When running:** any `go build`, `go vet`, or build verification must include both tags:
```bash
go build -tags goolm,sqlite_fts5 -o web/src-tauri/binaries/gomuks-aarch64-apple-darwin ./cmd/gomuks
go vet -tags goolm,sqlite_fts5 ./...
```

## gh Token Lacks workflow Scope; Resolve .github/workflows Before Upstream Syncs (2026-09-24)

**Gotcha:** The taylorbird gh token (personal account) lacks the `workflow` scope, which is required to push changes to `.github/workflows/*` files. This only becomes visible during upstream syncs: if a merge commit touches .github/workflows/go.yml or .github/workflows/js.yml (the shared GitHub Actions workflows), a `git push` at the end of release.sh will be rejected with "Insufficient permissions" (403). The error message may blame "workflow scope" inaccurately.

**Why it matters:** echo doesn't use GitHub Actions (the workflows are upstream's CI; echo runs locally). Granting the token the full `workflow` scope would widen its permissions globally across all repos — a security trade-off that's not worth it for one file.

**Pattern (2026-09-24):** On an upstream sync, KEEP echo's copies of .github/workflows/go.yml and .github/workflows/js.yml. Before pushing, resolve merge conflicts in those files to echo's side (ours, not theirs). When `git push` runs, it will succeed because the token can push to .github/workflows if the file is one echo already owns.

**Verified:** 0.7.0 release hit this: push was rejected; commit 86694d3b restored .github/workflows to echo's versions; manual `git push` with `GH_TOKEN` pinned succeeded.

## @tauri-apps Package Versions Locked to Cargo.lock (2026-09-24)

**Gotcha:** The web/package-lock.json entries for @tauri-apps/plugin-updater (2.10.1), @tauri-apps/plugin-opener (2.5.4), @tauri-apps/cli (2.11.4), and react-colorful (5.6.1) must match the Cargo.lock versions exactly. Mismatches cause version errors at runtime. This becomes visible after an upstream sync when Cargo.lock is regenerated as part of merge conflict resolution.

**Pattern:** If Cargo.lock changes during a merge, re-lock the npm packages to match BEFORE committing. Verify all four versions align between the two lock files.

## Backend cache dir is created only at startup: broken images after a cache cleanup (2026-10-05, 2026-10-06)

**Symptom:** after deleting ~/Library/Caches/dev.tbird.echo-dev during a disk cleanup, every image and avatar in the running app was broken. It happened twice.

**Cause:** the gomuks backend creates its cache dir only at startup (pkg/gomuks/gomuks.go:177, MkdirAll). Deleting it while the app runs leaves media writes with no directory.

**Fix:** restart the app. A self-healing fix (recreate the cache dir on demand in pkg/gomuks/mediadownload.go) was offered and not yet decided.

**Also after any such cleanup:** run `go clean -cache` before releasing (see release-pipeline.md).

## Reading webview events without Web Inspector (2026-10-08)

**Pattern:** in `tauri dev`, frontend debug data can be piped into the tauri dev terminal (stdout) through Vite's HMR websocket, with no Web Inspector attached.
- Client side: `import.meta.hot?.send("echo:debug", data)`.
- Server side: a Vite plugin with `configureServer(server) { server.ws.on("echo:debug", d => console.log(...)) }`.
- Load the client script with a dev-only dynamic import (`if (import.meta.env.DEV) void import(...)`), so nothing ships.

**Identifying programmatic scrollers:** patch `Element.prototype` `scrollTop` (via `Object.defineProperty`) and wrap `scrollIntoView`, `scrollTo`, `focus`; log `new Error().stack` on each call. Also log capture-phase scroll events and elements appended directly under `body`.

**Reference copies:** `.claude/work/mockups/debug-scroll.ts` and `.claude/work/mockups/vite-debug-sink.ts`. Remove the hooks before committing; they are dev-only and must not reach a release.
