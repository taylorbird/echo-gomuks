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
import React, { JSX, use, useState } from "react"
import type Client from "@/api/client.ts"
import { RoomStateStore, useRoomState } from "@/api/statestore"
import type { MemDBEvent, MembershipAction, PowerLevelEventContent, UserID } from "@/api/types"
import { getEventLevel, getUserLevel } from "@/util/powerlevel.ts"
import { getPowerLevels } from "../menu/util.ts"
import { BulkRedactModal, ConfirmWithMessageModal, ModalContext } from "../modal"
import CardRow from "./CardRow.tsx"

const ROLES = [
	{ level: 0, name: "Member" },
	{ level: 50, name: "Moderator" },
	{ level: 100, name: "Admin" },
] as const

function roleName(level: number): string {
	if (level === Infinity) {
		return "Creator"
	}
	return ROLES.findLast(role => level >= role.level)?.name ?? "Member"
}

const MEMBERSHIP_LABELS: Record<string, string> = {
	join: "",
	invite: "Invited",
	knock: "Asked to join",
	leave: "Not in this room",
	ban: "Banned",
}

interface RoomRowProps {
	client: Client
	room: RoomStateStore
	userID: UserID
	member: MemDBEvent | null
}

/*
 * Their standing in the room the card was opened from, and the moderation you're
 * allowed to do there. The checks and confirmation pop-ups are the side panel's
 * (UserModeration.tsx); only the layout is new.
 */
