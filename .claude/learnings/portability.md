# Cross-Platform Portability

Assessment findings from evaluating iOS/Android and Linux/Windows ports of echo.

## The Go backend: CGO dependency on SQLite

- **CGO is required only for SQLite:** Driver is registered as `"sqlite3-fk-wal"` via a blank import of `go.mau.fi/util/dbutil/litestream`, whose `register.go` is gated `//go:build cgo` and registers the driver through `github.com/mattn/go-sqlite3` (a C binding). That is the only hard CGO dependency.
- **Direct dependency chain:** `pkg/gomuks/gomuks.go:89` registers the driver → blank import of `go.mau.fi/util/dbutil/litestream` at `pkg/hicli/hicli.go:23` → `register.go` is `//go:build cgo` and uses `github.com/mattn/go-sqlite3` (go.mod:26, a direct dep).
- **Inferred:** `CGO_ENABLED=0` compiles without errors but fails at runtime with an unknown-driver error when the app tries to open `gomuks.db`.
- **Cross-compiling the sidecar requires a C cross-toolchain per target** (or per-OS CI runners). Upstream's `.gitlab-ci.yml:124-153` uses per-target Docker images (`dock.mau.dev/tulir/gomuks-build-docker:<target>` for linux/amd64, linux/arm, linux/arm64, windows/amd64).
- **Other CGO dependencies:** HEIC (image format, `media_heic.go`) and cwebp (WebP transcoding, `media_cwebp.go`) are also cgo-gated but degrade gracefully with `//go:build cgo` guards; format is simply unavailable on pure-Go builds.
- **Libolm is already avoided:** Release builds use `-tags goolm,sqlite_fts5` (release.sh; `sqlite_fts5` is required since the gomuks v26.06 merge) to swap the C Olm library for mautrix-go's pure-Go reimplementation (`maunium.net/go/mautrix/crypto/goolm`, selected by the `goolm` build tag).

## The wasmuks path: WASM backend exists, unfit for iOS

- **Upstream includes a complete WASM build:** `cmd/wasmuks/` directory, built with `//go:build js`, runs the entire gomuks backend in a Web Worker. Includes `pkg/sqlite-wasm-js/` (pure-JS SQLite driver).
- **Build via `web/build-wasm.sh`:** Compiles the Go backend to WASM, bundles it with the React frontend, produces a static site deployable to any host.
- **Frontend gate in `index.html`:** When no Tauri runtime is detected (`!window.__TAURI_INTERNALS__`) and no `gomuks-frontend-etag` meta tag, the frontend auto-selects wasmuks and spins up the WASM backend in a Worker. Tauri builds are explicitly excluded from the gate.
- **Unfit for iOS:** (1) iOS suspends background tasks, so sync cannot run when the app is backgrounded. (2) Notifications need decrypted content in the notification body; a WASM backend running in the main JS thread (or any Worker) cannot run inside a notification extension, so push notifications stay encrypted and useless. (3) On-phone performance is unmeasured. (4) Native feel is capped at web-app (no system notifications, no badge counts, no VoIP integration).
- **Viable as a test:** Building wasmuks + hosting statically + testing in mobile Safari (no iOS suspension in browser) is a zero-code way to verify frontend behavior on a phone before committing to a native build.

## The FFI path: gomuks embedded in a mobile app (2026-10-19)

**Correction to the 2026-09-01 assessment.** It rejected the WASM backend and a hosted backend for iOS and picked an Element X fork, but it never evaluated `pkg/ffi`, upstream's C library interface for linking the Go backend into an app process. The FFI has been in the tree since 2026-01-24 (#680). This is the gomuks analogue of what Sable-next does with its Rust core in Tauri mobile.

