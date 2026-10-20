# gomuks Frontend Internals

## Key Facts
- `RoomListEntry.dm_user_id` is the canonical signal for "this room is a DM." It's the same field `DirectChatSpace.include()` uses in `web/src/api/statestore/space.ts:80`, so any UI grouping keyed on it will always agree with the app's built-in DM pseudo-space.
- `roomList` (in the room-list state) is stored oldest-first. `reverseMap` (`web/src/util/reversemap.ts`) is the existing helper used to render it newest-first.
- Filtered-out rooms are NOT unmounted from the DOM — they get a `hidden` class, which is `display: none !important` (defined in `web/src/index.css`). Counting/finding "visible" rooms therefore requires applying `client.store.roomListFilterFunc` yourself rather than checking DOM visibility.
- `MainScreen.tsx:197` locates room entries with a GLOBAL selector, `document.querySelector('div.room-entry[data-room-id=...]')`, not a scoped child selector — so restructuring the room list DOM (e.g. wrapping entries in section containers) is safe and won't break scroll-into-view behavior.
- Icons in `web/src/icons/` are Material Symbols, filled style: `viewBox="0 -960 960 960"`, `fill="#5f6368"`, which the project's svgr config (in `vite.config.ts`) rewrites to `currentColor`. A newer outlined Lucide-style set (24px grid, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `fill="none"`) lives alongside it in `web/src/icons/modern/`, currently used only by the sidebar and space rail.
- `--window-top-margin` (defined in `index.css` as `env(safe-area-inset-top, 0px)`) is plumbed through the room list grid, the search wrapper, the room-view grid, and the room header — it's the single lever for adjusting top inset across the app.
- Modals are `z-index: 100` (`web/src/index.css`) — anything meant to sit above the app chrome but below modals should stay under that value.
- Reaction sender identities are NOT sent to the frontend at all — the Go backend aggregates `m.reaction` events down to bare `Record<string, number>` counts and discards the underlying senders (`FillReactionCounts` in `pkg/hicli/database/event.go:225` throws away `GetReactionsResult.Events`). To get sender names client-side without a backend/sidecar change, use the existing `get_related_events` RPC with relation type `m.annotation` — the same call `EventEditHistory.tsx` already makes for `m.replace` relations.
- The settings preference matrix is driven by declaration order in `web/src/preferences.ts` and rendered by `SettingsView.tsx` — adding a new preference there is enough for it to appear in the matrix; no separate registration step in the view component is needed.
- `--room-header-height` is a single token shared by the room header, the room-list search row, and the right-panel header, so changing it keeps all three panes' top edges aligned. It was previously hardcoded as `3.5rem` independently in three separate files, which is a real drift risk if only one file is edited.

## Timeline Sender Colors and Custom Overrides
- Sender names use `sender-color-N` CSS classes generated via `getUserColorIndex()` (deterministic hash of user ID modulo palette size). These apply a pre-defined color palette (saturated candy colors: reds, oranges, greens, purples, blues, etc.).
- Custom user colors (user-set via right-click color picker) and cheat overrides (e.g., `raam-green` cheat) **do not** apply as classes — they apply as inline styles via `style={{ color: getUserColorOverride(userID) }}` on the `span` containing the sender name.
- Why inline styles? The timeline renders `sender-color-N` classes on the name element. A custom CSS class with a custom color would have the same specificity as the existing color class, so a later one would win (source order). Inline styles have higher specificity and reliably override class-based colors.
- This pattern is used in `TimelineEvent.tsx` (sender name) and `ReplyBody.tsx` (replied-to sender name in the reply prefix).

## useSyncExternalStore Snapshot Stability
- Snapshot getter functions passed to `useSyncExternalStore` must return a **stable reference** for empty collections. If a getter returns a fresh `[]` on every call (even when the collection is logically empty), React detects a snapshot change (new `[]` !== old `[]`) and re-renders. If the getter returns the same `[]` reference every time it's empty, there's no change to detect.
- Symptom: infinite re-render loop with "Maximum update depth exceeded" error.
- Example bug: `RoomStateStore.getMembers()` returned `this.#fillMembersCache() || []`, which creates a fresh `[]` when the cache is empty. Fix: use a module-level `const emptyMembers = []` and return that reference in all empty cases.
- This latent bug became visible in 2026-08-21 when rendering member-related hooks on freshly-opened spaces before member state was loaded.

