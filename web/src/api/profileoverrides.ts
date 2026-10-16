// gomuks - A Matrix client written in Go.
// Copyright (C) 2026 Tulir Asokan
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
import { useSyncExternalStore } from "react"
import { NoDataSubscribable } from "@/util/subscribable.ts"
import type { ContentURI, RoomNameQuality, UserID, UserProfile } from "./types"

/*
 * MSC4529 client-side profile overrides: a global account data map from user ID
 * to the profile fields the user would rather see for that person ("Mum" rather
 * than "Sarah"). Overrides change what is displayed, never what is sent.
 *
 * This module is deliberately a leaf (no store imports), because the display
 * helpers in util/validation.ts and api/media.ts consult it and are imported
 * nearly everywhere.
 */

export const PROFILE_OVERRIDES_STABLE = "m.profile_overrides"
export const PROFILE_OVERRIDES_UNSTABLE = "org.matrix.msc4529.profile_overrides"

// One user's overrides. A field set to null means "show as though absent";
// a missing field means "no override, use the real value".
export type ProfileOverride = Record<string, unknown> & {
	displayname?: string | null
	avatar_url?: ContentURI | null
	"m.tz"?: string | null
}

// The spec grammar is looser than this (historical localparts), but every user ID
// has a sigil, a non-empty localpart, a colon and a server name, and fits in 255 bytes.
const userIDRegex = /^@[^:\s]+:[^\s]+$/
const mxcRegex = /^mxc:\/\/[a-zA-Z0-9.:-]+\/[a-zA-Z0-9_-]+$/

export const isValidUserID = (key: string): key is UserID =>
	key.length <= 255 && userIDRegex.test(key)

const isStringOrNull = (val: unknown) => val === null || typeof val === "string"

// Known fields are checked against the type the real profile field has. Unknown
// fields are kept as they are: there's no way to know their type, and this client
// never displays them.
function validateField(field: string, value: unknown): boolean {
	switch (field) {
	case "displayname":
	case "m.tz":
		return isStringOrNull(value)
	case "avatar_url":
		// An EncryptedFile object is only valid inside an MSC4483-encrypted event,
		// which this client can't read, so in a plaintext event it's the wrong type.
		return value === null || (typeof value === "string" && mxcRegex.test(value))
	default:
		return true
	}
}

export function parseProfileOverrides(content: unknown): Map<UserID, ProfileOverride> {
	const output = new Map<UserID, ProfileOverride>()
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		return output
	}
	for (const [userID, fields] of Object.entries(content)) {
		if (!isValidUserID(userID) || !fields || typeof fields !== "object" || Array.isArray(fields)) {
			continue
		}
		const entry: ProfileOverride = {}
		for (const [field, value] of Object.entries(fields)) {
			if (validateField(field, value)) {
				entry[field] = value
			}
		}
		if (Object.keys(entry).length > 0) {
			output.set(userID, entry)
		}
	}
	return output
}

// An MSC4483-encrypted event has no user ID keys, so it parses to nothing and the
// real profiles show, as the MSC intends. Writing to it would replace the
// ciphertext with plaintext and lose every override, so editing is refused.
export const isEncryptedOverrideContent = (content: unknown): boolean =>
	!!content && typeof content === "object" && "encrypted" in content

let overrides: Map<UserID, ProfileOverride> = new Map()
let sourceType: string = PROFILE_OVERRIDES_UNSTABLE
let sourceContent: Record<string, unknown> | null = null
let sourceEncrypted = false
export const profileOverridesSub = new NoDataSubscribable()

/*
 * Called by the state store whenever either event type arrives. The stable type
 * wins where both exist, per the MSC's unstable prefix section.
 */
export function loadProfileOverrides(stable: unknown, unstable: unknown) {
	const useStable = stable !== undefined && stable !== null
	const content = useStable ? stable : unstable
	sourceType = useStable ? PROFILE_OVERRIDES_STABLE : PROFILE_OVERRIDES_UNSTABLE
	sourceEncrypted = isEncryptedOverrideContent(content)
	sourceContent = content && typeof content === "object" && !sourceEncrypted
		? content as Record<string, unknown> : null
	overrides = parseProfileOverrides(sourceEncrypted ? null : content)
	profileOverridesSub.notify()
}