const RoomRow = ({ client, room, userID, member }: RoomRowProps) => {
	const openModal = use(ModalContext)
	const [redactRemaining, setRedactRemaining] = useState(0)
	const [pendingLevel, setPendingLevel] = useState<number | null>(null)
	const [customLevel, setCustomLevel] = useState(false)
	const [savingLevel, setSavingLevel] = useState(false)
	useRoomState(room, "m.room.power_levels")
	const [pls, ownPL, createEvent] = getPowerLevels(room, client)
	const theirPL = getUserLevel(pls, createEvent, userID)
	const membership = member?.content.membership ?? "leave"
	const isSelf = userID === client.userID
	const hasPL = (action: "invite" | "kick" | "ban" | "redact") =>
		ownPL >= (pls[action] ?? (action === "invite" ? 0 : 50))
		&& (action === "redact" || action === "invite" || ownPL > theirPL)
	const canSetLevel = theirPL !== Infinity
		&& ownPL >= getEventLevel(pls, "m.room.power_levels", true)
		&& (ownPL > theirPL || pls.users?.[userID] === undefined || isSelf)

	const confirmMembership = (action: MembershipAction) => () => {
		const callback = (reason: string, redact?: boolean) =>
			client.rpc.setMembership(room.roomID, userID, action, reason, action === "ban" && redact)
		let content: JSX.Element
		if (action === "ban") {
			const [count, nonStateCount, redactCallback] = makeRedactor(callback)
			content = <BulkRedactModal
				userID={userID}
				evtCount={count}
				nonStateEvtCount={nonStateCount}
				isBanModal={true}
				onConfirm={redactCallback}
			/>
		} else {
			const title = action.charAt(0).toUpperCase() + action.slice(1)
			content = <ConfirmWithMessageModal
				title={`${title} user`}
				description={<>Are you sure you want to {action} <code>{userID}</code>?</>}
				placeholder="Reason (optional)"
				confirmButton={title}
				onConfirm={callback}
			/>
		}
		openModal({ dimmed: true, boxed: true, content })
	}
	const makeRedactor = (banCallback?: (reason: string, redact?: boolean) => Promise<unknown>) => {
		const eligible = room.timelineCache.filter((evt): evt is MemDBEvent =>
			evt !== null && evt.room_id === room.roomID && evt.sender === userID && !evt.redacted_by)
		const nonState = eligible.filter(evt => evt.state_key === undefined)
		const callback = async (doRedact: boolean, preserveState: boolean, reason: string) => {
			await banCallback?.(reason, doRedact)
			if (!doRedact) {
				return
			}
			const targets = preserveState ? nonState : eligible
			let remaining = targets.length
			setRedactRemaining(remaining)
			for (const evt of targets) {
				await client.rpc.redactEvent(evt.room_id, evt.event_id, reason)
				remaining--
				setRedactRemaining(remaining)
			}
			return true
		}
		return [eligible.length, nonState.length, callback] as const
	}
	const openRedactRecent = () => {
		const [count, nonStateCount, callback] = makeRedactor()
		openModal({
			dimmed: true,
			boxed: true,
			content: <BulkRedactModal
				userID={userID}
				evtCount={count}
				nonStateEvtCount={nonStateCount}
				isBanModal={false}
				onConfirm={callback}
			/>,
		})
	}
	const saveLevel = () => {
		if (pendingLevel === null || pendingLevel === theirPL) {
			return
		}
		const updated: PowerLevelEventContent = { ...pls }
		if (pendingLevel === (pls.users_default ?? 0)) {
			if (updated.users) {
				updated.users = { ...updated.users }
				delete updated.users[userID]
			}
		} else {
			updated.users = { ...(pls.users ?? {}), [userID]: pendingLevel }
		}
		setSavingLevel(true)
		client.rpc.setState(room.roomID, "m.room.power_levels", "", updated).then(
			() => {
				setPendingLevel(null)
				setCustomLevel(false)
			},
			err => window.alert(`Couldn't change their power level: ${err}`),
		).finally(() => setSavingLevel(false))
	}

	const shownLevel = pendingLevel ?? theirPL
	const onSelectLevel = (evt: React.ChangeEvent<HTMLSelectElement>) => {
		if (evt.target.value === "custom") {
			setCustomLevel(true)
			setPendingLevel(theirPL)
		} else {
			setCustomLevel(false)
			setPendingLevel(Number(evt.target.value))
		}
	}
	const isPreset = ROLES.some(role => role.level === shownLevel)
	// You can't hand out more power than you have.
	const roles = ROLES.filter(role => role.level <= ownPL || role.level === theirPL)

	const actions: JSX.Element[] = []
	if ((membership === "knock" || membership === "leave") && hasPL("invite")) {
		actions.push(<button key="invite" className="card-btn" onClick={confirmMembership("invite")}>
			{membership === "knock" ? "Let them in" : "Invite"}
		</button>)
	}
	if (hasPL("redact") || (isSelf && ownPL >= getEventLevel(pls, "m.room.redaction"))) {
		actions.push(<button
			key="redact"
			className="card-btn"
			onClick={openRedactRecent}
			disabled={redactRemaining > 0}
		>{redactRemaining > 0 ? `${redactRemaining} left to remove` : "Remove recent messages"}</button>)
	}
	if (["join", "invite", "knock"].includes(membership) && hasPL("kick")) {
		const label = membership === "join" ? "Kick" : membership === "invite" ? "Cancel invite" : "Turn down"
		actions.push(<button key="kick" className="card-btn danger" onClick={confirmMembership("kick")}>
			{label}
		</button>)
	}
	if (hasPL("ban")) {
		actions.push(membership === "ban"
			? <button key="unban" className="card-btn" onClick={confirmMembership("unban")}>Unban</button>
			: <button key="ban" className="card-btn danger" onClick={confirmMembership("ban")}>Ban</button>)
	}

	const status = MEMBERSHIP_LABELS[membership] ?? membership
	const summary = <>
		{status && <span>{status}</span>}
		{membership !== "ban" && <span className={status ? "card-dim" : undefined}>
			{status ? "· " : ""}{roleName(theirPL)}
		</span>}
		{theirPL !== Infinity && <span className="card-dim">&#183; power {theirPL}</span>}
	</>
	if (!canSetLevel && actions.length === 0) {
		return <CardRow label="In this room" summary={summary}/>
	}
	return <CardRow label="In this room" summary={summary}>
		{canSetLevel && <div className="card-power">
			<label htmlFor="card-power-level">Role</label>
			<select
				id="card-power-level"
				value={customLevel || !isPreset ? "custom" : String(shownLevel)}
				onChange={onSelectLevel}
				disabled={savingLevel}
			>
				{roles.map(role => <option key={role.level} value={role.level}>{role.name} ({role.level})</option>)}
				<option value="custom">{isPreset || customLevel ? "Custom…" : `Custom (${shownLevel})`}</option>
			</select>
			{(customLevel || !isPreset) && <input
				type="number"
				aria-label="Power level"
				value={shownLevel}
				max={Math.min(ownPL, Number.MAX_SAFE_INTEGER)}
				disabled={savingLevel}
				onChange={evt => {
					const value = evt.target.valueAsNumber
					if (!isNaN(value)) {
						setPendingLevel(Math.min(value, ownPL))
					}
				}}
			/>}
			{pendingLevel !== null && pendingLevel !== theirPL && <button
				className="card-btn primary"
				onClick={saveLevel}
				disabled={savingLevel}
			>Save</button>}
		</div>}
		{actions.length > 0 && <div className="card-detail-actions">{actions}</div>}
	</CardRow>
}

export default RoomRow