## Content-Visibility and Paint Deferral
- `content-visibility: auto` with `contain: strict` (used for room-list virtualization) causes WebKit to defer repaints of those elements until the next browser event loop cycle.
- During rapid Alt+↑/↓ room navigation, the old room's `.active` class removal and the new room's `.active` class addition both defer, leaving two rooms visually highlighted for ~100ms until a later repaint triggers (HMR, user input, etc.).
- `useContentVisibility` React hook depends on the `contentvisibilityautostatechange` event firing on the element itself, so if you remove the CSS property, you must also remove the hook — they're coupled.
- Solution for room lists: render all entries unconditionally (trade memory for visual correctness). Room lists are typically <200 entries even in large workspaces, so the DOM size is acceptable.

## Quick Switcher (Cmd+K launcher)
- Component lives at `web/src/ui/QuickSwitcher.tsx` (.css styles)
- Opened via `modals.quickSwitcher(store, mainScreen)` from `"Super+k"` keybinding in `web/src/ui/keybindings.ts`
- 48rem panel at 11vh, 1.375rem search input with dark background
- ROOMS section: 10 recency-ranked results, ranking: prefix match (0) > substring (1) > subsequence (2) over `search_name` field, stable by recency
- ACTIONS section: pinned at bottom (Settings — only when room active, New room)
- Navigation: arrow keys span rooms→actions, Enter activates, Cmd+K/Esc closes
- Room entries use `roomList.current` (oldest-activity-first); search performed via `search_name` normalized string (`util/searchablestring.ts`)
- Modal system: `window.openModal`/`window.openNestableModal` set in `ui/modal/Modal.tsx`; overlay base styles in `ui/modal/Lightbox.css` (div.overlay); scoped CSS override for reduced frosting via `:has(> div.modal-box.quick-switcher-modal)` — blur(3px), darker overlay vs app-wide 20px/0.5

