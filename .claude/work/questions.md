# Open Questions

<!-- Things uncertain, need revisiting, or blocked on -->

## New this session (2026-10-08)

- **Reaction tooltip blinks away and room list creeps 1px (release 0.7.3, parked by user "ignore for now")** — hovering a reaction pill makes the "who reacted" tooltip blink and disappear; the user thinks it is specific to custom emoji. Each occurrence scrolls the room list down about 1px, so repeated hovering slowly scrolls it. Verified: EventReactions (web/src/ui/timeline/TimelineEvent.tsx ~111-120) portals the tooltip to body and hides it on any capture-phase window scroll; in dev, 10 hovers logged zero scroll events, focus changes or programmatic scroll calls; the release CSS rule for body>div.reaction-tooltip matches dev. Inferred: the 1px scroll fires that listener; the cause of the scroll is unknown. Unanswered: (1) was the same room and reaction hovered in dev as in the release app? (2) does the release app still do it right after a fresh launch? Next step if it persists: instrument a local release build to catch the scroll there. Instrumentation reference copies are parked in .claude/work/mockups/debug-scroll.ts and .claude/work/mockups/vite-debug-sink.ts (not in the source tree).

## New this session (2026-10-07)

- **Self-healing backend cache dir** — offered: make the backend recreate its cache dir on demand (pkg/gomuks/mediadownload.go). Today it is created only at startup (gomuks.go:177), so a cache cleanup breaks every image until the app restarts (happened 2026-10-05 and 2026-10-06). User has not answered.
- **Read-receipt fix not hand-reproduced** — the 0.7.3 change is inferred from code (see Resolved). Confirm in practice: a room should clear after scrolling to the bottom.
- **YouTube playback inside WKWebView unconfirmed** — shipped in 0.7.2 and 0.7.3; the user has not confirmed playback in the installed app.
- **Rail DMs show all unread DMs regardless of space** — per-space filtering (by the member rule used for space DMs) was offered as an alternative; not chosen.
- **Linux AppImage never launched** — next step is the user installing target/linux/arm64/echo_0.7.2_aarch64.AppImage in the Parallels Arch VM (GNOME or COSMIC). Open items: title bar handling for tiling WMs (Hyprland, COSMIC); rename the `app` executable (the .deb installs /usr/bin/app); strip the ~89MB sidecar; wire Linux into release.sh and latest.json (keys linux-x86_64, linux-aarch64). No Linux updater entry exists yet, so the update check fails quietly (updater.ts catch).
- **x86_64 Linux build untested** — ARCH=amd64 uses machine echo-builder-amd64. The user plans to test x86_64 on tester "wreck"'s machine.
- **Linux display-server behaviour unverified** — general knowledge only, not tested here: GTK3 draws its own title bar on Wayland; NVIDIA + Wayland blank window workaround is WEBKIT_DISABLE_DMABUF_RENDERER=1; YouTube playback needs gst-plugins-good and gst-libav (declared in the .deb depends).

## New this session (2026-09-25)

- **Profile editor, space DMs, download prompt, multi-attachments untested in 0.7.1 production build** — all features shipped in 0.7.1 but have not been verified by user in the installed app. Tester (wreck) to try and give feedback.
- **Should the composer keyboard formatting shortcuts come back?** — Cmd+B (bold), Cmd+I (italic), Shift+Cmd+X (strike), Cmd+E (code), Shift+Cmd+K (link) were built in the format bar, then removed at user request. Open question: should they be re-added in a future release?
- **Per-space "Show people in spaces" toggle** — Element has this setting; echo does not implement it. Add if users request it. Space DMs are now shown by member rule (0.7.1); the toggle would be a refinement.
- **HEAD request for lightbox-opened images without size info** — when an image is opened in the lightbox with no cached dimensions, a HEAD request is sent to the backend to fetch media metadata. This may cause the backend to fetch the full media file (unverified). Potential optimization: cache size info locally or avoid the HEAD request.
- **Vite HMR silent miss in Tauri webview** — reported once ("I don't see it" on dev app changes). Vite hot-module-reload can silently miss updates in the webview; workaround: `touch web/index.html` forces a full reload. Root cause unknown; low impact for now.

