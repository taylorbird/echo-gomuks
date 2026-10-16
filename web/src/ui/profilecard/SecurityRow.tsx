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
import { useEffect, useState, useTransition } from "react"
import type Client from "@/api/client.ts"
import type { RoomStateStore } from "@/api/statestore"
import type { ProfileDevice, ProfileEncryptionInfo, TrustState, UserID } from "@/api/types"
import { SkeletonLine } from "../loading"
import CardRow from "./CardRow.tsx"
import EncryptedOffIcon from "@/icons/encrypted-off.svg?react"
import EncryptedQuestionIcon from "@/icons/encrypted-question.svg?react"
import EncryptedIcon from "@/icons/encrypted.svg?react"

// Same wording as the side panel's device list (UserInfoDeviceList.tsx).
function trustStateDescription(state: TrustState, hasCSKeys: boolean): string {
	switch (state) {
	case "blacklisted":
		return "Device has been blacklisted manually"
	case "device-key-mismatch":
		return "Device has illegally changed its signing key"
	case "unverified":
		return hasCSKeys ? "Device has not been verified by cross-signing keys" : "No cross-signing keys were found"
	case "verified":
		return "Device was verified manually"
	case "cross-signed-untrusted":
		return "Device is cross-signed, cross-signing keys are NOT trusted"
	case "cross-signed-tofu":
		return "Device is cross-signed, cross-signing keys were trusted on first use"
	case "cross-signed-verified":
		return "Device is cross-signed, cross-signing keys were verified manually"
	default:
		return "Invalid trust state"
	}
}

function deviceIcon(state: TrustState) {
	if (state === "blacklisted" || state === "device-key-mismatch") {
		return EncryptedOffIcon
	} else if (state === "cross-signed-untrusted" || state === "unverified") {
		return EncryptedQuestionIcon
	}
	return EncryptedIcon
}

// A long list (some people have fifteen) would push the rest of the card away.
const DEVICE_PREVIEW = 4

const Device = ({ device, hasCSKeys }: { device: ProfileDevice, hasCSKeys: boolean }) => {
	const Icon = deviceIcon(device.trust_state)
	return <li className={`card-device trust-${device.trust_state}`}>
		<span className="card-device-icon" title={trustStateDescription(device.trust_state, hasCSKeys)}><Icon/></span>
		<span className="card-device-name">{device.name || device.device_id}</span>
		<code className="card-device-id">{device.device_id}</code>
	</li>
}

interface SecurityRowProps {
	client: Client
	room?: RoomStateStore
	userID: UserID
}

const SecurityRow = ({ client, room, userID }: SecurityRowProps) => {
	const [info, setInfo] = useState<ProfileEncryptionInfo | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [pending, startTransition] = useTransition()
	const [showAllDevices, setShowAllDevices] = useState(false)
	useEffect(() => {
		setInfo(null)
		setError(null)
		client.rpc.getProfileEncryptionInfo(userID).then(
			resp => {
				setInfo(resp)
				setError(resp.errors?.join(", ") || null)
			},
			err => setError(`${err}`),
		)
	}, [client, userID])
	const track = (trustKey?: string) => startTransition(async () => {
		try {
			const resp = trustKey
				? await client.rpc.resetMasterKeyTOFU(userID, trustKey)
				: await client.rpc.trackUserDevices(userID)
			startTransition(() => {
				setInfo(resp)
				setError(resp.errors?.join(", ") || null)
			})
		} catch (err) {
			startTransition(() => setError(`${err}`))
		}
	})

	if (!info) {
		return <CardRow
			label="Security"
			summary={error ? <span className="card-dim">Couldn't load: {error}</span> : <SkeletonLine width="55%"/>}
		/>
	}
	if (!info.devices_tracked) {
		return <CardRow label="Security" summary={<span className="card-dim">Devices not tracked</span>}>
			<p className="card-detail-text">
				echo isn't tracking this person's devices, so it can't tell you whether to trust them.
			</p>
			<div className="card-detail-actions">
				<button className="card-btn" onClick={() => track()} disabled={pending}>Start tracking devices</button>
			</div>
		</CardRow>
	}

	let trust
	if (info.user_trusted) {
		trust = <span className="card-trust verified"><EncryptedIcon/>Verified</span>
	} else if (info.master_key && info.master_key === info.first_master_key) {
		trust = <span className="card-trust tofu"><EncryptedIcon/>Trusted on first use</span>
	} else if (info.master_key) {
		trust = <span className="card-trust changed"><EncryptedQuestionIcon/>Their key changed</span>
	} else {
		trust = <span className="card-trust none"><EncryptedQuestionIcon/>No cross-signing keys</span>
	}
	const keyChanged = !info.user_trusted && info.master_key && info.master_key !== info.first_master_key
	const isEncrypted = room?.meta.current.encryption_event?.algorithm === "m.megolm.v1.aes-sha2"
	const deviceCount = `${info.devices.length} device${info.devices.length === 1 ? "" : "s"}`
	return <CardRow
		label="Security"
		summary={<>{trust}<span className="card-dim">&#183; {deviceCount}</span></>}
		defaultOpen={!!keyChanged}
	>
		{room && <p className="card-detail-text">
			Messages in this room {isEncrypted ? "are" : "are not"} end-to-end encrypted.
		</p>}
		{keyChanged && <p className="card-detail-text warning">
			Their master key isn't the one echo first saw. Trust it only if you know they reset their keys.
		</p>}
		{info.master_key && <div className="card-master-key">
			<span>Master key</span>
			<code>{info.master_key}</code>
		</div>}
		<ul className="card-devices">
			{(showAllDevices ? info.devices : info.devices.slice(0, DEVICE_PREVIEW)).map(dev =>
				<Device key={dev.device_id} device={dev} hasCSKeys={!!info.master_key}/>)}
		</ul>
		{info.devices.length > DEVICE_PREVIEW && <button
			className="profile-card-link"
			onClick={() => setShowAllDevices(!showAllDevices)}
		>{showAllDevices ? "Show fewer" : `Show all ${info.devices.length} devices`}</button>}
		{error && <p className="card-detail-text warning">{error}</p>}
		<div className="card-detail-actions">
			{keyChanged && <button className="card-btn" onClick={() => track(info.master_key)} disabled={pending}>
				Trust the new key
			</button>}
			<button className="card-btn" onClick={() => track()} disabled={pending}>Reload devices</button>
		</div>
	</CardRow>
}

export default SecurityRow
