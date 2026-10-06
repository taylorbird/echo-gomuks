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
import { use } from "react"
import { getRoomAvatarThumbnailURL } from "@/api/media.ts"
import { type RoomListEntry, usePreference } from "@/api/statestore"
import ClientContext from "../ClientContext.ts"
import MainScreenContext from "../MainScreenContext.ts"
import UnreadCount from "./UnreadCount.tsx"
import "./RoomList.css"

// Enough to catch the conversations waiting on you without pushing the spaces down the rail.
const MAX_RAIL_DMS = 3

interface RailDMsProps {
	// Already filtered to unread rooms, oldest first (the room list's own order).
	unreadRooms: RoomListEntry[]
	// Inside an open space's drawer the tiles lead its sub-filters, closed off by the
	// drawer's own lighter rule; at the head of the rail a full rule does that job.
	placement: "rail" | "drawer"
}

/*
 * Unread direct messages as tiles, newest first, so a waiting DM is one click
 * away whichever space is open. A tile leaves once the DM is read. Invites stay
 * in the room list: they need a decision, not a glance.
 *
 * The tiles never take the glow pill: it marks the one active view, and a DM
 * tile is a shortcut into a room, not a place to stand.
 */
const RailDMs = ({ unreadRooms, placement }: RailDMsProps) => {
	const mainScreen = use(MainScreenContext)
	const client = use(ClientContext)!
	const dmAsMention = usePreference(client.store, null, "dm_mention_colors")
	/*
	 * Opening a space slides the previous drawer shut, which carries these tiles up
	 * under a cursor that was aimed at the space tile above. The second click of a
	 * double-click then opens a DM nobody chose, and opening it marks it read.
	 * RoomList.css also makes the tiles unclickable while a drawer is closing.
	 */
	const onClick = (evt: React.MouseEvent) => {
		if (evt.detail > 1) {
			return
		}
		mainScreen.clickRoom(evt)
	}
	const dms: RoomListEntry[] = []
	for (let i = unreadRooms.length - 1; i >= 0 && dms.length < MAX_RAIL_DMS; i--) {
		const room = unreadRooms[i]
		if (room.dm_user_id && !room.is_invite) {
			dms.push(room)
		}
	}
	if (!dms.length) {
		return null
	}
	return <>
		{dms.map(room => <div
			key={room.room_id}
			className="space-entry rail-dm"
			onClick={onClick}
			data-room-id={room.room_id}
			title={room.name}
		>
			<UnreadCount counts={room} space={true} asMention={dmAsMention}/>
			<img src={getRoomAvatarThumbnailURL(room)} alt={room.name} className="avatar"/>
		</div>)}
		<div className={placement === "rail" ? "space-bar-divider" : "space-sub-divider"}/>
	</>
}

export default RailDMs