export function clearProfileOverrides() {
	overrides = new Map()
	sourceType = PROFILE_OVERRIDES_UNSTABLE
	sourceContent = null
	sourceEncrypted = false
	profileOverridesSub.notify()
}

export const getProfileOverride = (userID: UserID | undefined): ProfileOverride | undefined =>
	userID ? overrides.get(userID) : undefined

export const hasProfileOverrides = () => overrides.size > 0

export const canEditProfileOverrides = () => !sourceEncrypted

/*
 * Re-render on any override change. The display helpers are plain functions, so a
 * component that calls them during render has to subscribe for itself.
 */
export function useProfileOverrides(): number {
	return useSyncExternalStore(profileOverridesSub.subscribe, profileOverridesSub.getData)
}

const hasField = (entry: ProfileOverride, field: string) => Object.hasOwn(entry, field)

/*
 * The profile as the user wants to see it. Returns the input untouched when there
 * is no override, so memoised consumers don't see a new object for nothing.
 */
export function applyProfileOverride<T extends UserProfile>(
	userID: UserID | undefined, profile: T | null | undefined,
): T | null | undefined {
	const entry = getProfileOverride(userID)
	if (!entry) {
		return profile
	}
	const output: Record<string, unknown> = { ...(profile ?? {}) }
	for (const [field, value] of Object.entries(entry)) {
		if (value === null) {
			delete output[field]
		} else {
			output[field] = value
		}
	}
	if (hasField(entry, "avatar_url")) {
		// The real profile's encrypted avatar (per-message profiles) must not
		// outrank the override.
		delete output.avatar_file
	}
	return output as T
}

interface RoomMetaForOverride {
	dm_user_id?: UserID
	name?: string
	name_quality?: RoomNameQuality
	avatar?: ContentURI
	explicit_avatar?: boolean
}

/*
 * A DM named after its other member takes that member's override, matching the
 * MSC's "room names and avatars derived from members". A name or avatar the room
 * set for itself is left alone. Group rooms named after several members are not
 * handled: the backend joins the names and the frontend lacks the hero list.
 * RoomNameQuality.Participants is 1; the enum isn't imported to keep this a leaf.
 *
 * Both need the quality fields to act. Objects without them (room list entries)
 * already carry the overridden values, so applying again would be wrong for a DM
 * with an explicit name or avatar.
 */
export function getRoomNameWithOverride(meta: RoomMetaForOverride): string | undefined {
	const entry = getProfileOverride(meta.dm_user_id)
	if (entry && typeof entry.displayname === "string" && meta.name_quality !== undefined && meta.name_quality <= 1) {
		return entry.displayname
	}
	return meta.name
}

export function getRoomAvatarWithOverride(meta: RoomMetaForOverride): ContentURI | undefined {
	const entry = getProfileOverride(meta.dm_user_id)
	if (entry && hasField(entry, "avatar_url") && meta.explicit_avatar === false) {
		return entry.avatar_url ?? undefined
	}
	return meta.avatar
}

/*
 * The new account data content after setting (or, with null, clearing) one user's
 * overrides. Builds on the raw event so unknown users and fields other clients
 * wrote survive the rewrite. An empty entry is dropped rather than left behind.
 */
export function buildProfileOverridesUpdate(
	userID: UserID, fields: Partial<Record<string, unknown>>,
): { type: string, content: Record<string, unknown> } {
	if (sourceEncrypted) {
		throw new Error("these overrides are encrypted by another client, and this one can't edit them")
	}
	const content = { ...(sourceContent ?? {}) }
	const prevEntry = content[userID]
	const entry: Record<string, unknown> = prevEntry && typeof prevEntry === "object" && !Array.isArray(prevEntry)
		? { ...prevEntry } : {}
	for (const [field, value] of Object.entries(fields)) {
		if (value === undefined) {
			delete entry[field]
		} else {
			entry[field] = value
		}
	}
	if (Object.keys(entry).length === 0) {
		delete content[userID]
	} else {
		content[userID] = entry
	}
	return { type: sourceType, content }
}
