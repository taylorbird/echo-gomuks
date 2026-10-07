// gomuks - A Matrix client written in Go.
// Copyright (C) 2025 Tulir Asokan
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
import { MatrixCapabilities } from "matrix-widget-api"
import React, { use, useState } from "react"
import { ModalCloseContext } from "../modal"
import Toggle from "../util/Toggle.tsx"
import WidgetsIcon from "@/icons/widgets.svg?react"
import "./PermissionPrompt.css"
import "../modal/ConfirmModal.css"

export interface PermissionPromptWidget {
	name?: string
	url?: string
}

interface PermissionPromptProps {
	capabilities: Set<string>
	widget?: PermissionPromptWidget
	onConfirm: (approvedCapabilities: Set<string>) => void
}

// Capabilities that are complete on their own, with no event type parameter
const plainCapabilities: Record<string, string> = {
	[MatrixCapabilities.MSC2931Navigate]: "Open other rooms",
	[MatrixCapabilities.MSC3846TurnServers]: "Use your homeserver's call relay servers",
	[MatrixCapabilities.MSC4157SendDelayedEvent]: "Schedule messages",
	[MatrixCapabilities.MSC4157UpdateDelayedEvent]: "Change scheduled messages",
	[MatrixCapabilities.MSC4039UploadFile]: "Upload files",
	[MatrixCapabilities.MSC4039DownloadFile]: "Download files",
	"org.matrix.msc2762.timeline": "Read room history",
	"org.matrix.msc4515.rtc_transports": "Use your homeserver's call servers",
}

// Capabilities scoped to an event type, as the verb the label starts with
const scopedVerbs: Record<string, string> = {
	"org.matrix.msc2762.send.event": "Send",
	"org.matrix.msc2762.receive.event": "Read",
	"org.matrix.msc2762.send.state_event": "Change",
	"org.matrix.msc2762.receive.state_event": "Read",
	"org.matrix.msc3819.send.to_device": "Send device messages:",
	"org.matrix.msc3819.receive.to_device": "Receive device messages:",
}

const eventNouns: Record<string, string> = {
	"m.room.message": "messages",
	"m.room.message#m.text": "text messages",
	"m.room.message#m.emote": "emotes",
	"m.room.message#m.notice": "bot notices",
	"m.room.message#m.image": "images",
	"m.room.message#m.video": "videos",
	"m.room.message#m.audio": "audio",
	"m.room.message#m.file": "files",
	"m.reaction": "reactions",
	"m.room.redaction": "message removals",
	"m.sticker": "stickers",
	"m.room.encrypted": "encrypted messages",
	"m.room.name": "the room name",
	"m.room.topic": "the room topic",
	"m.room.avatar": "the room picture",
	"m.room.member": "room members",
	"m.room.power_levels": "member permissions",
	"m.room.create": "room details",
	"im.vector.modular.widgets": "widgets",
	"org.matrix.msc3401.call.member": "call participants",
	"m.call.member": "call participants",
}

// A plain-language label, plus the technical name it came from (shown underneath for anyone
// who wants to know exactly what is being granted).
function describeCapability(capability: string): { label: string, detail?: string } {
	if (plainCapabilities[capability]) {
		return { label: plainCapabilities[capability] }
	}
	const paramIdx = capability.indexOf(":")
	const capabilityID = paramIdx === -1 ? capability : capability.slice(0, paramIdx)
	const parameter = paramIdx === -1 ? "" : capability.slice(paramIdx + 1)
	const verb = scopedVerbs[capabilityID]
	if (!verb || !parameter) {
		return { label: capability }
	}
	// State event capabilities may pin a state key after a pipe
	const [eventType, stateKey] = parameter.split("|", 2)
	const noun = eventNouns[eventType] ?? eventType
	let label = `${verb} ${noun}`
	if (stateKey) {
		label += ` (${stateKey})`
	}
	return { label, detail: parameter }
}

function widgetHost(url?: string): string | undefined {
	if (!url) {
		return undefined
	}
	try {
		return new URL(url).hostname
	} catch {
		return undefined
	}
}

const PermissionPrompt = ({ capabilities, widget, onConfirm }: PermissionPromptProps) => {
	const [selected, setSelected] = useState<Set<string>>(() => new Set(capabilities))
	const closeModal = use(ModalCloseContext)

	const toggle = (capability: string) => {
		const next = new Set(selected)
		if (next.has(capability)) {
			next.delete(capability)
		} else {
			next.add(capability)
		}
		setSelected(next)
	}

	const onSubmit = (evt: React.FormEvent) => {
		evt.preventDefault()
		onConfirm(selected)
		closeModal()
	}

	const denyAll = () => {
		onConfirm(new Set())
		closeModal()
	}

	const host = widgetHost(widget?.url)
	const name = widget?.name || host || "This widget"
	return <form className="confirm-message-modal permission-prompt" onSubmit={onSubmit}>
		<h3>Allow this widget?</h3>
		<div className="permission-body">
			<div className="permission-widget">
				<WidgetsIcon className="permission-widget-icon"/>
				<div className="permission-widget-name">{name}</div>
				{host && host !== name && <div className="permission-widget-host">{host}</div>}
			</div>
			<div className="permission-list">
				<p className="permission-intro">It is asking to:</p>
				{Array.from(capabilities, (capability, i) => {
					const { label, detail } = describeCapability(capability)
					const id = `widget-permission-${i}`
					return <label key={capability} className="permission-item" htmlFor={id}>
						<span className="permission-text">
							<span className="permission-label">{label}</span>
							{detail && <code className="permission-detail">{detail}</code>}
						</span>
						<Toggle id={id} checked={selected.has(capability)} onChange={() => toggle(capability)}/>
					</label>
				})}
			</div>
		</div>
		<div className="confirm-buttons">
			<button type="button" className="permission-deny" onClick={denyAll}>Deny all</button>
			<button type="submit" className="permission-allow">
				{selected.size === capabilities.size ? "Allow" : "Allow selected"}
			</button>
		</div>
	</form>
}

export default PermissionPrompt
