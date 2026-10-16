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
import { isCheatActive } from "@/util/cheats.ts"
import { parseMXC } from "@/util/validation.ts"
import { BACKEND_URL } from "./backend.ts"
import { applyProfileOverride, getRoomAvatarWithOverride, getRoomNameWithOverride } from "./profileoverrides.ts"
import { createSenderColorAllocator, localSenderColorStorage } from "./sendercolor.ts"
import { fakeGomuksMember } from "./statestore"
import { ContentURI, RoomID, RoomNameQuality, UserID, UserProfile } from "./types"

export const getMediaURL = (mxc?: string, encrypted: boolean = false): string | undefined => {
	const [server, mediaID] = parseMXC(mxc)
	if (!mediaID) {
		return undefined
	}
	return `${BACKEND_URL}_gomuks/media/${server}/${mediaID}?encrypted=${encrypted}`
}

export const getEncryptedMediaURL = (mxc?: string): string | undefined => {
	return getMediaURL(mxc, true)
}

const FALLBACK_COLOR_COUNT = 10

// Custom user color storage
const CUSTOM_COLORS_KEY = "gomuks_custom_user_colors"

function loadCustomColors(): Record<string, string> {
	try {
		const stored = localStorage.getItem(CUSTOM_COLORS_KEY)
		return stored ? JSON.parse(stored) : {}
	} catch {
		return {}
	}
}

const customUserColors: Record<string, string> = loadCustomColors()

export const getCustomUserColor = (userID: UserID): string | null => {
	return customUserColors[userID] || null
}

export const setCustomUserColor = (userID: UserID, color: string | null) => {
	if (color) {
		customUserColors[userID] = color
	} else {
		delete customUserColors[userID]
	}
	localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(customUserColors))
}

export const getAllCustomUserColors = (): Record<string, string> => {
	return { ...customUserColors }
}

export const getUserColorIndex = (userID: UserID) =>
	userID.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % FALLBACK_COLOR_COUNT

function initFallbackColors(): string[] {
	const style = getComputedStyle(document.body)
	const output = []
	for (let i = 0; i < FALLBACK_COLOR_COUNT; i++) {
		output.push(style.getPropertyValue(`--sender-color-${i}`))
	}
	return output
}

let fallbackColors: string[]

function getFallbackColors(): string[] {
	if (!fallbackColors) {
		fallbackColors = initFallbackColors()
	}
	return fallbackColors
}

// Candy green, in the same pastel family as the sender colors.
const RAAM_GREEN = "#50fa7b"

// "@raam:example.com" -> "raam". Returns "" for anything that isn't a user ID.
function getLocalpart(userID: UserID): string {
	if (!userID.startsWith("@")) {
		return ""
	}
	const colonIdx = userID.indexOf(":")
	return (colonIdx === -1 ? userID.slice(1) : userID.slice(1, colonIdx)).toLowerCase()
}

// The color that beats the palette for this user, if any: an active cheat
// first (the whole point of a cheat is that it holds everywhere, custom colors
// included), then the user's own custom color. Exported separately because the
// per-room allocator needs to know an override applies before it hands out a
// palette slot — an overridden user's hue counts as taken in the room.
export const getUserColorOverride = (userID: UserID): string | undefined => {
	if (isCheatActive("raam-green") && getLocalpart(userID) === "raam") {
		return RAAM_GREEN
	}
	return getCustomUserColor(userID) ?? undefined
}

// The hash-based color, for the places that have no room to allocate within:
// the member list, mention pills, avatar fallbacks.
export const getUserColor = (userID: UserID) => {
	const override = getUserColorOverride(userID)
	if (override) {
		return override
	}
	return getFallbackColors()[getUserColorIndex(userID)]
}

// The timeline colors senders per room rather than by hash, so that the people
// talking in one room never land on the same or a neighbouring hue. See
// sendercolor.ts for why, and for the order-dependence that buys it.
const senderColors = createSenderColorAllocator({
	getPalette: getFallbackColors,
	getOverride: getUserColorOverride,
	getHashIndex: getUserColorIndex,
	...localSenderColorStorage,
})

export const getSenderColor = (roomID: RoomID, userID: UserID): string =>
	senderColors.getColor(roomID, userID)

export const getSenderColorIndex = (roomID: RoomID, userID: UserID): number | null =>
	senderColors.getIndex(roomID, userID)

