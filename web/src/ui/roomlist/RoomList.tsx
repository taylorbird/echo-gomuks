// gomuks - A Matrix client written in Go.
// Copyright (C) 2024 Tulir Asokan
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
import React, { use, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { getAvatarThumbnailURL } from "@/api/media.ts"
import {
	RoomListEntry,
	RoomListFilter,
	Space as SpaceStore,
	SpaceSubFilterID,
	SpaceUnreadCounts,
	SubFilteredSpace,
	usePreference,
} from "@/api/statestore"
import type { RoomID } from "@/api/types"
import { getCheats, isCheatActive } from "@/util/cheats.ts"
import { useEventAsState } from "@/util/eventdispatcher.ts"
import { prefersReducedMotion } from "@/util/reducedmotion.ts"
import toSearchableString from "@/util/searchablestring.ts"
import ClientContext from "../ClientContext.ts"
import MainScreenContext from "../MainScreenContext.ts"
import { keyToString } from "../keybindings.ts"
import { ConfirmModal, ModalContext, modals } from "../modal"
import ProfileEditor from "../modal/ProfileEditor.tsx"
import Entry from "./Entry.tsx"
import FakeSpace from "./FakeSpace.tsx"
import RailDMs from "./RailDMs.tsx"
import Space from "./Space.tsx"
import AddCircleIcon from "@/icons/add-circle.svg?react"
import CloseIcon from "@/icons/close.svg?react"
import MarkReadIcon from "@/icons/mark-read.svg?react"
import BellIcon from "@/icons/modern/bell.svg?react"
import ChevronDownIcon from "@/icons/modern/chevron-down.svg?react"
import ClockIcon from "@/icons/modern/clock.svg?react"
import GamepadIcon from "@/icons/modern/gamepad-2.svg?react"
import HashIcon from "@/icons/modern/hash.svg?react"
import LayersIcon from "@/icons/modern/layers.svg?react"
import SettingsIcon from "@/icons/modern/settings.svg?react"
import UserIcon from "@/icons/modern/user.svg?react"
import UsersIcon from "@/icons/modern/users.svg?react"
import SearchIcon from "@/icons/search.svg?react"
import "./RoomList.css"
import "../loading/Loading.css"

// Renamed from the pre-rebrand "seabug." prefix. Normally that would silently reset everyone's
// collapsed sections, which is why it was left alone for months — but changing the bundle
// identifier in 0.3.0 gave the webview a fresh store, so there was nothing left to preserve.
const collapsedSectionsKey = "echo.collapsed_room_list_sections"
function readCollapsedSections(): Set<string> {
	try {
		const raw = localStorage.getItem(collapsedSectionsKey)
		return new Set(raw ? JSON.parse(raw) as string[] : [])
	} catch {
		// A corrupt or unreadable value shouldn't stop the room list from rendering.
		return new Set()
	}
}

/*
 * The sub-filters an opened space offers, in rail order. "all" is the absence of
 * a SubFilteredSpace wrapper rather than a filter of its own, so it carries no
 * SpaceSubFilterID.
 */
const spaceSubFilters = [
	{ id: "all", name: "All chats", icon: LayersIcon },
	{ id: "rooms", name: "Rooms", icon: HashIcon },
	{ id: "dms", name: "Direct messages", icon: UserIcon },
	// Recent narrows nothing; it is here because it answers the same question the
	// others do — "show me this slice of the space" — and belongs with them rather
	// than as a sort hidden on a section header.
	{ id: "recent", name: "Recent", icon: ClockIcon },
] as const

/*
 * A band that is sliding shut, kept mounted past the point its filter stopped
 * being active so the exit animation has something to run on. `index` is the
 * position it was rendered at in the partable list, which is what keeps it in
 * place while the incoming band opens somewhere else.
 */
interface ClosingBand {
	id: string
	index: number
}

/*
 * The rail's view of which band is open and which is on its way out. Both live
 * in one state object because they only ever change together, and splitting
 * them would let a render observe a new open id against a stale closing band.
 */
interface RailTransition {
	openID: string | null
	openIndex: number
	closing: ClosingBand | null
}

interface RoomListProps {
	activeRoomID: RoomID | null
	space: RoomListFilter | null
	firstSync: boolean
}

/*
 * Placeholder rows shown while the first sync is still running.
 *
 * Geometry is copied from div.room-entry rather than approximated, so a row does not shift
 * when the real thing replaces it. Real rooms render above these as they arrive and push the
 * placeholders down and out, instead of the whole block swapping at once.
 *
 * The widths are a fixed cycle, not random: a random set re-rolls on every render, which
 * makes the list twitch on each incoming room.
 */
const SKELETON_ROWS = 12
const skeletonWidths: [number, number][] = [
	[58, 86], [44, 72], [66, 54], [51, 80], [39, 63], [62, 88],
	[47, 70], [55, 84], [42, 66], [69, 58], [49, 77], [60, 82],
]

export const RoomListSkeleton = ({ count }: { count: number }) => <>
	{Array.from({ length: count }, (_, i) => {
		const [w1, w2] = skeletonWidths[i % skeletonWidths.length]
		return <div className="room-entry-skeleton" key={`skeleton-${i}`} aria-hidden="true">
			<div className="sk-avatar"><i /></div>
			<div className="sk-lines" style={{ ["--sk-w1" as string]: `${w1}%`, ["--sk-w2" as string]: `${w2}%` }}>
				<div className="sk-name" />
				<div className="sk-preview" />
			</div>
		</div>
	})}
</>

/*
 * What "unread" means everywhere in this file: the rooms that would show a badge.
 * Shared by the mark-all-read button and the Unread section so the two can never
 * drift apart on the question.
 *
 * Deliberately not UnreadsSpace.include, which also keeps the open room in the
 * rail's unreads view unconditionally — that is a filter's stickiness, not an
 * answer about badges, and this file has its own (see unreadPin below).
 */
const isUnread = (entry: RoomListEntry) =>
	entry.marked_unread
	|| entry.unread_messages > 0
	|| entry.unread_notifications > 0
	|| entry.unread_highlights > 0

/*
 * Clears every unread room at once.
 *
 * The receipt is sent for each room's preview event rather than its true latest event:
 * the latest one is only in memory for rooms whose timeline has been loaded, and loading
 * thirty timelines to clear thirty badges is not a trade worth making. The preview event
 * is the newest *displayable* message, so anything newer than it is a state event that
 * was never shown — the visible unreads all clear, which is what the button promises.
 *
 * Rooms flagged only by `marked_unread` carry no receipt to send, so that flag is cleared
 * through account data instead, exactly as the per-room menu item does.
 */
const useMarkAllRead = (unreadRooms: RoomListEntry[]) => {
	const client = use(ClientContext)!
	return useCallback(() => {
		for (const room of unreadRooms) {
			if (room.marked_unread) {
				client.rpc.setAccountData("m.marked_unread", { unread: false }, room.room_id)
					.catch(err => console.error(`Failed to clear marked_unread for ${room.room_id}:`, err))
			}
			const previewEvent = room.preview_event
			if (!previewEvent) {
				continue
			}
			const store = client.store.rooms.get(room.room_id)
			const rrType = store?.preferences.send_read_receipts === false ? "m.read.private" : "m.read"
			client.rpc.markRead(room.room_id, previewEvent.event_id, rrType)
				.catch(err => console.error(`Failed to mark ${room.room_id} read:`, err))
		}
	}, [client, unreadRooms])
}

const RoomList = ({ activeRoomID, space, firstSync }: RoomListProps) => {
	const client = use(ClientContext)!
	const openModal = use(ModalContext)
	const mainScreen = use(MainScreenContext)
	const roomList = useEventAsState(client.store.roomList)
	// A space's member list arriving changes which DMs it holds without touching
	// the room list itself; the filter runs at render, so render again.
	const [, onSpaceMembers] = useReducer((n: number) => n + 1, 0)
	useEffect(() => client.store.spaceMembersSub.subscribe(onSpaceMembers), [client])
	const spaces = useEventAsState(client.store.topLevelSpaces)
	const initComplete = useEventAsState(client.initComplete)
	// The list is provisional both before the store has finished loading and while the
	// first sync is still running. Those used to be drawn differently — a bar crawling
	// across the top for the first, placeholder rows for the second — which made the
	// same "not all here yet" state look like two unrelated things.
	const showSkeleton = !initComplete || firstSync
	// Placeholder rows only fill the space real rooms have not claimed yet. Once the list
	// is already longer than the placeholder set — a reconnect with everything loaded —
	// there are none to draw, and a list with no fake rows must keep scrolling.
	const skeletonRows = showSkeleton ? Math.max(0, SKELETON_ROWS - roomList.length) : 0
	// Every room that would currently show a badge, in room-list order.
	const unreadRooms = useMemo(() => roomList.filter(isUnread), [roomList])
	const markAllRead = useMarkAllRead(unreadRooms)
	const searchInputRef = useRef<HTMLInputElement>(null)
	const [query, directSetQuery] = useState("")
	// Your own profile, kept current by the client from the backend state, so the rail
	// avatar shows your real picture rather than the generated letter tile.
	const ownProfile = useEventAsState(client.profile)

	const setQuery = (evt: React.ChangeEvent<HTMLInputElement>) => {
		client.store.currentRoomListQuery = toSearchableString(evt.target.value)
		directSetQuery(evt.target.value)
	}
	const openCreateRoom = () => {
		openModal(modals.createRoom())
	}
	const onClickSpace = useCallback((evt: React.MouseEvent<HTMLDivElement>) => {
		const spaceID = evt.currentTarget.getAttribute("data-target-space")!
		const store = client.store.getSpaceStore(spaceID)
		mainScreen.setSpace(store)
		// A real space is also a room, so open its lobby (RoomView renders SpaceView
		// for m.space rooms) instead of leaving the chat pane on whatever was there.
		// Pseudo-spaces have no room behind them and stay filter-only — they use the
		// setSpace prop directly rather than going through this handler.
		if (spaceID !== activeRoomID && client.store.rooms.has(spaceID)) {
			mainScreen.setActiveRoom(spaceID)
		}
	}, [mainScreen, client, activeRoomID])
	const onClickSpaceUnread = useCallback((
		evt: React.MouseEvent<HTMLDivElement>, space?: SpaceStore | null,
	) => {
		if (!space) {
			const targetSpace = evt.currentTarget.closest("div.space-entry")?.getAttribute("data-target-space")
			if (!targetSpace) {
				return
			}
			space = client.store.getSpaceStore(targetSpace)
			if (!space) {
				return
			}
		}
		const counts = space.counts.current
		let wantedField: keyof SpaceUnreadCounts
		if (counts.unread_highlights > 0) {
			wantedField = "unread_highlights"
		} else if (counts.unread_notifications > 0) {
			wantedField = "unread_notifications"
		} else if (counts.unread_messages > 0) {
			wantedField = "unread_messages"
		} else {
			return
		}
		for (let i = client.store.roomList.current.length - 1; i >= 0; i--) {
			const entry = client.store.roomList.current[i]
			if (entry[wantedField] > 0 && space.include(entry)) {
				mainScreen.setActiveRoom(entry.room_id, { toSpace: space })
				evt.stopPropagation()
				return
			}
		}
		console.warn(
			"No room found with unreads in space", space.id, "with field", wantedField,
			"- looking for hidden rooms",
		)
		for (const item of client.store.rooms.values()) {
			if (item.meta.current[wantedField] > 0 && space.include({
				...item.meta.current,
				search_name: item.meta.current.name || "",
				name: item.meta.current.name || "",
			})) {
				mainScreen.setActiveRoom(item.roomID, { toSpace: space })
				evt.stopPropagation()
				return
			}
		}
	}, [mainScreen, client])
	const onClickSubFilter = useCallback((evt: React.MouseEvent<HTMLButtonElement>) => {
		const sub = evt.currentTarget.getAttribute("data-sub-filter") as SpaceSubFilterID | "all"
		const current = client.store.currentRoomListFilter
		// No filter at all is the boot state, and the rail already shows it as All
		// chats with its band open, so the band's buttons have to treat it as that.
		const parent = current instanceof SubFilteredSpace
			? current.parent
			: current ?? client.store.allChatsSpace
		// pushState is skipped deliberately: the history entry's space_id doesn't
		// change, and the push path closes the open room when the new filter
		// excludes it — narrowing the rail shouldn't shut the conversation.
		mainScreen.setSpace(sub === "all" ? parent : new SubFilteredSpace(parent, sub), false)
	}, [client, mainScreen])
	const clearQuery = () => {
		client.store.currentRoomListQuery = ""
		directSetQuery("")
		searchInputRef.current?.focus()
	}
	const onKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
		const key = keyToString(evt)
		if (key === "Escape") {
			clearQuery()
			evt.stopPropagation()
			evt.preventDefault()
		} else if (key === "Enter") {
			const roomList = client.store.getFilteredRoomList()
			mainScreen.setActiveRoom(roomList[roomList.length-1]?.room_id)
			clearQuery()
			evt.stopPropagation()
			evt.preventDefault()
		}
	}

	const showInviteAvatars = usePreference(client.store, null, "show_invite_avatars")
	const unreadSection = usePreference(client.store, null, "unread_section")
	const railUnreadDMs = usePreference(client.store, null, "rail_unread_dms")
	const roomListFilter = client.store.roomListFilterFunc
	/*
	 * Which room is currently held in the Unread section despite its counts, and the
	 * room the decision was made for. Opening a room clears its badge within a frame
	 * or two, so without this the row you just clicked would slide out from under the
	 * cursor and reappear further down the list while you are still reading it.
	 *
	 * The pin is decided once, at the moment a room becomes the active one, and lasts
	 * only as long as it stays active — navigate away and the room falls back to
	 * wherever its counts put it. A ref rather than state because nothing re-renders
	 * on it: the sections memo is its only reader and already re-runs whenever
	 * activeRoomID changes.
	 */
	const unreadPin = useRef<{ forRoom: RoomID | null, pinned: boolean }>({ forRoom: null, pinned: false })
	// Group rooms from direct messages. dm_user_id is the same signal DirectChatSpace
	// filters on, so the grouping here always agrees with the built-in DM space.
	// roomList is ordered oldest-first, so walk it backwards to keep each group
	// most-recent-first, matching the ungrouped list's ordering.
	//
	// With the Unread section on, a badged room is taken out of its usual group
	// entirely rather than shown twice — the section is where it lives until it is
	// read. With the section off the two groups are the whole list, as before.
	//
	// Declared here rather than beside the rail's other space lookups below: the
	// sections depend on it, and a const read before its initialiser is a TDZ error.
	const activeSubFilter: SpaceSubFilterID | "all" = space instanceof SubFilteredSpace ? space.sub : "all"
	const collapsible = activeSubFilter === "all"
	const sections = useMemo(() => {
		if (unreadPin.current.forRoom !== activeRoomID) {
			unreadPin.current = {
				forRoom: activeRoomID,
				pinned: activeRoomID !== null
					&& roomList.some(room => room.room_id === activeRoomID && isUnread(room)),
			}
		}
		const pinnedRoom = unreadPin.current.pinned ? activeRoomID : null
		/*
		 * The Recent sub-filter is one unsectioned run of everything, newest first.
		 * No Unread section either: lifting badged rooms to the top is exactly what
		 * would push the conversation you just left back down the list, which is the
		 * whole thing this view exists to prevent. Unread still leads every other
		 * view, and each row keeps its kind glyph, so a mixed list still reads.
		 */
		if (activeSubFilter === "recent") {
			// toReversed() is macOS 13.3+ only and no minimumSystemVersion is declared,
			// so the spread copy stays: same result, no floor.
			// Headerless because the rail's lit sub-filter already says "Recent", and a
			// collapse control on the only section would just empty the list.
			return [{
				id: "recent", name: "Recent", icon: ClockIcon,
				entries: [...roomList].reverse(), headerless: true,
			}]
		}
		const unread: RoomListEntry[] = []
		const rooms: RoomListEntry[] = []
		const directMessages: RoomListEntry[] = []
		for (let i = roomList.length - 1; i >= 0; i--) {
			const room = roomList[i]
			if (unreadSection && (isUnread(room) || room.room_id === pinnedRoom)) {
				unread.push(room)
			} else if (room.dm_user_id) {
				directMessages.push(room)
			} else {
				rooms.push(room)
			}
		}
		// Always listed, even empty: the renderer already drops a section with nothing
		// visible under it, which is also what hides this one when the preference is off.
		return [
			{ id: "unread", name: "Unread", icon: BellIcon, entries: unread, headerless: false },
			{ id: "rooms", name: "Rooms", icon: UsersIcon, entries: rooms, headerless: false },
			{ id: "dms", name: "Direct messages", icon: UserIcon, entries: directMessages, headerless: false },
		]
	}, [roomList, activeRoomID, unreadSection, activeSubFilter])
	const [collapsedSections, setCollapsedSections] = useState(readCollapsedSections)
	const toggleSection = useCallback((evt: React.MouseEvent<HTMLButtonElement>) => {
		const sectionID = evt.currentTarget.getAttribute("data-section-id")
		if (!sectionID) {
			return
		}
		setCollapsedSections(prev => {
			const next = new Set(prev)
			if (next.has(sectionID)) {
				next.delete(sectionID)
			} else {
				next.add(sectionID)
			}
			try {
				localStorage.setItem(collapsedSectionsKey, JSON.stringify([...next]))
			} catch {
				// Remembering the collapse state is a convenience, not worth failing over.
			}
			return next
		})
	}, [])
	/*
	 * Rail state. All chats (no filter at all) leads, then the partable entries,
	 * then a rule and unreads. The person pseudo-space no longer appears — an
	 * opened space's DMs sub-filter covers that split, and every DM outside a
	 * space is in Outside spaces.
	 */
	const allChatsSpace = client.store.allChatsSpace
	const orphansSpace = client.store.spaceOrphans
	const unreadsSpace = client.store.unreadsSpace
	/*
	 * The entries that can part the rail, by filter id. All chats and Outside
	 * spaces lead them because both are spaces in the sense that matters here —
	 * a set of chats worth splitting into rooms and DMs. Only unreads is left
	 * out: it is a lookup, and there is nothing to sub-divide in it.
	 *
	 * Ids rather than components because this list is also what the open index
	 * is looked up in, and a nested space can be the active filter without
	 * having a rail tile at all — indexOf returning -1 is exactly the "nothing
	 * to part around" answer.
	 *
	 * No filter means All chats, not "no space": that is what the All chats tile
	 * already claims by lighting up on `space === null` further down, and a lit
	 * tile over a shut band is the state that reads as being nowhere. Being
	 * logged in always puts you in a space, so the band is only ever closed for a
	 * nested space that has no tile to part around.
	 */
	const partables = [allChatsSpace.id, orphansSpace.id, ...spaces]
	const openIndex = partables.indexOf(space?.id ?? allChatsSpace.id)
	const openID = openIndex < 0 ? null : partables[openIndex]
	/*
	 * Closing is the awkward half: the filter stops being active the instant it
	 * is clicked, but the band has to stay on screen to slide shut. So the rail
	 * keeps its own copy of what is open, and when that disagrees with the real
	 * filter, the entry it used to hold becomes a closing band.
	 *
	 * Adjusted during render rather than in an effect on purpose — an effect runs
	 * after paint, so the old band would blink out of existence for a frame and
	 * then be put back to animate, which is worse than not animating at all.
	 */
	const [rail, setRail] = useState<RailTransition>(() => ({ openID, openIndex, closing: null }))
	if (rail.openID !== openID) {
		setRail({
			openID,
			openIndex,
			/*
			 * Any band already closing is dropped here rather than queued: at most
			 * one is ever mounted, so clicking through three spaces quickly can
			 * never stack them up. Reduced motion skips the whole mechanism, which
			 * also keeps those users off the animationend path — with
			 * `animation: none` that event never fires at all.
			 */
			closing: rail.openID !== null && !prefersReducedMotion()
				? { id: rail.openID, index: rail.openIndex }
				: null,
		})
	}
	const closingID = rail.closing?.id ?? null
	const endClosing = useCallback(() => setRail(
		prev => prev.closing ? { ...prev, closing: null } : prev,
	), [])
	/*
	 * Backstop for the animationend that never arrives — the element torn down
	 * mid-slide, a media-query flip that silences the animation, a dropped frame
	 * at the wrong moment. Without it a band that misses its event stays mounted
	 * forever, wedging the rail half open.
	 */
	useEffect(() => {
		if (!closingID) {
			return
		}
		const timeout = setTimeout(endClosing, 1100)
		return () => clearTimeout(timeout)
	}, [closingID, endClosing])
	const onBandAnimationEnd = useCallback((evt: React.AnimationEvent<HTMLDivElement>) => {
		// Only the band's own slide ends the close; animation events bubble.
		if (evt.target === evt.currentTarget) {
			endClosing()
		}
	}, [endClosing])
	const renderSpace = (roomID: RoomID) => <Space
		key={roomID}
		roomID={roomID}
		client={client}
		onClick={onClickSpace}
		isActive={space?.id === roomID}
		onClickUnread={onClickSpaceUnread}
	/>
	const renderPartable = (id: string) => {
		if (id === allChatsSpace.id) {
			// Nothing aggregates into this one's counts, so there is no badge to
			// render and no unread to jump to — hence no handler.
			return <FakeSpace
				key={id}
				space={allChatsSpace}
				setSpace={mainScreen.setSpace}
				// Lit for the unfiltered boot state as well: same view, and the tile
				// should not go dark just because nothing has been clicked yet.
				isActive={space === null || space.id === allChatsSpace.id}
			/>
		}
		if (id === orphansSpace.id) {
			return <FakeSpace
				key={id}
				space={orphansSpace}
				setSpace={mainScreen.setSpace}
				onClickUnread={onClickSpaceUnread}
				isActive={space?.id === orphansSpace.id}
			/>
		}
		return renderSpace(id)
	}
	// Unreads is a lookup across everything above it rather than another place to
	// stand, so a rule sets it apart from the list of filters.
	const railTail = <>
		<div className="space-bar-divider" />
		<FakeSpace
			space={unreadsSpace}
			setSpace={mainScreen.setSpace}
			onClickUnread={onClickSpaceUnread}
			isActive={space?.id === unreadsSpace.id}
		/>
	</>
	/*
	 * Every band on screen, in rail order — at most the one closing and the one
	 * opening. Their indices can't collide (distinct ids are distinct positions),
	 * except briefly if the closing entry has since left the rail entirely, which
	 * the clamp keeps from slicing out of bounds.
	 */
	const bands: { id: string, index: number, closing: boolean }[] = []
	if (rail.closing) {
		bands.push({
			id: rail.closing.id,
			index: Math.min(rail.closing.index, partables.length),
			closing: true,
		})
	}
	if (openID !== null) {
		bands.push({ id: openID, index: openIndex, closing: false })
	}
	bands.sort((a, b) => a.index - b.index)
	const renderBand = (band: (typeof bands)[number]) => <div
		key={`band-${band.id}`}
		className={`space-bar-under-layer ${band.closing ? "closing" : ""}`}
		// Only the outgoing band listens: the incoming one's animation ending is
		// not an event anything needs to act on.
		onAnimationEnd={band.closing ? onBandAnimationEnd : undefined}
	>
		{/* The band's height is a grid track that animates between 0fr and 1fr, and
		    a track can only compress a child that lets itself be compressed — hence
		    this wrapper carrying the overflow and the padding. Padding left on the
		    outer element would keep the closed band a few millimetres tall. */}
		<div className="space-bar-under-layer-inner">
			{/* A closing band carries only the drawer — divider and sub-filters. Its
			    space's tile is rendered by the segment above instead, because the
			    tile is permanent rail furniture: leaving it in the band made the
			    space's own icon fade out and collapse with the drawer, then pop
			    back into the dark strip half a second later. */}
			{band.closing ? null : renderPartable(band.id)}
			<div className="space-sub-divider" />
			{/* Unread DMs lead the drawer, ahead of the sub-filters. Only the opening
			    band: a closing one is on its way out, and two copies of the same
			    tiles would slide past each other. */}
			{!band.closing && railUnreadDMs && <RailDMs unreadRooms={unreadRooms} placement="drawer"/>}
			{spaceSubFilters.map(subFilter => <button
				key={subFilter.id}
				type="button"
				className="space-sub-filter"
				data-sub-filter={subFilter.id}
				title={subFilter.name}
				aria-pressed={activeSubFilter === subFilter.id}
				onClick={onClickSubFilter}
			>
				<subFilter.icon />
			</button>)}
		</div>
	</div>
	/*
	 * One slice of the dark strip. A segment casts onto whichever band it abuts:
	 * downward if one follows it, upward if one precedes it, both ways when it is
	 * sandwiched between the closing and the opening band. With no bands at all
	 * this is the whole rail and casts nothing.
	 */
	const renderSegment = (from: number, to: number) => {
		const isFirst = from === 0
		const isLast = to >= partables.length
		const cast = isFirst && isLast ? "" : isFirst ? "top" : isLast ? "bottom" : "between"
		// A rule above every space (the first one also sets the spaces apart from
		// the built-in filters), once there is more than one space. When a space's
		// band opens right below this segment, its rule closes the segment instead.
		const firstSpace = 2
		const withDividers = spaces.length > 1
		const tiles: React.ReactNode[] = []
		for (let i = from; i < to; i++) {
			if (withDividers && i >= firstSpace) {
				tiles.push(<div className="space-bar-divider" key={`divider-${i}`} />)
			}
			tiles.push(renderPartable(partables[i]))
		}
		if (withDividers && to >= firstSpace && to === openIndex) {
			tiles.push(<div className="space-bar-divider" key={`divider-${to}`} />)
		}
		return <div className={`space-bar-segment ${cast}`} key={`segment-${from}`}>
			{tiles}
			{isLast ? railTail : null}
		</div>
	}
	const railRegions: React.ReactNode[] = []
	let railCursor = 0
	for (const band of bands) {
		// A closing band's own tile belongs to the segment above it — see
		// renderBand — so the slice runs one further to include it. The tile
		// lands at the same pixel position it had at the top of the band, which
		// is what makes the handoff invisible.
		railRegions.push(renderSegment(railCursor, band.closing ? band.index + 1 : band.index))
		railRegions.push(renderBand(band))
		railCursor = band.index + 1
	}
	railRegions.push(renderSegment(railCursor, partables.length))
	return <div className="room-list-wrapper">
		{/* The sidebar's header band is a window drag surface, matching the room header.
		    The bare attribute only fires when the mousedown target is this element itself,
		    so the strip above and below the shorter search input drags the window while
		    the input and its buttons keep working. */}
		<div className="room-search-wrapper" data-tauri-drag-region>
			<input
				value={query}
				onChange={setQuery}
				onKeyDown={onKeyDown}
				className="room-search"
				type="text"
				placeholder="Search rooms"
				ref={searchInputRef}
				id="room-search"
			/>
			{/* Only offered when there is something to clear, which keeps a destructive
			    bulk action out of the header the rest of the time. */}
			{query === "" && unreadRooms.length > 0 && <button
				onClick={() => openModal({
					dimmed: true,
					boxed: true,
					content: <ConfirmModal
						title="Mark all read"
						description={`Clear the unread marker on ${unreadRooms.length} `
							+ `${unreadRooms.length === 1 ? "room" : "rooms"}?`}
						confirmButton="Mark all read"
						onConfirm={markAllRead}
						confirmArgs={[]}
					/>,
				})}
				title={`Mark all ${unreadRooms.length} unread rooms as read`}
			>
				<MarkReadIcon/>
			</button>}
			{query === "" && <button onClick={openCreateRoom} title="Create room">
				<AddCircleIcon/>
			</button>}
			<button onClick={clearQuery} disabled={query === ""} className="search-clear-button">
				{query !== "" ? <CloseIcon/> : <SearchIcon/>}
			</button>
		</div>
		<div className="space-bar" data-tauri-drag-region>
			{/* Opening a partable entry parts the rail: the dark strip splits and a
			    lighter layer slides open between the pieces, holding the entry and
			    its sub-filters. Closing slides it back shut, and switching straight
			    from one entry to another runs both at once — the old band closing
			    where it stood while the new one opens at its own position. Closed,
			    the rail is a single unsplit segment. */}
			{railRegions}
			<div className="space-bar-footer">
				{/* Static per page load is fine: toggling a cheat reloads the app. */}
				{getCheats().some(cheat => isCheatActive(cheat.id)) && <button
					className="cheat-indicator"
					title="A cheat code is active — click to manage"
					onClick={() => window.openModal(modals.cheatConsole())}
				>
					<GamepadIcon/>
				</button>}
				<button
					className="rail-profile"
					title={`Your profile (${client.userID})`}
					// Opens the profile editor, room or no room. It used to open the side
					// panel, which only exists with a room open, so the button sat disabled
					// on Home.
					onClick={() => openModal({
						dimmed: true,
						boxed: true,
						content: <ProfileEditor client={client}/>,
					})}
				>
					<img className="avatar" src={getAvatarThumbnailURL(client.userID, ownProfile)} alt=""/>
				</button>
				<button
					className="rail-settings"
					title="Settings"
					onClick={() => {
						const room = activeRoomID ? client.store.rooms.get(activeRoomID) : undefined
						window.openNestableModal(modals.settings(room))
					}}
				>
					<SettingsIcon/>
				</button>
			</div>
		</div>
		<div className={`room-list ${skeletonRows > 0 ? "skeleton" : ""}`}>
			{/* Collapsing is for choosing between groups, which only All chats has. The
			    Rooms and Direct messages views keep their headers as fixed titles. */}
			{sections.map(section => {
				// A header with nothing under it is noise, so drop the whole group
				// once the search query filters out every room in it.
				const hasVisibleEntries = roomListFilter
					? section.entries.some(room => roomListFilter(room))
					: section.entries.length > 0
				if (!hasVisibleEntries) {
					return null
				}
				const isCollapsed = collapsible && !section.headerless && collapsedSections.has(section.id)
				return <div
					key={section.id}
					className={`room-list-section ${section.headerless ? "headerless" : ""}`}
				>
					{section.headerless ? null : !collapsible ? <div className="room-list-section-header static">
						<section.icon className="section-icon" />
						<span className="section-name">{section.name}</span>
					</div> : <button
						type="button"
						className={`room-list-section-header ${isCollapsed ? "collapsed" : ""}`}
						data-section-id={section.id}
						onClick={toggleSection}
						aria-expanded={!isCollapsed}
					>
						<section.icon className="section-icon" />
						<span className="section-name">{section.name}</span>
						<ChevronDownIcon className="section-chevron" />
					</button>}
					{isCollapsed ? null : section.entries.map(room =>
						<Entry
							key={room.room_id}
							isActive={room.room_id === activeRoomID}
							hidden={roomListFilter ? !roomListFilter(room) : false}
							room={room}
							hideAvatar={room.is_invite && !showInviteAvatars}
						/>,
					)}
				</div>
			})}
			{skeletonRows > 0 && <RoomListSkeleton count={skeletonRows} />}
		</div>
	</div>
}

export default RoomList