## New this session (2026-09-24)

- **Styling pass planned for the next release** (user, 2026-09-24: "come back to it probably the next release, don't forget"). Upstream 0.7.0 sync now complete; next release will include styling/polish for screens still in upstream's plain look. Priority list: (1) the reaction hover tooltip (web/src/ui/timeline/TimelineEvent.css `div.reaction-tooltip`), (2) the encryption verification screen (web/src/ui/login/VerificationScreen.tsx; still titled "gomuks web"), (3) the full reactions list modal (web/src/ui/modal/EventReactions.tsx), (4) the message search panel's options area (checkboxes, date inputs; web/src/ui/rightpanel/MessageSearch.tsx), (5) the devtools push rule editor, (6) the "(N more)" button in user info mutual rooms. Also: `window.alert` is still used for errors across the menus (RoomMenu, usePrimaryItems, useSecondaryItems); only "Request key" moved to the echo-styled ResultModal (0.7.0). Menu alerts remain for the next styling pass.
- **Compact room list** (upstream v26.09 option under Appearance) — RESOLVED: kept in echo (user will or won't use it; leave it available).
- **OAuth device sign-in unverified in production** — new open question. 0.7.0 switched to OAuth device code via MAS (upstream removed legacy SSO). User said the device flow screen "seems to work"; untested by user live on installed app. Sign-in test script exists (sign out, @you:mssj.me, "Continue in browser" opens system browser, consent page names echo, approve within 5s, relaunch persists session; Settings > Account > Log out revokes). Pending user retest on 0.7.0 download.
- **OAuth client name shows as "mautrix hiclient"** — new minor cosmetic issue. The device consent page's client name should be "echo" but shows the upstream default "mautrix hiclient" on mssj.me. The client_uri (github.com/taylorbird/echo) works only if the repo is public. Low priority.
- **Existing sign-in across 0.6.2 to 0.7.0 update untested** — new open question. Upstream only removed the login METHOD, so existing sessions should persist; unverified by user.

## New this session (2026-09-21)

- **Web favicon should point at the penguin** (`web/index.html:5` still `<link rel="icon" href="gomuks.png" />`). The Dock icon is the echo penguin; the browser favicon is the upstream gomuks gopher. Small fix, non-blocking, deferred — note the penguin currently lives at `web/src/icons/echo-penguin.png` (a Vite import), so the favicon needs a copy under `web/public/` (or a Vite-resolved `href`), not just an href swap.
- **Should first sync's SyncBox also become a box for consistency** with the disconnected screen, or stay bare (current reasoning: during first sync the skeleton behind is live and worth watching)? User has not weighed in; deferred.
- Light-mode `--tertiary-text-color` is now #9a9a9a (2.8:1 on white) — accept hierarchy over contrast, or change to #767676 (higher ratio)?
- Nobody has seen most of the new loading states in the app (many last <1s or need specific triggers); user verified the reachable ones ("looks fine for me, I can't see them all"). Real testing pending in production WKWebView.

## New this session (2026-09-20)
- **The verification screen renders on the new signed-out surface but its internals were not restyled.** It will be the one screen in the sequence still wearing old styling. Defer pending user feedback.
- **Sign-in → MainScreen is a hard scene change** with no shared element, inherent to dropping the app shell. No transition specced. Defer.
- **Should the backend token be re-minted on auth failure**, or should the expired screen remain the answer? Currently the screen is the answer. Deferred pending user input.
- **The four published artifacts still render the old `#3f86d8` information blue** and are one generation behind the code. A re-render was deliberately deferred until the new blue is judged in the running app. (Published: A, B, The sync box, Signing in to echo.)

## Tester feedback 2026-09-18 (from "wreck", on 0.5.1 or earlier)

**Verified real bugs in our code:**
- **Rail profile avatar can never load.** `web/src/ui/roomlist/RoomList.tsx` line ~623 calls `getAvatarThumbnailURL(client.userID)` with no `content` parameter. The function signature is `getAvatarThumbnailURL(userID, content?: UserProfile | null, ...)`, so `avatar_url` is never available and silently falls through to the generated letter tile every time (not intermittent — structurally impossible to work). Fix: fetch the profile once via `client.rpc.getProfile(client.userID)` (pattern already used at `web/src/ui/rightpanel/UserInfo.tsx` ~51) and pass as `content`. Small change.

**Verified structural design problem:**
- **DM sub-filter permanently empty inside real spaces.** Tester: "people is always empty everywhere except home and triangle; i have to explicitly add DMs to a space, which is not possible if i don't control the space." Root cause verified in source: space membership comes from `m.space.child` edges (`SpaceEdgeStore.include()` → `#flattenedRooms.has(room.room_id)`). DMs are essentially never added as space children. Therefore inside any real space, the "Direct messages" sub-filter is structurally empty AND "Rooms" is identical to "All chats" — two of three sub-filters do nothing. Adding Recent on 2026-09-17 made this worse: four sub-filters where two are dead weight. Options Claude presented:
  - **A. Hide sub-filters that would be empty** in this space. Small. Rail contents vary per space. Claude recommends this now.
  - **B. Redefine the DM sub-filter as "DMs with people who are members of a room in this space"** — what the tester expected. Largest effort, needs per-space member data and a cache, but makes the control worth having. Claude recommends later.
  - **C. Show sub-filters only on Home/orphans**; real spaces just list their rooms. Small, but loses Recent inside spaces where it does work.
  - **D. Empty-state copy** ("No direct messages in this space — DMs live in Home"). Trivial but leaves a dead control. Claude not recommending alone.

**Likely already fixed by unreleased work — retest before spending:**
- "Clicking an image cuts off the image tools under the window title bar in the top right corner." He was on a build where `div.app-titlebar` was a fixed band at `z-index: 4`. That band was deleted in f9795a08. Lightbox controls sit at `top: calc(.5rem + var(--window-top-margin)); right: .5rem` in `web/src/ui/modal/Lightbox.css`.

**Contaminated feedback — discount until re-tested:**
- "CSS seems a bit off of alignment." Tester discovered the cause himself: he had account-wide custom CSS from another gomuks install applied globally; after moving it, "some things look slightly different." Any visual complaint from before that message is suspect. Ask for a fresh screenshot on a clean profile.

**Upstream gomuks limitations, not our bugs:**
- Slow first sync (no sliding sync v2). Tester's own suggested fix: add wording like "this may take a while if you have a lot of conversations" to the "Waiting for first sync" screen.
- SSO passkey / hardware keys never prompted — WebAuthn inside the embedded webview. Connects to the existing open question about the SSO consent screen showing a raw localhost redirect URL; both likely need native OIDC (MSC2965/2966), which is upstream-sized. Marked as open question 2026-08-28.
- No "verify this session from another device where you're already logged in" — cross-signing verification UX gap; he was forced to use his recovery key. His note: "normies will likely be confused."

**Needs reproduction before costing:**
- Spaces did not appear until he reloaded the app ("ohhhhh i had to reload and now i see all my spaces"). Possible first-sync race. **This is the most concerning unknown of the set** — it smells like a real bug and is worth investigating first.
- Opening a room with links: URL preview placeholders load and the scroll position does not hold, forcing a scroll back down. Scroll-anchoring; possible fixes are reserving preview height or `overflow-anchor`.
- Multi-line text does not expand the composer properly. There IS auto-grow logic (`rows={textRows.current}` in MessageComposer.tsx), so this is a regression candidate.
- Discoverability: he could not tell the difference between the "home" tile and the "triangle" (orphans) tile in the rail, and guessed "rooms that aren't part of a space" unaided. Tooltips or labels would settle it.

**Design questions raised by Claude on seeing the screenshot (2026-09-18):**
- The "Rooms" section header is lavender (`color-mix(in oklab, #bd93f9 45%, var(--text-color))`), a holdover from when room names were also coloured. With every name now white, that header and the kind glyphs are the only purple left, and the header reads louder than the room names it labels. Options: neutralise the header (inherit ink), keep accent. Undecided.
- Sender names in room-list preview lines are still per-user coloured via `getSenderColor` (a different system from the removed per-room `--room-accent`, so untouched by design). They are now the most colourful thing in the room list. Undecided whether to quiet them.

## New this session (2026-09-17)

- Should the room-kind glyph keep the `room_list_color` accent now that room names are white and the glyph is the only coloured element in the list? The user flagged that purple as "sticking out" on 2026-09-04; now that it is the sole accent, the question resurfaces.
- Should the notification/marked-unread middle tier collapse into the plain blue dot, or keep its count? Currently keeps the count (Claude's judgment call, unconfirmed).
- Halloy uses a monospace (Iosevka Term) for its entire UI. A monospaced room list was raised as a genuinely different direction and not mocked up. Revisit?

## New this session (2026-09-13)

- Should collapsed thread messages get their thread-accent spine back? (Lost as knock-on when reply-quote spine became static neutral; both share the border property. Not yet asked by user; marking as open question.)
- Quote text inside reply blocks renders warm peach (`--semisecondary-text-color: #ffb59a` on dark) on cool chat pane because room-view scope doesn't override it — pre-existing, surfaced by mock-ups; one-token fix if wanted.
- pnpm migration decision: user's global CLAUDE.md mandates pnpm for JS/TS, this repo uses npm (package-lock, scripts/release.sh). Now has concrete cost (2026-09-13 incident): implementer ran `pnpm exec tsc` in web/, triggered full install, generated pnpm-lock.yaml, broke later commands, eslint errors appeared. Global rule actively conflicts with this repo; migrate or exempt?

## New this session (2026-09-04)

- Purple kind glyph beside ink room names "sticks out" (user, 2026-09-04); options: glyph inherits ink at .65, or keep accent. Deferred by user ("we might come back").
- User's "home view" request (2026-09-03: "when I hit the home view I'd like the same view I have on spaces… rooms and DMs, maybe an unread section on each") could not be parsed; asked what differs today between Home and a space view; unanswered.
- Should failed timeline images retry on click or when back online? `useMediaContent.tsx` sets `errored` flag and never retries until remount.
- Member list (right panel) and mention pills still use per-user `getUserColor`, so they disagree with room-aware timeline colours; thread room through?
- Uniform-off path still applies 38% accent mix to resting names (dim look) while uniform-on rows are undimmed; harmonise?
- Light mode: preview line now #b9b3ae only in dark; in light it is inherited text colour at .9 (more prominent than before). Uniform overrides are dark-only.
- Hover-menu React button still sends duplicate reaction (400 → alert) when picking key you already reacted with; route through toggle?
- Timeline timestamps fail AA (2.8:1) because of .5 opacity on --secondary-text-color; fix when touching that area.
- Palette: no true blue (53° sky→grape), green (77° lime→mint), magenta (71°); larger palette would ease >10-sender rooms; count change touches six coupling points.

## Earlier questions

- Should release builds enable tauri_plugin_log and/or devtools for release-only bug diagnosis? (Currently logging and devtools only initialise under cfg!(debug_assertions). Three bugs today were diagnosed blind and required user testing.)
- Should the app ever ship an Intel/universal build, or stay Apple Silicon only? Related: Linux/Windows port assessed 2026-09-01 (see constraints.md); moderate plumbing, no decision taken.
- Should the backend password be stored in the Keychain so browser access to the gomuks web UI is possible, or is discarding it correct? (Currently a random password is generated and discarded immediately — the app authenticates via a session token minted in the webview init script, not HTTP Basic Auth.)
- Should the webview preview tier ever auto-run for recent messages, or stay click-only? (Currently click-only for security — prevents auto-execution of arbitrary posted URLs' JS.)
- Should we create a proper theming system for user-configurable colors?
- Should same-origin media/download links (target="_blank") be made to work inside Tauri? Currently they do nothing; sending them to the system browser would fail auth.
- Should the Rooms/DMs grouping keep Rooms above Direct messages, and is per-group recency ordering (vs the old single global recency list) the desired behaviour?
- Should there be a room-less settings variant so Cmd+, works with no active room?
- Design-language document: where does it live (repo docs/ vs .claude/), and does it also govern the desktop going forward (i.e. becomes the source of truth the CSS tokens derive from)? Raised 2026-09-01.
- Should per-room custom_css come back? Currently removed from preferences (one-line revert if needed).
- Is code_block_line_wrap safe as global-only? (user hasn't objected, most debatable of the 15 scope moves)
- custom_notification_sound has no editor UI anywhere — should we build one? (pre-existing gap, not new)

- SSO consent screen — RESOLVED (2026-09-24): SSO itself was replaced with OAuth device code flow (upstream removed legacy SSO in v26.09). The new flow works (device code screen, open-in-browser, approve consent on homeserver's MAS, session persists). Upstream's default client_name "mautrix hiclient" shows on mssj.me instead of "echo" (minor cosmetic; depends on homeserver MAS metadata). The prior question about the raw redirect URL is now moot.

- Add real theming support so Ferra and Tempered are both selectable, rather than one being hardcoded. Decided 2026-08-28: the palette was pushed toward Tempered (warm channel `254, 205, 178` → `240, 226, 216`, room-list ground cooled), but the user likes BOTH and wants to come back and make it a choice. Groundwork is already in place — every warm tint in the dark theme now derives from the single `--warm-tint-rgb` token in `web/src/index.css`, so a theme is close to "swap that triplet plus two ground colours". Open sub-questions: does this become a user-facing preference (and where does it persist — the gomuks prefs system, or localStorage like the per-user colour overrides?), does it extend to light mode, and does it subsume the older "proper theming system for user-configurable colors" question below.

- Add a Help menu with "About echo" and "Release notes" entries. Requested 2026-08-30 for a future patch. Groundwork: the release-notes modal already exists and already handles the not-updating case (`modals.releaseNotes(version, notes, canRestart: false)` — ReleaseNotes.tsx), and the version is already resolvable via `useAppVersion()`. What is missing:
  - **No native menu at all.** `web/src-tauri/src/lib.rs` builds none and Cargo.toml has no `menu` feature, so macOS is showing Tauri's default. Needs a real `tauri::menu` Menu built in lib.rs, then an event emitted to the webview on click (an emit avoids the ACL dance a new `#[tauri::command]` would need in both build.rs and capabilities/default.json).
  - **No source for the running version's notes.** The app only ever holds notes for a *pending* update (from the feed) or the one-shot stash, which `claimReleaseNotes` deletes as it reads. Showing them on demand needs one of: bundling `release-notes/<version>.md` into the app at build time (offline, exact, and the archive already exists as of 0.4.0); fetching the GitHub release body on click (network-dependent); or keeping the claimed stash instead of clearing it (simplest, but only ever has the last updated-into version, so a fresh DMG install would have nothing).
  - Bundling the archived notes is the recommended option — it is the only one that is correct for a fresh install and needs no network.

## Blockers / Limitations
- Claude cannot see the app visually in this environment: `screencapture` fails ("could not create image from display" — terminal lacks macOS Screen Recording permission), the chrome-devtools MCP cannot attach (no Chrome running with a debug port), and `osascript`/System Events reports 0 windows for the transparent Tauri window (an Accessibility quirk, not a render failure). Granting the terminal Screen Recording permission would unblock visual self-review. Release-only bugs are particularly hard to diagnose because production builds have NO LOGGING (tauri_plugin_log only initialises under cfg!(debug_assertions)) and no devtools. Three bugs today (restart button, external links, fetch_og_tags) were diagnosed only by user testing, and the root cause (tauri ACL remote-origin denial) was invisible without source-code archaeology. **Recommendation:** enable logging in release builds and consider devtools for faster diagnosis in the future.

- Read receipts not sending: moved to Resolved (2026-10-07).

### DB cleanup offer: 37 stale membership unread_type rows
Root cause fixed in 0.4.2 (membership events no longer drive unread counts), but the 37 existing membership events that were flagged with unread_type=2 remain in the database. User can manually zero them when desired (requires app quit, one-off cleanup query, restart). Cleanup offer documented but not yet offered — awaits explicit user go-ahead.

## Resolved

- **Read receipts not sending (known issue since 0.4.1)** — RESOLVED in 0.7.3 (2026-10-07). Fix inferred, not hand-reproduced. Root cause (inferred from code): `scrolledToBottom` was a plain field, so scrolling down to read never re-ran the receipt effect. Fix: TimelineView.tsx `bottomArrivals` state is bumped when the scroll handler sees not-at-bottom -> at-bottom, and is in the receipt effect deps. The old focus-event theory is weakened (backend log showed mark_read working 2026-10-06). The known-issue entry was removed from the release notes. Confirm in practice (see New this session 2026-10-07).
- **Where does the sync box go when a room is selected?** — RESOLVED (2026-09-21): for the connection-loss case, answered by DisconnectedScreen (box over opaque skeleton, window-centred, with penguin lockup). SyncBox (first sync) itself remains bare and pane-scoped — deliberately different per its comment, since the skeleton behind is live during first sync and worth watching.
- **Rail profile avatar bug** — RESOLVED (2026-09-20): `getAvatarThumbnailURL(client.userID)` was called with no profile content, so `avatar_url` was never available and it could only ever draw a generated letter tile. Fixed by fetching profile once via `client.rpc.getProfile(client.userID)` and passing as the second argument.
- **Stale `room_list_color` preference description** — RESOLVED (2026-09-20): preferences.ts ~136 referenced the deleted `uniform_room_list_color` preference. Updated to: "The sidebar accent: the color of the room kind glyphs in the room list."
- **`toReversed()` macOS floor** — RESOLVED (2026-09-20): `roomList.toReversed()` was replaced with `[...roomList].reverse()`, removing the macOS 13.3+ floor.
- **Redundant Recent section header** — RESOLVED (2026-09-20): The Recent section's collapsible header was removed. Sections now carry a `headerless` boolean; Recent sets true. `isCollapsed` is forced false for headerless sections.
- **Is "Restart echo" actionable from the frontend?** — RESOLVED (2026-09-20): YES. `restart_for_update` is fully wired (registered in invoke_handler, declared in build.rs AppManifest, granted in capabilities/default.json). A new `restartApp()` helper exposes it without the PROD gate.
- **Can the backend report first-sync progress as a fraction?** — RESOLVED (2026-09-20): NO. `SyncStatus` has no progress-fraction field, only `{type, error?, error_count, last_sync?}`. Any sync-progress UI must be indeterminate or count-only unless the Go side is extended.
- **WebAuthLogin invisible Login button / `matrix-login` missing background** — RESOLVED (2026-09-20): Both fixed by the redesign. WebAuthLogin.css set `background: var(--primary-color); color: white` where primary is near-white, ~1.1:1 contrast. MainScreen matrix-login had no background-color. New WebAuthLogin rewrite eliminated both issues by using the signed-out surface styling.

- Which room-list sort option (A–F, or combination)? — RESOLVED (2026-09-17): option E (per-section sort + mode tag) was implemented, then DELETED the same day. The user rejected cycle-on-click as undiscoverable, and the follow-up "Grouped/Recent switch + filter chips" design (the One Chip Row artifact) was never built either. What actually shipped: Recent is a fourth sub-filter in the space rail — it narrows nothing, drops all sections, shows everything newest-first, and has no Unread section. There is no sort control anywhere in the room list, and no filter chips.
- Should the Rooms/DMs grouping keep Rooms above Direct messages, and is per-group recency ordering (vs the old single global recency list) the desired behaviour? — RESOLVED (2026-09-17): superseded by the Grouped/Recent view switch decision. When in Grouped view, rooms and DMs are separate collapsible sections (order TBD by user preference); when in Recent view, all rooms are one flat list sorted by recency, category-agnostic.
- When to start matrix-rust-sdk integration for mobile support? — RESOLVED (2026-09-01): mobile will be an owned fork of Element X iOS, which brings matrix-rust-sdk with it; no rust-sdk integration into the Tauri app is planned.
- Unread contrast / design (shipped 0.4.0-0.4.1, 2026-08-30): all tiers now red (mention-tier pulses on preference). Earlier gradient (unread=amber, mention=red) rejected in favor of red-only consistency.
- Membership events driving unread counts (shipped 0.4.2, 2026-08-31): fixed in pkg/hicli/pushrules.go by gating evaluatePushRules Notify/Highlight/Sound on m.room.member unless isInviteForMe. User's old-Synapse default had membership events with notify action, lighting 37 events. Events still render in timeline.
- Production build workflow: signing, notarization, distribution? — Substantially answered for App Store purposes: the user explicitly waived App Store distribution ("basically a private app for me"), and `macOSPrivateApi: true` is now in use, which would block App Store acceptance anyway. The signing/notarization mechanics themselves (outside the App Store) remain unaddressed and could be reopened as a separate question if needed.
- Do external links now actually open in the system browser? — RESOLVED (2026-08-27): root cause was tauri-plugin-shell's unconditional injected body listener stealing the click in the bubble phase. Fixed by installing a capture-phase listener with stopPropagation so the shell listener never sees the event. Earlier "resolution" (2026-08-25) incorrectly blamed ACL remote-origin denial as the root cause — that was ALSO broken, but external links failed for a different reason. Both issues have been fixed.
- Do external links + clipboard actually work after Tauri 2.11 alignment and WKWebView fallback? — RESOLVED (2026-08-27): root cause found and fixed (shell plugin competing listener); verified working in all 8 releases (0.2.0–0.3.7) including user testing.
- fetch_og_tags (URL-preview webview tier) dead in prod? — RESOLVED (2026-08-27): root cause was tauri ACL remote-origin denial (the production window loads http://localhost:29325, which tauri treats as remote, and remote origins have all app commands denied unless a capability names them). Fixed by declaring the command in build.rs (generating allow-fetch-og-tags) and granting it in capabilities/default.json under remote.urls. Verified working in releases.
- Should the remote capability be split from the default capability so it loses shell:spawn/kill permissions? — RESOLVED (2026-08-27): the shell permissions were removed entirely (nothing used them, sidecar is spawned from Rust not IPC). Remote capability surface is now minimal (opener, updater, window management). Note: shell plugin is mandatory for sidecar spawning, but shell IPC permissions are not.
- Is drag-drop image upload working correctly? — RESOLVED: root cause was `dragDropEnabled` defaulting to `true` in `tauri.conf.json`, which let Tauri's native handler consume the drop before the webview saw it. Fixed by setting `"dragDropEnabled": false`. User confirmed drag-and-drop from CleanShot X now works.
- What exactly does "contrast on the reading screen" mean? — RESOLVED: it became a full palette and text-hierarchy overhaul across the whole session (room list vs. chat pane tinting, palette reversals, chat text hierarchy rework). The chat pane ended up cool near-black (`#16181f`), now the darkest surface in the app rather than the lightest.
- Should the right panel adopt the cool dark palette to fix sender-colour contrast for member names? — RESOLVED: new `getUserColor` returns high-luminance pastels (capped at L 80%), improving readability on warm background. Right-panel names now have solid contrast; no cool-palette flip needed.
- Should `--room-header-background` get its own cool value rather than borrowing the room-list token? — RESOLVED: it's intentionally shared. Header sits above the chat pane (cool near-black) but the token retrieves the room-list warm background, and it reads correctly. No change needed.
- Does the room-list-wrapper's outer raise shadow escape `contain: strict`? — RESOLVED (indirectly): removed `content-visibility: auto` / `contain: strict` entirely from room-list entries due to WebKit paint-deferral issues. Question moot.
- Should the pre-existing 11 eslint errors in untouched files (`WebAuthLogin.tsx`, `MessageComposer.tsx`, `useSecondaryItems.tsx`, `TimelineEvent.tsx`) be cleaned up? — RESOLVED: all pre-existing errors remain; the project is now at zero tsc/eslint on all touched code (a new baseline 2026-08-21). Pre-existing errors in untouched files are not attributable to this work and can be addressed separately.
- Startup auth retry on ECONNREFUSED (shell rebuild race)? — RESOLVED (2026-08-25 as side effect): TCP readiness wait in lib.rs (500ms connect timeout, 100ms interval, 15s deadline) prevents the old race where the webview's first auth request beat the sidecar to port 29325. Deterministic start order now guaranteed.

- **DM sub-filter permanently empty inside real spaces (options A–D)** — RESOLVED (2026-09-25): Implemented option B, matching Element's rule. Spaces now include DMs if the `dm_user_id` is a member of the space (joined or invited) or any descendant subspace (member-transitive). `SpaceEdgeStore` gained `#members`, `#flattenedMembers`, `setMembers()`, `includeByEdges()`. Space badges recount on member change. "Outside spaces" orphans use `includeByEdges` so DMs stay visible there. Shipped in 0.7.1. Child rooms still come from `m.space.child` edges; DMs are added by the member rule on top.

- **Tester's global profile / greyed avatar complaint** — RESOLVED (2026-09-25): The avatar was greyed out because the rail button was `disabled={!activeRoomID}`: it opened the user side panel, which only exists with a room open (the older missing-`content` avatar bug is a separate item, fixed 2026-09-20). The tester's request for a profile editor was addressed by adding ProfileEditor.tsx in 0.7.1 (modal form for display name, picture, bio; sidebar avatar button entry point that opens it without needing a room).

- **Reaction hover tooltip styling and clipping** — RESOLVED (2026-09-25): Reaction tooltip was being clipped by `div.event-content` (overflow:hidden + contain). Fixed by portalling the tooltip to document.body with position:fixed, and restyling it as part of the pop-up visual pattern update (no longer needs containment workaround).

## Cotypist (text prediction) does not work in echo — revisit

Raised 2026-09-17. Cotypist's word prediction never engages in the echo window.

**Verified this session:**
- Cotypist is installed and running, and holds Accessibility permission
  (`app.cotypist.Cotypist|2` in `/Library/Application Support/com.apple.TCC/TCC.db`,
  service `kTCCServiceAccessibility`). The grant is not the problem.
- echo's process exposes only an `AXMenuBar` and **0 windows** to the Accessibility
  API (`osascript -e 'tell application "System Events" to tell process "app" to
  get count of windows'`).
- `yaak-app-client`, an unrelated Tauri app, returns the **identical** signature —
  0 windows, `AXMenuBar` only.
- Ghostty (native, AX-permitted) returns 1 window, so the query method is sound
  and the terminal is permitted. Note Finder returns 0 too, but only because it
  had no windows open — that reading briefly looked like a method failure.
- The composer is a real `<textarea id="message-composer">`
  (MessageComposer.tsx:1070), not a contenteditable, so the control type is the
  best case for assistive tools and is not the blocker.

**Inferred:** Cotypist has no text field to attach to because the window and its
contents are absent from the AX tree. Because yaak behaves identically, this is a
Tauri/WRY-wide behaviour, NOT a consequence of echo's `transparent: true` or
`macOSPrivateApi: true`.

**Unknown:** the mechanism in WRY that leaves the NSWindow out of the AX tree, and
whether host-app code can change it. Public reports cover WKWebView AX problems
generally (tauri-apps/wry#1848; Apple developer forums thread 809541) but none
give a host-app fix.

**Next step:** open Accessibility Inspector (ships with Xcode), point it at the
echo window with the composer focused, and see whether the textarea appears. If it
does, the problem is Cotypist-specific and worth raising with them. If the window
is empty there too, it is upstream in WRY and not fixable in our code.
