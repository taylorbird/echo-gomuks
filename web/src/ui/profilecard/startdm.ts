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
import type Client from "@/api/client.ts"
import type { RoomID, UserID } from "@/api/types"
import type { MainScreenContextFields } from "../MainScreenContext.ts"

export function findDMRoom(client: Client, userID: UserID): RoomID | undefined {
	for (const room of client.store.rooms.values()) {
		if (room.meta.current.dm_user_id === userID) {
			return room.roomID
		}
	}
}

/*
 * Opens the existing DM, or makes one. The side panel's StartDMButton does the
 * same: encrypted if they have devices, and a pause for the new room to sync.
 */
export async function startDM(client: Client, mainScreen: MainScreenContextFields, userID: UserID) {
	const existing = findDMRoom(client, userID)
	if (existing) {
		mainScreen.setActiveRoom(existing)
		return
	}
	let encrypt = false
	try {
		encrypt = (await client.rpc.trackUserDevices(userID)).devices.length > 0
	} catch (err) {
		console.warn("Failed to check user encryption status:", err)
	}
	const response = await client.rpc.createRoom({
		is_direct: true,
		preset: "trusted_private_chat",
		invite: [userID],
		initial_state: encrypt ? [{ type: "m.room.encryption", content: { algorithm: "m.megolm.v1.aes-sha2" }}] : [],
	})
	// FIXME same workaround as StartDMButton: the room takes a moment to come down /sync
	setTimeout(() => mainScreen.setActiveRoom(response.room_id), 1000)
}
