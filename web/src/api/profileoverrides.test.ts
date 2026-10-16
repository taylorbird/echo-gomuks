import { beforeEach, describe, expect, it } from "vitest"
import {
	PROFILE_OVERRIDES_STABLE,
	PROFILE_OVERRIDES_UNSTABLE,
	applyProfileOverride,
	buildProfileOverridesUpdate,
	canEditProfileOverrides,
	clearProfileOverrides,
	getProfileOverride,
	getRoomAvatarWithOverride,
	getRoomNameWithOverride,
	loadProfileOverrides,
	parseProfileOverrides,
} from "./profileoverrides.ts"
import { RoomNameQuality, UserID } from "./types"

const SARAH = "@sarah:example.org" as UserID
const ALEX = "@alex:example.com" as UserID

beforeEach(() => clearProfileOverrides())

describe("parseProfileOverrides", () => {
	it("reads the MSC's example", () => {
		const parsed = parseProfileOverrides({
			[SARAH]: { displayname: "Mum" },
			[ALEX]: {
				displayname: "Alex (accounting)",
				avatar_url: "mxc://example.org/SEsfnsuifSDFSSEF",
				"m.tz": null,
			},
		})
		expect(parsed.get(SARAH)).toEqual({ displayname: "Mum" })
		expect(parsed.get(ALEX)).toEqual({
			displayname: "Alex (accounting)", avatar_url: "mxc://example.org/SEsfnsuifSDFSSEF", "m.tz": null,
		})
	})

	it("ignores keys that aren't user IDs", () => {
		const parsed = parseProfileOverrides({
			"!room:example.org": { displayname: "nope" },
			"sarah": { displayname: "nope" },
			"@nocolon": { displayname: "nope" },
			[SARAH]: { displayname: "Mum" },
		})
		expect([...parsed.keys()]).toEqual([SARAH])
	})

	it("ignores fields of the wrong type, keeping the rest of the entry", () => {
		const parsed = parseProfileOverrides({
			[SARAH]: { displayname: 42, avatar_url: "https://example.org/a.png", "m.tz": "Europe/London" },
			[ALEX]: { avatar_url: { url: "mxc://example.org/x" }},
		})
		expect(parsed.get(SARAH)).toEqual({ "m.tz": "Europe/London" })
		// An EncryptedFile in a plaintext event is the wrong type, leaving nothing.
		expect(parsed.has(ALEX)).toBe(false)
	})

	it("parses the MSC4483 encrypted form to nothing", () => {
		expect(parseProfileOverrides({ encrypted: { iv: "a", ciphertext: "b", mac: "c" }}).size).toBe(0)
	})
})

describe("loadProfileOverrides", () => {
	it("prefers the stable type where both are present", () => {
		loadProfileOverrides({ [SARAH]: { displayname: "Stable" }}, { [SARAH]: { displayname: "Unstable" }})
		expect(getProfileOverride(SARAH)?.displayname).toBe("Stable")
		expect(buildProfileOverridesUpdate(ALEX, { displayname: "A" }).type).toBe(PROFILE_OVERRIDES_STABLE)
	})

	it("falls back to the unstable type and writes back to it", () => {
		loadProfileOverrides(undefined, { [SARAH]: { displayname: "Mum" }})
		expect(getProfileOverride(SARAH)?.displayname).toBe("Mum")
		expect(buildProfileOverridesUpdate(ALEX, { displayname: "A" }).type).toBe(PROFILE_OVERRIDES_UNSTABLE)
	})

	it("refuses to edit an encrypted event", () => {
		loadProfileOverrides(undefined, { encrypted: { iv: "a", ciphertext: "b", mac: "c" }})
		expect(canEditProfileOverrides()).toBe(false)
		expect(() => buildProfileOverridesUpdate(SARAH, { displayname: "Mum" })).toThrow()
	})
})

describe("applyProfileOverride", () => {
	it("returns the same object when there's no override", () => {
		const profile = { displayname: "Sarah" }
		expect(applyProfileOverride(SARAH, profile)).toBe(profile)
	})

	it("replaces fields, and null hides one", () => {
		loadProfileOverrides(undefined, { [SARAH]: { displayname: "Mum", avatar_url: null }})
		expect(applyProfileOverride(SARAH, {
			displayname: "Sarah",
			avatar_url: "mxc://example.org/real",
			avatar_file: { url: "mxc://example.org/enc" } as never,
		})).toEqual({ displayname: "Mum" })
	})

	it("works without a real profile", () => {
		loadProfileOverrides(undefined, { [SARAH]: { displayname: "Mum" }})
		expect(applyProfileOverride(SARAH, undefined)).toEqual({ displayname: "Mum" })
	})
})

describe("room name and avatar", () => {
	const dm = {
		dm_user_id: SARAH,
		name: "Sarah",
		name_quality: RoomNameQuality.Participants,
		avatar: "mxc://example.org/real",
		explicit_avatar: false,
	}

	beforeEach(() => loadProfileOverrides(undefined, {
		[SARAH]: { displayname: "Mum", avatar_url: "mxc://example.org/mum" },
	}))

	it("overrides a DM named after its member", () => {
		expect(getRoomNameWithOverride(dm)).toBe("Mum")
		expect(getRoomAvatarWithOverride(dm)).toBe("mxc://example.org/mum")
	})

	it("leaves a name and avatar the room set for itself", () => {
		const explicit = { ...dm, name: "Family", name_quality: RoomNameQuality.Explicit, explicit_avatar: true }
		expect(getRoomNameWithOverride(explicit)).toBe("Family")
		expect(getRoomAvatarWithOverride(explicit)).toBe("mxc://example.org/real")
	})

	it("doesn't apply twice to room list entries, which lack the quality fields", () => {
		const entry = { dm_user_id: SARAH, name: "Family", avatar: "mxc://example.org/real" }
		expect(getRoomNameWithOverride(entry)).toBe("Family")
		expect(getRoomAvatarWithOverride(entry)).toBe("mxc://example.org/real")
	})
})

describe("buildProfileOverridesUpdate", () => {
	it("keeps other users and fields other clients wrote", () => {
		loadProfileOverrides(undefined, {
			[SARAH]: { displayname: "Mum", "org.example.custom": 1 },
			[ALEX]: { displayname: "Alex" },
			"not-a-user": { kept: true },
		})
		const { content } = buildProfileOverridesUpdate(SARAH, { avatar_url: "mxc://example.org/mum" })
		expect(content).toEqual({
			[SARAH]: { displayname: "Mum", "org.example.custom": 1, avatar_url: "mxc://example.org/mum" },
			[ALEX]: { displayname: "Alex" },
			"not-a-user": { kept: true },
		})
	})

	it("drops a user's entry once it's empty", () => {
		loadProfileOverrides(undefined, { [SARAH]: { displayname: "Mum" }, [ALEX]: { displayname: "Alex" }})
		const { content } = buildProfileOverridesUpdate(SARAH, { displayname: undefined })
		expect(content).toEqual({ [ALEX]: { displayname: "Alex" }})
	})
})