// note: this should stay in sync with fallbackAvatarTemplate in cmd/gomuks/media.go
function makeFallbackAvatar(backgroundColor: string, fallbackCharacter: string): string {
	return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
  <rect x="0" y="0" width="1000" height="1000" fill="${backgroundColor}"/>
  <text x="500" y="750" text-anchor="middle" fill="#fff" font-weight="bold" font-size="666"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  >${escapeHTMLChar(fallbackCharacter)}</text>
</svg>`)
}

function escapeHTMLChar(char: string): string {
	switch (char) {
	case "&": return "&amp;"
	case "<": return "&lt;"
	case ">": return "&gt;"
	default: return char
	}
}

function getFallbackCharacter(from: unknown, idx: number): string {
	if (!from || typeof from !== "string" || from.length <= idx) {
		return ""
	}
	// Array.from appears to be the only way to handle Unicode correctly
	return Array.from(from.slice(0, (idx + 1) * 2))[idx]?.toUpperCase().toWellFormed() ?? ""
}

const disableThumbnails = localStorage.gomuks_disable_thumbnails === "true"

export const getAvatarURL = (
	userID: UserID,
	content?: UserProfile | null,
	thumbnail = false,
	forceFallback = false,
	// The generated-avatar ground. Callers with a room in hand pass the
	// room-aware sender colour so the letter tile matches the name beside it;
	// everything else falls back to the per-user colour.
	backgroundColor: string = getUserColor(userID),
): string => {
	if (userID === fakeGomuksMember.sender && content == fakeGomuksMember.content) {
		return "gomuks.png"
	}
	// The user's MSC4529 override, if any, replaces the picture and the letter tile.
	return makeAvatarURL(userID, applyProfileOverride(userID, content), thumbnail, forceFallback, backgroundColor)
}

// For previews of what an override would look like, which must not have the
// current override applied on top.
export const getAvatarThumbnailURLWithoutOverride = (userID: UserID, content?: UserProfile | null): string =>
	makeAvatarURL(userID, content, true, false, getUserColor(userID))

function makeAvatarURL(
	userID: UserID,
	content: UserProfile | null | undefined,
	thumbnail: boolean,
	forceFallback: boolean,
	backgroundColor: string,
): string {
	const fallbackCharacter = getFallbackCharacter(content?.displayname, 0) || getFallbackCharacter(userID, 1)
	const [server, mediaID] = parseMXC(content?.avatar_file?.url ?? content?.avatar_url)
	if (!mediaID || forceFallback) {
		return makeFallbackAvatar(backgroundColor, fallbackCharacter)
	}
	const encrypted = !!content?.avatar_file
	const fallback = encodeURIComponent(`${backgroundColor}:${fallbackCharacter}`)
	const url = `${BACKEND_URL}_gomuks/media/${server}/${mediaID}?encrypted=${encrypted}&fallback=${fallback}`
	return thumbnail && !disableThumbnails ? `${url}&thumbnail=avatar` : url
}

export const getAvatarThumbnailURL = (
	userID: UserID,
	content?: UserProfile | null,
	forceFallback = false,
	backgroundColor?: string,
): string => {
	return getAvatarURL(userID, content, true, forceFallback, backgroundColor)
}

interface RoomForAvatarURL {
	room_id: RoomID
	name?: string
	name_quality?: RoomNameQuality
	dm_user_id?: UserID
	avatar?: ContentURI
	explicit_avatar?: boolean
	avatar_url?: ContentURI
}

export const getRoomAvatarURL = (
	room: RoomForAvatarURL,
	avatarOverride?: ContentURI,
	thumbnail = false,
	forceFallback = false,
): string | undefined => {
	// Not getAvatarURL: a DM's own explicit avatar must not be replaced by the
	// other member's override. The meta helpers know when it may be.
	const userID = room.dm_user_id || room.room_id
	return makeAvatarURL(userID, {
		displayname: getRoomNameWithOverride(room),
		avatar_url: avatarOverride ?? getRoomAvatarWithOverride(room) ?? room.avatar_url,
	}, thumbnail, forceFallback, getUserColor(userID))
}

export const getRoomAvatarThumbnailURL = (
	room: RoomForAvatarURL,
	avatarOverride?: ContentURI,
	forceFallback = false,
): string | undefined => {
	return getRoomAvatarURL(room, avatarOverride, true, forceFallback)
}