- **API** (`pkg/ffi/gomuksffi.h`): `GomuksInit(root)`, `GomuksStart(handle, eventCallback)`, `GomuksSubmitCommand(Async)` using the same jsoncmd command names as the websocket RPC, media upload/download with progress, `GomuksDestroy`.
- **Push:** `GomuksHandlePush` (added 2026-08-19, upstream #747, `pkg/gomuks/matrixpush.go`, `pkg/hicli/synccrypto.go`) takes a homeserver push payload and returns the event. The header says it "can be called without GomuksStart", which is what an iOS Notification Service Extension needs. This reached echo after the 2026-09-01 assessment.
- **Build:** `pkg/ffi/build.sh` builds a c-shared `libgomuksffi` with `-tags sqlite_fts5`. iOS doesn't allow loading shared libraries this way, so an iOS build needs a static c-archive (inferred, not tried).
- **Inferred shape of a mobile echo:** Tauri 2 mobile app whose Rust side links libgomuksffi; a new transport in `web/src/api` carrying commands/events over Tauri invoke/events instead of the websocket (the React frontend carries over); an iOS NSE calling `GomuksHandlePush`; a push gateway (Sygnal) with echo's own APNs key.
- **Unknown:** Go runtime + SQLite inside the NSE memory limit (biggest risk); Tauri iOS maturity for a full app; whether upstream ships a mobile app on this FFI.
- **Next step agreed 2026-10-19:** a spike on a branch: build the FFI for the iOS simulator, link it into a bare Tauri iOS app, show the room list through it.

### Spike step 1 result (2026-10-19): gomuks runs on the iOS simulator

- `scripts/ios-ffi-build.sh <simulator|device>` builds `pkg/ffi` with `-buildmode=c-archive` (GOOS=ios GOARCH=arm64, Xcode clang, tags goolm,sqlite_fts5) into `target/ios-ffi/<target>/` with `gomuksffi.h`. Archive ~47MB, all 14 `Gomuks*` functions exported. Both simulator and device builds succeed.
- **Gotcha:** set `CXX`/`CGO_CXXFLAGS` as well as `CC`/`CGO_CFLAGS`. libde265 (HEIC decoding) is C++; with only CC set it compiled for macOS and the archive mixed platforms (one object platform 1 among 164 platform 7), which Xcode won't link. The script checks every object's LC_BUILD_VERSION platform.
- Linking a C caller needs `-lresolv -lc++ -framework CoreFoundation -framework Security -framework SystemConfiguration`, and the include path `pkg/ffi` (the generated header just `#include`s `gomuksffi.h`).
- **Verified in the iPhone 16 Pro simulator** (`xcrun simctl spawn`): GomuksInit returned a handle, GomuksStart returned 0, SQLite created and migrated both databases (main v27, crypto v21), the event callback received client_state and sync_status, GomuksDestroy shut down cleanly. Not logged in, so no sync yet.
- SQLite warns `gethostuuid() is disabled` at build time on iOS; harmless.

### Spike step 2 result (2026-10-20)

- **Verified in the iPhone 16 Pro simulator (iOS 18.5):** the Tauri iOS app (mobile/src-tauri, its own Cargo workspace) launches, gomuks starts from the app data dir (its log in the app container confirms), and echo's sign-in screen renders from backend state. Sign-in not yet done.
- `tauri ios init` (tauri-cli 2.11.4) reinstalls Homebrew libimobiledevice and its deps on its own, and requires CocoaPods (`pod install`). Its gem install needs sudo and fails, so CocoaPods was installed with `brew install cocoapods` (pulls Homebrew Ruby).
- `tauri ios build` refuses to build unless a simulator runtime matching the SDK is installed ("Xcode Simulator SDK 27.1 is not installed"). This Mac has SDK 27.1 but only the iOS 18.5 runtime. Workaround: mobile/xcode-build-rust.sh replaces `tauri ios xcode-script` in gen/apple/project.yml (regenerate with `xcodegen generate`). It builds the lib with plain cargo for aarch64-apple-ios-sim / aarch64-apple-ios and copies it to gen/apple/Externals/arm64/<config>/libapp.a.
- Build: `xcodebuild -project mobile/src-tauri/gen/apple/echo-mobile.xcodeproj -scheme echo-mobile_iOS -configuration debug -sdk iphonesimulator -destination id=<udid>`. Install with `xcrun simctl install`; launch with `xcrun simctl launch --console-pty <udid> dev.tbird.echo.mobile`.
- Building with plain cargo needs tauri's `custom-protocol` feature. Without it, a debug build looks for a dev server ("Failed to request tauri://localhost/").
- The user's homeserver (synapse.mssj.me, MAS at login.synapse.mssj.me) offers only m.login.sso / m.login.token. MAS advertises device_authorization_endpoint, and echo's login screen prefers the device-code flow, which runs entirely through backend RPC, so it works over the FFI (inferred from the code; not yet exercised).
- Simulator.app was not found on this Mac (not in Xcode 27's Contents/Developer/Applications). `xcrun simctl` works headless. The user needs the Simulator GUI to sign in.
- Known UI issue: the "ECHO" wordmark sits under the iOS status bar (no safe-area handling).

## Sable-next as an alternative base (researched 2026-10-19)

Sable v2 (git.sable.moe/SableClient/Sable-next), from the research agent's reading of the repo: from-scratch rewrite started 2026-08-10, v2.0.0 on 2026-10-10. Svelte 5 UI over a Rust core on a forked matrix-rust-sdk; the core runs natively (SQLite) in Tauri on desktop, iOS and Android, or as WASM in the browser. Requires sliding sync (synapse.mssj.me advertises `org.matrix.simplified_msc3575`, verified). AGPL-3.0-or-later. One author wrote ~6,300 of the commits. CONTRIBUTING.md declines AI-assisted contributions, so echo's work could never go upstream; forks are welcome. Echo's React code wouldn't transfer (Svelte), so moving means a UI rewrite. Decision: stay on gomuks and try the FFI path first.

## Desktop port: macOS vs. Linux/Windows

### Architecture overview
- Tauri 2.0 app (React frontend, Go backend sidecar)
- macOS-specific surfaces (transparent window, vibrancy, traffic lights, native menu, window chrome CSS)
- Release pipeline single-platform (scripts/release.sh hardcoded for macOS)

### Linux/Windows blockers and moderate plumbing

**SQLite cross-compilation:** Already covered under CGO dependency (above). Each target OS needs its own build or a per-target runner with cross-compiler.

**Binary naming:** `scripts/release.sh:242` has hardcoded per-platform binary names like `gomuks-aarch64-apple-darwin`. Supporting a new platform requires adding its triple and recompiling on that OS or with a cross-toolchain.

**Tauri Assets (icon bundling):** `tauri.conf.json:41` references `"icons/Assets.car"` (a macOS Xcode asset catalog, compiled binary format). Tauri Windows/Linux builds do not use Assets.car; they expect individual PNG files. Supporting Windows/Linux requires building separate icon asset chains and conditionally including them in the bundle config.

**Latent Windows data-dir bug:** `web/src-tauri/src/lib.rs:244` uses `cfg!(target_os = "macos")` to make the data directory the same as the config directory. Meanwhile, `pkg/gomuks/gomuks.go:142` does the same check for `windows || darwin`, so the two sides would disagree on Windows: Rust would put config in one place and data in another, while Go would put them together. Needs a coordinated fix (both sides should use the same cfg check).

**macOS-specific window chrome:** 
- `tauri.conf.json:13` has `macOSPrivateApi: true` (required for vibrancy effects)
- `tauri.conf.json:22-29` has `titleBarStyle`, `hiddenTitle`, `windowEffects` (macOS window effects)
- Two CSS blocks scoped to `html[data-tauri]` only (index.css:454-694 ~54 declarations for titlebar/panes/sidebar styling; MainScreen.css:79-113 for mobile slide) — these are macOS-only UI chrome
- Frontend has NO macOS sniffing: keybindings.ts registers Ctrl and Super variants side by side (will work on any platform)

**Release pipeline:** `scripts/release.sh` is entirely macOS-centric:
- Uses macOS tools: `security`, `xcrun actool`, `xcrun stapler`, `xcrun notarytool`, `spctl`, `killall ibtoold`, `codesign`, `hdiutil`
- Pre-compiles `icons/Assets.car` via actool (macOS-only toolchain)
- Signs and notarizes for macOS
- Produces a `.dmg` installer (macOS-only)
- `latest.json` (updater config) has a single platform key: `darwin-aarch64`
- Supporting a new OS requires a new release pipeline branch or conditional logic (not attempted yet)

### Effort estimate
**Moderate plumbing.** No architectural blockers, but incremental work on multiple fronts:
1. Cross-compile SQLite sidecar per target OS (need cross-toolchain setup or per-OS runners)
2. Conditionally include icon assets (separate PNG chains per OS, config changes)
3. Fix latent Windows data-dir mismatch (coordinate Rust + Go config handling)
4. Extract macOS-specific window chrome CSS into a conditional block (or keep it and let it harmlessly fail on other OSes)
5. Build conditional release pipeline (or separate branches)

None of these are blockers individually; the aggregate work is substantial but well-understood.

## Verifiable facts (2026-09-01)

- ✓ gomuks requires CGO for the sqlite3 driver (mattn/go-sqlite3 C binding)
- ✓ wasmuks exists, builds, and can run in a Web Worker
- ✓ wasmuks is unsuitable for iOS (suspension, no notification extension, no native feel)
- ✓ Backend has zero rate-limiting or lockout (grep verified)
- ✓ Tauri assets (Assets.car) are macOS-specific (Windows/Linux need separate asset chains)
- ✓ release.sh is macOS-only (uses Security framework, Xcode tools, DMG creation)
- ✓ Linux/Windows port is moderate effort (no architectural blockers, incremental plumbing)

## Related learnings

- backend-auth.md: authentication mechanics, rate-limiting gap
- dev-environment-gotchas.md: build commands, Vite dev server setup, CGO/goolm
- release-pipeline.md: release workflow, signing, notarization, latest.json generation

## Linux desktop build facts (2026-10-05 to 2026-10-07)

Built as an AppImage and .deb in the OrbStack builder (`scripts/linux-build.sh`). Observed in session unless marked otherwise:
- `tauri.linux.conf.json` is merged automatically over `tauri.conf.json` by the Tauri CLI. Arrays are replaced wholesale, not merged.
- Tauri requires Apple-style bundle category names. `"Network"` fails; `"SocialNetworking"` works.
- AppImage bundling inside OrbStack needs `APPIMAGE_EXTRACT_AND_RUN=1` and `NO_STRIP=true`, and `xdg-utils` installed (the bundler copies /usr/bin/xdg-open).
- The bundle dir keeps packages from older versions unless it is cleared before a build.
- Platform CSS scope: index.html sets `data-platform="linux"` from the user agent. Linux CSS lives under `html[data-tauri][data-platform="linux"]`, so macOS CSS is unaffected.
- Timings: cold build about 4 minutes, incremental about 35 seconds.
- Parallels on Apple Silicon runs arm64 guests only, so x86_64 needs a separate machine (tester "wreck").
- AppImage on Arch needs fuse2 (general knowledge, not tested here).
- YouTube playback on Linux needs gst-plugins-good and gst-libav (declared in the .deb depends). Not tested.
