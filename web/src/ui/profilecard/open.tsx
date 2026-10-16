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
import type { UserID } from "@/api/types"
import { RoomContext } from "../roomview/roomcontext.ts"
import ProfileCard from "./ProfileCard.tsx"

/*
 * Opens someone's profile card over whatever is on screen. It goes in the
 * nestable layer so the pop-ups it opens (nickname, kick and ban confirmations)
 * stack above it in the outer layer, and closing those leaves the card open.
 */
export function openProfileCard(userID: UserID) {
	// Opened from the timeline or the member list, so the open room is where they were seen.
	const roomCtx = window.activeRoomContext
	window.openNestableModal({
		dimmed: true,
		boxed: true,
		boxClass: "profile-card-box",
		content: <RoomContext value={roomCtx}>
			<ProfileCard key={userID} userID={userID} roomCtx={roomCtx}/>
		</RoomContext>,
	})
}
