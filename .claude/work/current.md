# Current State

## Project
echo (gomuks fork; repository `taylorbird/echo` on GitHub, bundle ID `dev.tbird.echo`)

## Objective
Fork gomuks and redo the frontend to make it more visually appealing, wrapped as a native macOS app plus an iOS companion app (forked Element X scaffold; design language as cross-platform contract, not shared code; Android out of scope). Linux desktop (Tauri AppImage + deb) is a build target, in progress. iOS path under test: gomuks FFI (pkg/ffi) inside a Tauri iOS app (branch mobile-ffi), instead of the Element X fork. Open decision: rebuild echo on Sable-next (see Current Focus).

## Current Focus
- 0.7.4 shipped 2026-10-19: MSC4529 profile overrides + centred profile card (signed, notarized, feed verified). Release: https://github.com/taylorbird/echo/releases/tag/v0.7.4
- Branch `mobile-ffi` (local only, not pushed): mobile spike steps 1 and 2 done (ef5fbece, 6f61026a). Step 2 verified in the iPhone 16 Pro simulator (iOS 18.5): app launches, gomuks starts, sign-in screen renders. Sign-in not done (needs the user and the Simulator GUI).
- PENDING DECISION (2026-10-20): the user wants to rebuild echo entirely on Sable-next (Svelte 5 + Rust core on matrix-rust-sdk, Tauri on all platforms), recreating all features and UI, not as a branch off echo's main. Not decided. No code until the questions in questions.md are settled.
- Linux arm64 AppImage built in OrbStack, never launched on a desktop.

## Last Checkpoint
2026-10-20 08:45 PDT

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
1. Settle the Sable-next rebuild questions (questions.md, "2026-10-20") before any code.
2. If staying on gomuks: finish spike sign-in (user + Simulator GUI), then the iOS notification extension and a GomuksHandlePush memory test (needs Apple developer account push entitlement + Sygnal gateway).
3. Carry forward: Linux AppImage test, reaction-tooltip bug, styling leftovers, circle-or-square avatar TODO, unverified-in-app items in questions.md.
