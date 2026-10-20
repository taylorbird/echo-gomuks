# Current State

## Project
echo (gomuks fork; repository `taylorbird/echo` on GitHub, bundle ID `dev.tbird.echo`)

## Objective
Fork gomuks and redo the frontend to make it more visually appealing, wrapped as a native macOS app plus an iOS companion app (forked Element X scaffold; design language as cross-platform contract, not shared code; Android out of scope). Linux desktop (Tauri AppImage + deb) is a build target, in progress. Also evaluating gomuks FFI (pkg/ffi) as the path to an iOS echo instead of the Element X fork.

## Current Focus
- 0.7.4 shipped 2026-10-19: MSC4529 profile overrides + centred profile card (signed, notarized, feed verified). Release: https://github.com/taylorbird/echo/releases/tag/v0.7.4
- Branch `mobile-ffi` (local, from 61afc380, checked out, not pushed): mobile spike started. Step 1 approved.
- Linux arm64 AppImage built in OrbStack, never launched on a desktop.

## Last Checkpoint
2026-10-19 17:34 PDT

## Constraints
Full ledger: .claude/work/constraints.md (★ = added 2026-10-07, ◆ = added 2026-10-19)
- ★ Rail DM tiles never take the glow pill; they ignore 2nd clicks of a double-click and are inert while a drawer closes
- ★ DM unread is a red dot (`dm_mention_colors`); the red @ badge is reserved for real mentions
- ★ YouTube embed: nothing contacts YouTube until the card nears the screen; one player at a time; iframe sandboxed
- ★ Widget permission prompt: no autofocus on Allow (Enter must not grant everything)
- ★ Linux: Linux-only config in tauri.linux.conf.json and `html[data-platform="linux"]` CSS; macOS chrome untouched; build via scripts/linux-build.sh in OrbStack; secrets on stdin, never orb argv
- ★ After any cleanup touching ~/Library/Caches: restart the app, then `go clean -cache` before releasing
- Custom emoji markdown title parenthesised `(Emoji: :x:)`, never quoted (macOS smart quotes)
- Space DM inclusion = Element's rule (space + subspace members via dm_user_id); space badges recount on member change
- Download auto-open limited to allowlist (pdf, txt, md, rtf, csv, office/iWork/OpenDocument); others revealed in Finder
- Pop-up pattern: two columns (visual left, details right), ringed Cancel + filled primary buttons
- Lightbox renders above all modals; anything shown from it is drawn inside the lightbox
- Multi-file sends: one event per file, text on last, only first send clears the composer
- Go backend builds with `-tags goolm,sqlite_fts5` (go.mod minimum go 1.26)
- Vite 8 / rolldown need Node >=22.12: `fnm exec --using=22.23.1 ...` for npm, tauri dev, release.sh
- gh token lacks `workflow` scope; keep echo's .github/workflows copies on upstream syncs
- Lock @tauri-apps/* plugins/cli to the Cargo.lock versions (constraints.md 2026-09-24)
- Inter 4.1 variable bundled (web/src/fonts/); no Google Fonts
- DB schema v27; builds <0.7.0 cannot open upgraded data
- Logs: release ~/Library/Logs/echo-release/, dev ~/Library/Logs/echo-dev/
- PreToolUse hook requires push review before git push (run /push-review first); release.sh pushes internally
- Release notes: plain voice, one line per bullet; rewrite RELEASE_NOTES.md before every release.sh run
- Skeleton animation `sk-sweep` app-wide; no shimmer; HairlineWait for unknown shapes
- Disconnected screen: opaque skeleton, never blur; penguin lockup Easter egg
- Echo penguin logomark (web/src-tauri/icons/echo.icon); web/public/gomuks*.png are upstream leftovers
- release.sh pins gh token to `taylorbird`; manual push: `GH_TOKEN="$(gh auth token --user taylorbird)" git push`
- Reduce Motion gates: @media + data-ignore-reduce-motion override pair
- Dev: `./node_modules/.bin/tauri dev`, never `npm run tauri dev`; npm not pnpm in web/; backend token 24h mint-once
- Design: Inter only; room names white (dark); unread blue vs red+@; sender colours room-aware; macOS CSS scoped `html[data-tauri]`
- ◆ Anything sent to a room uses real names (getRealDisplayname), never MSC4529 overrides
- ◆ User profiles open as the profile card via the setRightPanel interception; don't revive the side-panel user view
- ◆ Custom modal boxes (profile-card-box, profile-override-box) set `div.modal-box-inner` to overflow: visible
- ◆ Override/profile picture uploads: PNG, JPEG, WebP, GIF only, decode-checked

## Next Actions (Priority Order)
1. Mobile spike step 1 (branch mobile-ffi): `rustup target add aarch64-apple-ios-sim aarch64-apple-ios` (approved), then build pkg/ffi as a static c-archive for the iOS simulator (GOOS=ios GOARCH=arm64, CGO via `xcrun -sdk iphonesimulator clang`, tags goolm,sqlite_fts5). Env: Xcode 27.1, iOS SDK 27.1, iPhone 16 simulators, Go 1.27.1.
2. Spike step 2: bare Tauri iOS app linking the archive; GomuksInit/GomuksStart; room list via the event callback.
3. Spike steps 3-4: transport in web/src/api over Tauri invoke/events; iOS notification extension calling GomuksHandlePush within the memory limit (needs Apple developer account push entitlement + a Sygnal push gateway).
4. Carry forward: Linux AppImage test, reaction-tooltip bug, styling leftovers, circle-or-square avatar TODO, and the unverified-in-app items in questions.md (Start chat confirm, override drag-and-drop).