## gomuks Go Backend Details
- **CORS not available:** The Go server (cmd/gomuks) uses `exhttp.AutoAllowCORS=false` in main.go. The only CORS-adjacent logic is `origin_patterns` config, which only checks WebSocket origin (it does NOT unlock HTTP CORS). For a cross-origin frontend (tauri:// → http://localhost:29325), CORS middleware would need to be added to cmd/gomuks/main.go, which is outside the frontend's control.
- **Cookie same-site and insecure_cookies:** gomuks_auth cookie is SameSite=Lax. When `insecure_cookies` is enabled (dev mode), the Secure flag is stripped; it becomes SameSite=Lax + non-Secure, which forbids sending to HTTPS URLs. Critically, SameSite=Lax + cross-origin is impossible — the browser will never send the cookie. The only way to fix this server-side is to set SameSite=None + Secure, but that requires HTTPS. **Practical implication:** Tauri's http:// localhost origin (even with insecure_cookies enabled) cannot auth against a SameSite=Lax cookie. Same-origin is required (tauri:// to tauri:// OR http:// to http:// with matching port).
- **Frontend etag check:** gomuks backend injects a `<meta name="gomuks-frontend-etag" ...>` tag (populated from a BuildTime variable in cmd/gomuks/main.go). The frontend's `index.html` reads this and runs `checkUpdate()` to fetch bundled assets only if the etag matches. When etag is empty (plain `go build` without maubuild), the meta tag still exists (empty value), and `checkUpdate()` safely bails early — no corruption, just skips the update check. Etag is purely an optimization for hot-reload detection; missing it is benign.

## useResizeHandle localStorage Write Timing
- `useResizeHandle` hook (web/src/ui/util/ResizeHandle.tsx) persists the width to localStorage in a `useEffect` whenever the width changes. Critically, React's strict mode in development calls effects twice, and the hook runs on MOUNT to read the persisted value and set it as the initial state.
- **Gotcha:** If you change the default width constant (e.g., `const DEFAULT_WIDTH = 350` → `const DEFAULT_WIDTH = 400`), existing users will NOT see the new default. Their old value is already persisted in localStorage and will be read on mount, overriding the constant.

## SyncStatus Has No Progress Fraction (2026-09-20)

**Verified:** `web/src/api/types/hievents.ts:130` — `SyncStatus` carries `{type, error?, error_count, last_sync?}`. There is no `progress` fraction, no `completed_room_count`, no expected total. The sync type is `initial | incremental | stopped`, and that is the only progress signal available.

**Consequence:** Any frontend sync-progress UI showing a percentage must be either indeterminate (a hairline rule that does not claim measurement) or count-only (showing "5 rooms synced so far" without a completion bar). A crawling indeterminate bar beside a precise count reads as claiming a measurement nobody takes.

**To change:** The Go backend would need to emit a `RoomsSyncedSoFar` counter or similar in the SyncStatus message, then track it through the Go-to-frontend IPC. This is a backend/sidecar change, not a frontend tweak.
- **Fix:** Bump the localStorage key name (e.g., `roomListWidth` → `roomListWidth2`). This creates a "fresh" entry that falls through to the new default constant. Old persisted values are left untouched (no data loss), just orphaned.
- **Related pattern:** Any hook that reads localStorage on mount and writes to localStorage on state change can have this problem. The localStorage key is the only lever for invalidating old defaults.

## Timeline Sender Colours: Room-Aware Allocation (2026-09-04)

**Architecture:** New module `web/src/api/sendercolor.ts` exports `createSenderColorAllocator(userColorOverrides, customUserColors)` which returns `getSenderColor(roomID, userID) → string` colour value. Injected via media.ts as `getSenderColor` and called at timeline render time.

**Allocation strategy:** On first appearance of a userID in a roomID, allocator picks the palette index farthest in hue from the nearest-taken hue (greedy incremental, not maximin). Allocation is persisted in localStorage `echo.room_sender_colors` as `{roomID: {userID: index}}` and never reshuffled.

**Palette size:** ten dark colours in `index.css` (dark and light mode lists). Changing the count touches six coupling points: `media.ts` `FALLBACK_COLOR_COUNT`, `index.css` token lists, `TimelineEvent.css` `.sender-color-N` rules, `ReplyBody.css` `.sender-color-N` rules, dormant `themes/cool-graphite.css`.

**Exhaustion:** when >10 senders appear (common in loaded history), newcomer takes the least-used slot; hash breaks ties. Consequence: same person can have different colours in different rooms (accepted tradeoff over complexity).

**Side effect:** Member list and mention pills still use per-user `getUserColor` (no room context available), so they may disagree with timeline colours. Possible future refinement: thread room ID through those layers.

**Colour transport:** the colour is carried as `--sender-color` custom property inline on `div.timeline-event`, so it's available to all children (sender name span, reply spine, etc.) without re-fetching.

## Timeline Geometry and Styling: Ring + Rail + Plate (2026-09-04)

**Avatar ring:** double-stroke effect via box-shadow on avatar:
- Outer: `2px --background-color` (the app's background, creates a gap)
- Inner: `2px --sender-color` (the room-aware colour)
- Total bleed: 4px
- On hover/focus: gap repaints with hover token, keeping ring visible

**Sender rail:** new `div.timeline-event::before` pseudo-element:
- Height: 1.5px, colour: `--sender-color`, width: 100% of avatar column
- Positioned at `left: calc(--timeline-horizontal-padding + --timeline-avatar-size + 11px)` (absolute pixel offset to account for avatar size and padding)
- `top: 2px` on first row, `top: -var(--timeline-message-gap-same-sender)` on same-sender rows (continuous rail)
- `bottom: 0` except `&:not(:has(+ div.timeline-event.same-sender))::before { bottom: 4px }` (last row of a run)
- Excluded on small/hidden/membership/small-thread/edit-history/pinned/notification/confirm-modal events

**Sender name plate:** faint background on the name itself:
- `span.event-sender > span.event-sender-text { background: color-mix(in oklab, currentColor 14%, transparent); padding: .1rem .4rem; border-radius: .3rem }`
- Outer span keeps `overflow: hidden` and `text-overflow: ellipsis` with `padding: .25rem 0` so plate isn't clipped

**Timeline avatar gap:** widened from 1rem to 1.5rem to accommodate ring bleed + rail + text without squash.

## Unread Section in RoomList (2026-09-04)

**New preference:** `unread_section` (appearance, anyGlobalContext, default true) gates a collapsible drawer above Rooms/DMs sections.

**Predicate:** module-level `isUnread` function (same predicate as mark-all-read button) determines which rooms are unread.

**Pin pattern:** `unreadPin` ref ensures the active room stays in the Unread section while it's actively displayed, so it doesn't vanish under the cursor when the user scrolls. Once the user navigates away, the room follows the predicate (moves out if no longer unread).

**Collapse state:** persisted to localStorage `seabug.collapsed_room_list_sections` with safe fallback to expanded. Section ID is "unread" (part of the larger per-group collapse tracking).

**Interaction:** works in sub-filtered views because roomList is already view-filtered by the time the Unread section runs.

## Room List Name Colouring: Uniform Mode (2026-09-04)

**Token:** `--room-list-name-color` applied to `div.room-entry > span.event-sender` (the room name).

**Uniform mode ON:** ink colour `#c9c2cc` for all names, except open room gets pure white.

**Uniform mode OFF:** per-room accent mix (38% accent over text colour, defined in resting-row rule).

**Specificity fix:** the uniform override is nested INSIDE the resting rule at (0,6,5) specificity, beating the old (0,5,4) resting-rule mix. Dark-only by design.

**Entry.tsx sender-name span:** `Entry.tsx` passes `room_id` to `getPreviewText` and colours the sender name span inline via `getSenderColor(room_id, evt.sender)` (room-aware colour, not per-user).

## Reactions: No Local Echo, Redaction Recount (2026-09-04)

**Architecture:** Backend aggregates `m.reaction` events to bare `Record<string, number>` counts and discards senders (`FillReactionCounts` in `pkg/hicli/database/event.go:225` throws away `GetReactionsResult.Events`). No sender information reaches the frontend.

**No local echo:** reaction click does not update the local count immediately. Counts update only on sync echo (server echoes the send back in the room state). This gives reactions a "dead click" feel initially, but it's correct for consistency (same-device cross-session view stays consistent).

**Chip toggle:** clicking a chip you already reacted with toggles your reaction off (redact). Chip dims optimistically during send/redact, settles on sync echo or 20s timeout.

**Redaction recount path:** when a reaction message is redacted, the backend's `processRedaction` (sync.go) calls `getEventReactionsQuery` which excludes redacted events, so counts are recomputed. This is the opposite of the send path (no local recompute, just sync echo).

**Tooltip hover (prior session):** reaction-hover-tooltip was added via `get_related_events` RPC (relation type `m.annotation`, same call `EventEditHistory` makes for `m.replace`), fetched lazily on first hover, cached by `countSignature` (concatenation of `key:count` pairs to detect changes).

## Media Content: No Retry on Error (useMediaContent)

**Gotcha (2026-09-04, from diagnostic):** `useMediaContent.tsx` sets an `errored` flag when img.onError fires and never retries until remount. During the 2026-09-02 network outage (backend 502 on media downloads, 57–180s hangs followed by 502), broken images persisted even after the outage was resolved, because the hook had already errored out.

**Current behaviour:** no auto-retry on click or when back online.

**Open question:** should we implement retry-on-click or retry-on-network-restore for better UX?

## Display Font Stack: Single Point of Control (2026-09-17)

**Architecture:** `--display-font-stack` token is referenced in 11 places across 8 files: `web/src/index.css` (definition + fallback), `RoomList.css` (room names), `RoomViewHeader.css` (room header title), `SpaceView.css` (dashboard section titles, member names, room names), `TimelineEvent.css` (sender names, reply senders), `ReplyBody.css` (quoted sender name), `QuickSwitcher.css` (search panel section headers), `MessageComposer.css` (placeholder text styling if applicable). Changing the token impacts all these sites uniformly with one edit.

**Decision 2026-09-17:** Space Grotesk entirely removed; `--display-font-stack: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif` is the single typeface. The token is preserved (not inlined) so the "display" role concept survives — if a second display face is added in the future, all 11 uses update together.

## Unread Tier System: Token + :has() Specificity (2026-09-17)

**Architecture:** Unread tier distinction (message blue vs highlight red) is implemented via custom properties set by `:has()` selector rules, where specificity orders the cascade.

**CSS pattern (RoomList.css):**
```css
div.room-entry {
  --unread-bar-color: transparent;  /* default: no bar */
}
div.room-entry:has(> div.room-entry-unreads) {
  --unread-bar-color: var(--message-blue);  /* default unread: blue */
}
div.room-entry:has(> div.room-entry-unreads:has(> .notified)) {
  --unread-bar-color: var(--notified-blue);  /* notification tier: lighter blue */
}
div.room-entry:has(> div.room-entry-unreads:has(> .highlighted)) {
  --unread-bar-color: var(--highlight-red);  /* mention tier: red */
}
```

The `:has()` specificity (0,5,1) beats the element selector (0,0,1), so the most-specific `:has()` rule wins. To change the colour palette or tier definitions, update the token values or add/remove `:has()` rules — no changes to `UnreadCount.tsx` needed.

**Rendering:** `UnreadCount.tsx` applies modifier classes `.marked-unread`, `.notified`, `.highlighted` to `div.room-entry-unreads` based on the room's unread state. It renders nothing at all (no badge span) if the room is read — the presence/absence of the unreads div itself is the signal.

**Querying from CSS:** "is this room unread?" is asked via `:has(> div.room-entry-unreads)` on the entry itself.

## Room-List Section Headers: Structural Constraint (2026-09-17 15:15) — SUPERSEDED 2026-09-17 15:53

**Earlier pattern (2026-09-17 15:15):** `div.room-list-section-header` contains three control buttons: `button.section-toggle` (icon + section name, toggles collapse), optional `button.section-mode` (the sort tag / mode indicator), and `button.section-chevron-button` (repeats the toggle for pointer users, tabIndex={-1} aria-hidden).

**Rationale (2026-09-17 15:15):** buttons cannot nest inside buttons. The sort tag must be independently operable without nesting it as a child of the toggle button. Therefore the section header is a div that acts as the interactive container (band/tone/hover styling), with three distinct button children.

**Superseded:** This pattern was reverted 2026-09-17 15:53 when the per-section sort feature was deleted entirely (replaced by Recent as a rail sub-filter). Section headers are now a single `<button>` again, making the complexity unnecessary.

## Rail Sub-Filters: Membership vs Ordering (2026-09-17 15:53)

**Architecture:** `SubFilteredSpace` in `web/src/api/statestore/space.ts` wraps membership decisions. Its `include(room)` method decides whether a room passes the filter. Importantly, a sub-filter can legitimately **narrow nothing** — its purpose may be purely to signal an ordering/layout mode to the room list rather than to gate room membership.

**Example: Recent view.** `SpaceSubFilterID` now includes `"recent"`. When `activeSubFilter === "recent"`, the space's `include()` returns true for all rooms (narrows nothing). The signal is purely for layout: the `sections` useMemo in RoomList.tsx detects `activeSubFilter === "recent"` and short-circuits to a single unsectioned section of `roomList.toReversed()`. The sub-filter carries ordering semantics, not membership semantics.

**Consequence:** building a new list layout (e.g., a calendar view, a thread inbox, a starred-only view) does not require creating a new Space or a new filtering layer. If the layout is room-agnostic (all rooms, just reordered), create a sub-filter that narrows nothing; if the layout is room-selective (e.g., unread only), use the existing `SubFilteredSpace` include logic.

## The `sections` useMemo: Single Source of Room-List Shape (2026-09-17 15:53)

**Location:** `RoomList.tsx` contains a `sections` useMemo that computes and returns the entire shape of the room list: section headers, section contents, sort order, and collapsibility. This is the single place where the list's visual structure is decided.

**Consequence:** building an alternate room-list layout (e.g., a flat recent-first view) is not a parallel component alongside `RoomList.tsx`. Instead, it is a short-circuit at the TOP of the `sections` useMemo. When `activeSubFilter === "recent"`, the memo returns `[{ header: null, rooms: roomList.toReversed() }]` (single unsectioned section) instead of the normal grouped structure.

**Design pattern:** any boolean/select state that changes the room list's layout should be plumbed through the `sections` useMemo as a short-circuit, not as a separate render branch.

## TDZ Error: Declaring Variables Before useMemo Reads (2026-09-17 15:53)

**Gotcha:** If a `useMemo` reads a variable from the component body, that variable must be declared ABOVE the useMemo in the source code, or a TempZoneDeadError occurs at runtime (ReferenceError: can't access before initialization).

**Example:** `RoomList.tsx` `sections` useMemo reads `activeSubFilter` to decide on the recent-view short-circuit. The variable `activeSubFilter` was initially declared BELOW the useMemo (with other rail-space lookups). Moving the `sections` useMemo or declaring `activeSubFilter` later caused a TDZ error. **Fix:** moved `activeSubFilter` declaration to the top of the component, above the `sections` useMemo.

**Design implication:** consider the useMemo dependencies and variable declaration order up front; useMemo is not a "magic black box" that can safely read any in-scope variable without regard to declaration order.

## Avatar Thumbnail URL Fallback: Silent Degrades to Letter Tile (2026-09-18)

**Gotcha:** `getAvatarThumbnailURL(userID, content?: UserProfile | null, ...)` silently degrades to a generated letter avatar when the `content` parameter is omitted. There is no error, so a caller that forgets to pass the profile argument sees "the avatar just never loads" (looks like a network failure or server misconfiguration, but it's actually a missing client-side data fetch).

**Example:** `RoomList.tsx` line ~623 renders `<img className="avatar" src={getAvatarThumbnailURL(client.userID)} />` with no content parameter. The function returns a letter-avatar data URL (e.g., `data:image/svg+xml,...`), which renders as a colourful initial. The user's actual avatar (fetched from the homeserver) is never displayed.

**Fix pattern:** obtain the profile via `client.rpc.getProfile(userID)` (the pattern already used at `web/src/ui/rightpanel/UserInfo.tsx` ~51) and pass it as the second argument: `getAvatarThumbnailURL(userID, profile)`. The function can then extract `profile.avatar_url` and fetch the thumbnail.

## Loading Module: Two Idioms, One Animation (2026-09-21)

**Architecture:** `web/src/ui/loading/` contains placeholder shapes and wait indicators. All skeleton placeholders use `web/src/ui/loading/Loading.css` and the unified `@keyframes sk-sweep` animation (a gradient highlight travelling left→right via background-position).

**Two idioms:**
1. **Skeleton** (shape known): export SkeletonLine, SkeletonName, SkeletonCircle, SkeletonBlock, SkeletonEdge, SkeletonRow. Apply `.sk` class for animation, weight modifiers `.sk-name` (.11), `.sk-avatar` (.09), `.sk-circle` (.075), `.sk-line` (.07) for different line heights. Used whenever the final layout's shape is known but data is loading.
2. **HairlineWait** (shape unknown): component showing text over a 2px `--hairline-color` horizontal rule. Used when the shape is indeterminate — awaiting enough data before layout can be decided. No animation (the hairline is static).

**Animation:** One `@keyframes sk-sweep` defined in Loading.css with reduce-motion gate `@media (prefers-reduced-motion: reduce) { html:not([data-ignore-reduce-motion]) ... animation: none }`. Never add per-file shimmer animations; all new loading work plugs into this system.

**Removed:** react-spinners library completely (npm uninstall). All ten render sites converted to skeleton or HairlineWait.

**Sites using skeleton:** UserInfo avatar, UserInfoDeviceList (2 lines), UserInfoMutualRooms (3 rows), RoomPreview (1 line 40%), maps/async (block), RoomList post-reconnect (full section), URLPreview description (2 lines).

**Sites using HairlineWait:** EventContextModal ("Getting the messages around this one"), EventEditHistory ("Getting the edit history"), SettingsView Monaco editor ("Getting the editor"), LazyWidget ("Getting the widget").

**Sites using SkeletonEdge:** load-more buttons (TimelineView, ThreadView, Notifications, EventContextModal ×2) render label + 2px bar under the button row.

## CSS Scoping: --room-list-width vs --space-bar-width (2026-09-21)

**Fact:** `--room-list-width` is declared on `main.matrix-main` (400px default, overridden inline per session state). Fixed layers outside the main element (modals, alerts, popovers) **cannot resolve** this token because the CSS cascade doesn't reach up to parent scopes — custom properties are inherited down, not up.

**Consequence:** Any element outside `main.matrix-main` that needs a room-list-width value must either (1) use `--space-bar-width` (declared at :root and thus available everywhere), or (2) declare its own token at :root.

**Example:** sidebar width in modals should use `--space-bar-width` (4.5rem + padding), not `--room-list-width` (400px).

## Tertiary Text Colour Light Mode (2026-09-21)

**Addition:** `--tertiary-text-color` was previously defined only in dark mode. Light mode now has `--tertiary-text-color: #9a9a9a` (2.8:1 contrast ratio on white, accepted hierarchy over maximum contrast). This token is used for captions and secondary text where lower emphasis is wanted (search hints, timestamps, etc.).

## Space Membership: m.space.child Edges, DMs Never Children (2026-09-18, AMENDED 2026-09-25)

**Original (2026-09-18):** Space membership is determined by `m.space.child` edges — events stored under the space's state tree. `SpaceEdgeStore.include(room)` returns `this.#flattenedRooms.has(room.room_id)`, where `#flattenedRooms` is populated from these edges. Direct messages are never `m.space.child` events, so per-space DM filters are structurally empty.

**AMENDED (0.7.1, 2026-09-25):** Spaces now include DMs based on membership, matching Element's rule. A DM belongs to a space if its `dm_user_id` is a member of the space (joined/invited) or any descendant subspace (transitive membership check). `SpaceEdgeStore` gained `#members`, `#flattenedMembers`, `setMembers()`, `includeByEdges()`. Space unread badges recount from scratch on member change (incremental deltas would drift).

**Related facts:** The "Rooms" sub-filter uses `SubFilteredSpace.include()` which ANDs the parent space's membership with a per-group room predicate. Inside a space, both constraints are identical (all children are non-DMs), so the filter provides no additional filtering over "All chats." The filter is used to separate Rooms from DMs logically even when structurally both are the space's children.

## WebKit execCommand Text Substitution: Smart Quotes on Programmatic Inserts (2026-09-25)

**Behavior:** `document.execCommand("insertText", false, text)` is treated as if the user typed the text. macOS applies text substitution rules, including smart quotes, even though the text is inserted programmatically.

**Problem (0.7.1):** Custom emoji markdown in the composer was `![:x:](mxc://… "Emoji: :x:")`. When inserted via execCommand, the closing straight quote `"` became a curled quote `"` (smart quote substitution). The backend markdown parser failed to match the pattern because the quote was wrong, so raw text was sent instead of the embedded emoji.

**Fix:** Use parentheses instead of quotes: `![:x:](mxc://… (Emoji: :x:))`. Escape internal special characters: `\(`, `\)`, `\\`. Parentheses are not subject to smart-quote substitution.

**Applies to:** Any markdown-format content inserted via execCommand (not just emoji). When the exact text matters, wrap in characters that won't be substituted (parentheses, brackets, backticks).

## Event-Content Clipping: Portal for Popovers (2026-09-25)

**Behavior:** `div.event-content` in the timeline has `overflow: hidden` and `contain: strict`, which creates a stacking context and clips any children that overflow (e.g., popovers, tooltips).

**Problem (0.7.0–0.7.1):** Reaction hover tooltip was positioned near the reaction pill but clipped by the event-content boundary. Other popovers (mention pills, reactions modal) could also be affected.

**Fix:** Portal the popover to `document.body` with `position: fixed`. Portals render outside the timeline's stacking context, so they are not clipped.

**Pattern:** Use React's `ReactDOM.createPortal(content, document.body)` for any popover, tooltip, or dropdown that needs to escape the event-content clip.

## Lightbox Stacking Context: Above All Modals (2026-09-25)

**Behavior:** `LightboxWrapper` renders after (higher in the tree) every `ModalWrapper`. Because React renders in order, a later child has higher z-index (or relies on tree order for stacking).

**Consequence:** Modals rendered from inside the lightbox (e.g., download prompt) must be drawn INSIDE the lightbox div (e.g., `<div.lightbox-prompt>`), not as a separate modal. If rendered as a separate `ModalWrapper`, it would sit below the lightbox and be obscured.

**Pattern:** Conditional render: if `showDownloadPrompt && lightboxOpen`, render the prompt inside a `<div.lightbox-prompt>` rather than as a sibling modal.

## Space Unread Counts: Recount on Member Change (2026-09-25)

**Behavior:** Space unread badges aggregate the badge counts of all rooms in the space. When the space's membership changes (via setMembers), the badge stale because the set of rooms changed.

**Problem:** Incremental deltas (add/remove counts) would drift if a new room joins the space and already had unread events locally.

**Fix:** On member change, recount from scratch via `#recountSpaceUnreads()`, which iterates `roomListEntries.filter(include)` and sums their badge counts.

**Implementation:** `StateStore.spaceMembersMaybeChanged(roomID)` is called on member updates, batched via `queueMicrotask` to coalesce rapid changes. Triggers a StateStore update, which causes RoomList re-render and picks up the new badge.

## Room List Filters: Re-render Enough for Changes (2026-09-25)

**Behavior:** Room list filtering happens at render time via `roomListFilterFunc` (a function passed to RoomList that decides which rooms are visible). When the filter inputs change (e.g., a sub-filter chip is clicked), the state that drove the filter change updates, causing RoomList to re-render.

**Consequence:** A full re-render is sufficient — there is no separate "apply filter" step or "refresh" button. Changing `activeSubFilter` state triggers a re-render, and the useMemo that applies the filter runs again with the new `activeSubFilter`, producing the new shape.

**Pattern:** Any change to room-list-shape controls (sub-filters, sort state, etc.) just updates the state; the rendering automatically follows.

## Member List Loading: Lazy per Space (2026-09-25)

**Behavior:** Member lists are loaded differently depending on whether the backend has them locally cached (`has_member_list` flag on the space):
- **Cached locally:** loaded at `init_complete` event (startup) — no server call needed
- **Not cached:** loaded on space selection via `client.loadSpaceMembers(spaceID)` — fetches from the backend

**Implementation:** `MainScreen.setSpace()` recursively calls `client.loadSpaceMembers` for any subspace in the selection path. This ensures the current space and all its ancestors have members loaded (needed for transitive membership checks).

**Pattern:** When space selection changes, trigger member loads and don't wait for them to complete — space contents are displayed with the members discovered so far, and the UI updates as members arrive from the server.

## Modal Close Handler Ignores Non-Backdrop Clicks (2026-10-19)

**Gotcha:** the close handler in `ModalCloseContext` (`onClickWrapper` in ui/modal/Modal.tsx) ignores any event whose target is not the backdrop. Passing a click event through, as in `onClick={closeModal}` on a button that contains an icon, silently does nothing. Use `onClick={() => closeModal()}`. This is why the profile card's close X did nothing at first.

## Custom Modal Boxes: Inner Wrapper Must Not Clip (2026-10-19)

**Mechanism:** `div.modal-box-inner` has `overflow: auto` (ui/modal/Lightbox.css). Content that pokes past it lets WebKit scroll the box sideways when a control gets focus or hover (the left edge clips and the close button slides away). It also clips absolutely positioned bars.

**Pattern:** custom boxes (profile-card-box, profile-override-box) set `overflow: visible` on the inner wrapper.

## Colour Tokens: Peach Accent in Dark Mode (2026-10-19)

**Fact:** `--semisecondary-text-color` is `#ffb59a` (peach accent) in dark mode. Do not use it for neutral text.

## Icon Fill: Stroke Icons Need `fill: none` (2026-10-19)

**Gotcha:** a container rule `svg { fill: currentColor }` fills the stroke-drawn icons in `icons/modern/` into solid blobs. Add `&[stroke] { fill: none }` to the rule.

## Media Endpoint `fallback=` Parameter (2026-10-19)

**Behaviour:** the backend media endpoint with a `fallback=` parameter returns the fallback letter tile with status 200 when it cannot thumbnail the file (for example SVG). Without the parameter it returns 500.

## Opening the Profile Card From Scripts (2026-10-19)

`window.mainScreenContext.setRightPanel({type:"user", userID})` opens the profile card. Useful for Playwright checks.

## Profile Card File Map (2026-10-19)

- Card: web/src/ui/profilecard/ (ProfileCard.tsx, CardRow.tsx, SharedRoomsRow.tsx, SecurityRow.tsx, RoomRow.tsx, startdm.ts, open.tsx, ProfileCard.css)
- Override editor: web/src/ui/modal/ProfileOverrideEditor.tsx
- Override storage and rules: web/src/api/profileoverrides.ts
