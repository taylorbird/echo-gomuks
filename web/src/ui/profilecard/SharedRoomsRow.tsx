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
import { use, useEffect, useState } from "react"
import type Client from "@/api/client.ts"
import { getRoomAvatarThumbnailURL } from "@/api/media.ts"
import { getRoomNameWithOverride } from "@/api/profileoverrides.ts"
import type { DBRoom, UserID } from "@/api/types"
import MainScreenContext from "../MainScreenContext.ts"
import { SkeletonLine } from "../loading"
import { ModalCloseContext } from "../modal"
import CardRow from "./CardRow.tsx"

const PREVIEW_COUNT = 3

const RoomChip = ({ meta, onOpen }: { meta: DBRoom, onOpen: () => void }) => {
	const name = getRoomNameWithOverride(meta) ?? "Unnamed room"
	return <button className="card-chip" onClick={onOpen} title={`Open ${name}`}>
		<img className="avatar" src={getRoomAvatarThumbnailURL(meta)} alt="" loading="lazy"/>
		<span>{name}</span>
	</button>
}

const SharedRoomsRow = ({ client, userID }: { client: Client, userID: UserID }) => {
	const mainScreen = use(MainScreenContext)
	const closeCard = use(ModalCloseContext)
	const [rooms, setRooms] = useState<DBRoom[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	useEffect(() => {
		setRooms(null)
		setError(null)
		client.rpc.getMutualRooms(userID).then(
			resp => setRooms(resp.joined
				.map(roomID => client.store.rooms.get(roomID))
				.filter(room => room && !room.hidden)
				.map(room => room!.meta.current)),
			err => setError(`${err}`),
		)
	}, [client, userID])
	const openRoom = (roomID: string) => () => {
		closeCard()
		mainScreen.setActiveRoom(roomID)
	}
	let summary
	if (error) {
		summary = <span className="card-dim">Couldn't load: {error}</span>
	} else if (!rooms) {
		summary = <SkeletonLine width="60%"/>
	} else if (rooms.length === 0) {
		summary = <span className="card-dim">None</span>
	} else {
		summary = <>
			{rooms.slice(0, PREVIEW_COUNT).map(meta =>
				<RoomChip key={meta.room_id} meta={meta} onOpen={openRoom(meta.room_id)}/>)}
			{rooms.length > PREVIEW_COUNT && <span className="card-chip more">+{rooms.length - PREVIEW_COUNT}</span>}
		</>
	}
	const openSummary = rooms ? <span>{rooms.length} rooms</span> : undefined
	return <CardRow label="Shared rooms" summary={summary} openSummary={openSummary}>
		{rooms && rooms.length > PREVIEW_COUNT ? <div className="card-chip-list">
			{rooms.map(meta => <RoomChip key={meta.room_id} meta={meta} onOpen={openRoom(meta.room_id)}/>)}
		</div> : null}
	</CardRow>
}

export default SharedRoomsRow
