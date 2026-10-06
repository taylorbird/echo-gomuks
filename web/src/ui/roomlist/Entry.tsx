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
import React, { JSX, memo, use } from "react"
import { getRoomAvatarThumbnailURL, getSenderColor } from "@/api/media.ts"
import { type RoomListEntry, usePreference, useRoomMember } from "@/api/statestore"
import { type MemDBEvent, type MemberEventContent, type RoomID, RoomNameQuality } from "@/api/types"
import { getDisplayname } from "@/util/validation.ts"
import ClientContext from "../ClientContext.ts"
import MainScreenContext from "../MainScreenContext.ts"
import { MenuPositioner, RoomMenu } from "../menu"
import { ModalContext } from "../modal"
import UnreadCount from "./UnreadCount.tsx"
import MessagesSquareIcon from "@/icons/modern/messages-square.svg?react"
import UserIcon from "@/icons/modern/user.svg?react"
import UsersIcon from "@/icons/modern/users.svg?react"

export interface RoomListEntryProps {
	room: RoomListEntry
	isActive: boolean
	hidden: boolean
	hideAvatar?: boolean
}

function getPreviewText(
	roomID: RoomID,
	evt?: MemDBEvent,
	senderMemberEvt?: MemDBEvent | null,
): [string, JSX.Element | null] {
	if (!evt) {
		return ["", null]
	}
	const previewText = evt.local_content?.preview_text
	if (previewText) {
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const client = use(ClientContext)!
		const displayname = evt.sender === client.userID
			? "You"
			: getDisplayname(evt.sender, senderMemberEvt?.content as MemberEventContent)
		return [
			`${displayname}: ${previewText}`,
			<>
				<span
					className="sender-name bidi-isolate"
					// The room-aware sender colour, so the name in the preview is the same
					// colour it has over that person's messages inside the room. Safe to
					// read during render even though Entry is memo'd: the allocator is a
					// module-level cache backed by localStorage rather than React state, so
					// a room/user pair resolves to the same colour without a subscription.
					style={{ color: getSenderColor(roomID, evt.sender) }}
				>
					{displayname.length > 16 ? displayname.slice(0, 12) + "…" : displayname}
				</span>: {previewText}
			</>,
		]
	}
	return ["", null]
}

function renderEntry(
	room: RoomListEntry,
	hideAvatar: boolean | undefined,
	KindIcon: typeof UserIcon,
	previewSender: MemDBEvent | null | undefined,
	dmAsMention: boolean,
) {
	const [previewText, croppedPreviewText] = getPreviewText(room.room_id, room.preview_event, previewSender)

	const hasUnreads = Boolean(room.marked_unread
		|| room.unread_messages || room.unread_notifications || room.unread_highlights)
	return <>
		<div className="room-entry-left">
			<img
				loading="lazy"
				className="avatar room-avatar"
				src={getRoomAvatarThumbnailURL(room, undefined, hideAvatar)}
				alt=""
			/>
		</div>
		<div className="room-entry-right">
			<div className={`room-name ${hasUnreads ? "has-unreads" : ""}`}>
				<span className="room-name-text">{room.name}</span>
				<KindIcon className="room-kind-icon" />
			</div>
			{previewText && <div className="message-preview" title={previewText}>{croppedPreviewText}</div>}
		</div>
		<UnreadCount
			counts={room}
			asMention={dmAsMention && Boolean(room.dm_user_id)}
			placeholder={<div className="room-entry-unreads-placeholder" />}
		/>
	</>
}

const Entry = ({ room, isActive, hidden, hideAvatar }: RoomListEntryProps) => {
	const openModal = use(ModalContext)
	const mainScreen = use(MainScreenContext)
	const client = use(ClientContext)!
	const realRoom = client.store.rooms.get(room.room_id)
	const previewSender = useRoomMember(client, realRoom, room.preview_event?.sender)
	const dmAsMention = usePreference(client.store, null, "dm_mention_colors")

	const onContextMenu = (evt: React.MouseEvent<HTMLDivElement>) => {
		if (evt.shiftKey) {
			return
		}
		if (!realRoom) {
			// TODO implement separate menu for invite rooms
			console.error("Room state store not found for", room.room_id)
			return
		}
		openModal({
			content: <MenuPositioner
				x={evt.clientX}
				y={evt.clientY}
				anchor="click"
				Child={RoomMenu}
				room={realRoom}
				entry={room}
			/>,
			noHistory: true,
		})
		evt.preventDefault()
	}
	// What kind of conversation this is, shown as a glyph after the name:
	// a person for DMs, two people for an ad-hoc group whose name is just
	// its members' names ("X and Y" — name_quality Participants), chat
	// bubbles for rooms with a real name or alias. Meta is read without
	// subscribing — a stale glyph until the next list update is fine.
	let KindIcon = MessagesSquareIcon
	if (room.dm_user_id) {
		KindIcon = UserIcon
	} else if (realRoom?.meta.current.name_quality === RoomNameQuality.Participants) {
		KindIcon = UsersIcon
	}
	// Rendered unconditionally: this used to be gated on useContentVisibility,
	// but that hook needs `content-visibility: auto` on the row, which was
	// removed from the CSS because WebKit deferred repaints of the contained
	// rows (stale .active highlight for seconds after switching rooms).
	const classNames = ["room-entry"]
	if (isActive) {
		classNames.push("active")
	}
	if (hidden) {
		classNames.push("hidden")
	}
	if (room.favorite_order !== undefined) {
		classNames.push("favorite")
	}
	if (room.low_priority) {
		classNames.push("low-priority")
	}
	if (room.dm_user_id) {
		classNames.push("direct-chat")
	}
	if (room.is_invite) {
		classNames.push("invite")
	}
	return <div
		className={classNames.join(" ")}
		onClick={mainScreen.clickRoom}
		onContextMenu={onContextMenu}
		data-room-id={room.room_id}
	>
		{renderEntry(room, hideAvatar, KindIcon, previewSender, dmAsMention)}
	</div>
}

export default memo(Entry)
