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
import React, { use } from "react"
import { getRoomAvatarThumbnailURL, getRoomAvatarURL } from "@/api/media.ts"
import { getRoomNameWithOverride, useProfileOverrides } from "@/api/profileoverrides.ts"
import { RoomStateStore } from "@/api/statestore"
import { getModalStyleFromButton } from "@/ui/menu"
import { useEventAsState } from "@/util/eventdispatcher.ts"
import MainScreenContext from "../MainScreenContext.ts"
import { LightboxContext, NestableModalContext, modals } from "../modal"
import { RightPanelType } from "../rightpanel/RightPanel.tsx"
import BackIcon from "@/icons/modern/arrow-left.svg?react"
import NotificationsIcon from "@/icons/modern/bell.svg?react"
import CodeIcon from "@/icons/modern/code.svg?react"
import WidgetIcon from "@/icons/modern/layout-grid.svg?react"
import MoreIcon from "@/icons/modern/more-horizontal.svg?react"
import PinIcon from "@/icons/modern/pin.svg?react"
import SearchIcon from "@/icons/modern/search.svg?react"
import SettingsIcon from "@/icons/modern/settings.svg?react"
import PeopleIcon from "@/icons/modern/users.svg?react"
import "./RoomViewHeader.css"

interface RoomViewHeaderProps {
	room: RoomStateStore
	/** Type of the currently open right panel, so its opener button can show as active. */
	activePanel?: RightPanelType | null
}

const RoomViewHeader = ({ room, activePanel }: RoomViewHeaderProps) => {
	const roomMeta = useEventAsState(room.meta)
	// A DM named after its member shows that member's MSC4529 nickname.
	useProfileOverrides()
	const roomName = getRoomNameWithOverride(roomMeta) ?? roomMeta.room_id
	const mainScreen = use(MainScreenContext)
	const openNestableModal = use(NestableModalContext)
	const openSettings = () => {
		openNestableModal(modals.settings(room))
	}
	const openRoomStateExplorer = () => {
		openNestableModal(modals.roomStateExplorer(room))
	}
	const buttonCount = 5
	// The opener for whichever panel is showing gets the same active treatment as a
	// selected room-list entry, so the header says which panel slid in.
	const activeClass = (panel: RightPanelType) => activePanel === panel ? "active" : undefined
	const makeButtons = (titles?: boolean)  => {
		return <>
			<button
				className={activeClass("pinned-messages")}
				aria-pressed={activePanel === "pinned-messages"}
				data-target-panel="pinned-messages"
				data-close-nestable-modal={titles}
				onClick={mainScreen.clickRightPanelOpener}
				title="Pinned Messages"
			><PinIcon/>{titles && "Pinned Messages"}</button>
			<button
				className={activeClass("members")}
				aria-pressed={activePanel === "members"}
				data-target-panel="members"
				data-close-nestable-modal={titles}
				onClick={mainScreen.clickRightPanelOpener}
				title="Room Members"
			><PeopleIcon/>{titles && "Room Members"}</button>
			<button
				className={activeClass("widgets")}
				aria-pressed={activePanel === "widgets"}
				data-target-panel="widgets"
				data-close-nestable-modal={titles}
				onClick={mainScreen.clickRightPanelOpener}
				title="Widgets in room"
			><WidgetIcon/>{titles && "Widgets in room"}</button>
			<button
				className={activeClass("notifications")}
				aria-pressed={activePanel === "notifications"}
				data-target-panel="notifications"
				data-close-nestable-modal={titles}
				onClick={mainScreen.clickRightPanelOpener}
				title="Notification Center"
			><NotificationsIcon />{titles && "Notification Center"}</button>
			<button
				className={activeClass("search")}
				aria-pressed={activePanel === "search"}
				data-target-panel="search"
				data-close-nestable-modal={titles}
				onClick={mainScreen.clickRightPanelOpener}
				title="Search"
			><SearchIcon />{titles && "Search"}</button>
			<button title="Open devtools" onClick={openRoomStateExplorer}>
				<CodeIcon/>{titles && "Open devtools"}
			</button>
			<button title="Room Settings" onClick={openSettings}>
				<SettingsIcon/>{titles && "Room Settings"}
			</button>
		</>
	}
	const openButtonContextMenu = (evt: React.MouseEvent<HTMLButtonElement>) => {
		openNestableModal({
			content: <div className="context-menu" style={getModalStyleFromButton(evt.currentTarget, buttonCount * 16)}>
				{makeButtons(true)}
			</div>,
		})
	}
	// Drag regions: with titleBarStyle "Overlay" the webview covers the titlebar, so the
	// window can only be moved by elements that opt in. Tauri's injected handler only
	// treats the bare attribute as a drag region when the mousedown target IS that element
	// (src/window/scripts/drag.js), so this one covers the header's own background - the
	// padding and the flex gaps - and buttons inside stay clickable. The title block opts
	// in with "deep" instead, since its children are plain text with nothing to click.
	return <div className="room-header" data-tauri-drag-region>
		<button className="back" onClick={mainScreen.clearActiveRoom}><BackIcon/></button>
		<img
			className="avatar"
			loading="lazy"
			src={getRoomAvatarThumbnailURL(roomMeta)}
			data-full-src={getRoomAvatarURL(roomMeta)}
			onClick={use(LightboxContext)}
			alt=""
		/>
		<div className="room-name-and-topic" data-tauri-drag-region="deep">
			<div
				className="room-name"
				title={roomName}
			>
				{roomName}
			</div>
			{/* Both lines are clipped to one line with an ellipsis, so the full text
			    is only reachable on hover. */}
			{roomMeta.topic && <div className="room-topic" title={roomMeta.topic}>
				{roomMeta.topic}
			</div>}
		</div>
		<div className="right-buttons big-screen">{makeButtons()}</div>
		<div className="right-buttons small-screen">
			<button onClick={openButtonContextMenu}><MoreIcon/></button>
		</div>
	</div>
}

export default RoomViewHeader
