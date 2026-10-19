# Current State

## Project
echo (gomuks fork; repository `taylorbird/echo` on GitHub, bundle ID `dev.tbird.echo`)

## Objective
Fork gomuks and redo the frontend to make it more visually appealing, wrapped as a native macOS app plus an iOS companion app (forked Element X scaffold; design language as cross-platform contract, not shared code; Android out of scope). Linux desktop (Tauri AppImage + deb) is a build target, in progress.

## Current Focus
- 0.7.3 is the shipped release (2026-10-07 ~12:00 PDT: read-receipt fix, YouTube follow-ups, widget permission prompt, light-mode badge ink; notarized, feed verified serving 0.7.3). 0.7.2 (2026-10-06) shipped before it.
- Reaction-tooltip bug reported 2026-10-08 (hovering a reaction pill blinks the "who reacted" tooltip away; room list creeps 1px per hover, possibly worse with custom emoji). Parked by user, not reproducible in dev. Details in questions.md.
- Linux arm64 AppImage built in OrbStack, never launched on a desktop yet.

## Last Checkpoint
2026-10-08 13:11 PDT

## Constraints
Full ledger: .claude/work/constraints.md (★ = added 2026-10-07)
- ★ Rail DM tiles never take the glow pill; they ignore 2nd clicks of a double-click and are inert while a drawer closes (no accidental mark-read)
- ★ DM unread is a red dot (`dm_mention_colors`); the red @ badge is reserved for real mentions
- ★ YouTube embed: nothing contacts YouTube until the card nears the screen; one player at a time; iframe sandboxed
- ★ Widget permission prompt: no autofocus on Allow (Enter must not grant everything)
- ★ Linux: Linux-only config in tauri.linux.conf.json and `html[data-platform="linux"]` CSS; macOS chrome untouched; build via scripts/linux-build.sh in OrbStack; secrets on stdin, never orb argv
- ★ After any cleanup touching ~/Library/Caches: restart the app (backend cache dir), then `go clean -cache` before releasing
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

## Next Actions (Priority Order)
1. Install target/linux/arm64/echo_0.7.2_aarch64.AppImage in the Parallels Arch VM (GNOME or COSMIC). Rebuild first for 0.7.3 via scripts/linux-build.sh. Fix what breaks.
2. Reaction tooltip blink + 1px room-list creep (release 0.7.3 only so far): get answers to the open questions in questions.md; if it persists, instrument a local release build (logger parked in .claude/work/mockups/debug-scroll.ts).
3. Linux polish: rename the `app` executable, strip the sidecar (~89MB), x86_64 build (ARCH=amd64), wire into release.sh + latest.json.
4. Confirm in 0.7.3: YouTube playback in WKWebView, read receipts on scroll-to-bottom, new widget prompt. Decide on the self-healing backend cache dir (offered, unanswered).
5. Styling pass leftovers (VerificationScreen, MessageSearch options, EventReactions modal, push rule editor, "(N more)", window.alert in menus); favicon to penguin.
6. TODO (not built, requested 2026-10-16): circle-or-square avatar shape option. Doesn't exist yet. User expected it in the picture upload flow; scope undecided (app-wide setting vs profile card only vs per-person override). Avatars are circled by CSS, so the shape itself is mostly a styling switch.
7. Mobile spike on branch `mobile-ffi` (agreed 2026-10-19): gomuks FFI built for the iOS simulator, linked into a bare Tauri iOS app, room list shown through it. Then test an iOS NSE calling GomuksHandlePush within the memory limit. See learnings/portability.md "The FFI path". This may replace the Element X fork plan.
