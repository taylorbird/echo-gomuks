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
import React, { use, useEffect, useRef, useState } from "react"
import type Client from "@/api/client.ts"
import { getAvatarThumbnailURLWithoutOverride } from "@/api/media.ts"
import { buildProfileOverridesUpdate, getProfileOverride } from "@/api/profileoverrides.ts"
import type { UserID, UserProfile } from "@/api/types"
import { getRealDisplayname } from "@/util/validation.ts"
import { ModalCloseContext } from "./contexts.ts"
import { PICTURE_ACCEPT, preparePicture, uploadAvatar } from "./uploadavatar.ts"
import AlertIcon from "@/icons/error.svg?react"
import "./ConfirmModal.css"
import "./ProfileEditor.css"
import "./ProfileOverrideEditor.css"

export type OverrideField = "name" | "picture"

interface ProfileOverrideEditorProps {
	client: Client
	userID: UserID
	// What they call themselves: the member event in the open room, else the global profile.
	realProfile?: UserProfile | null
	field: OverrideField
}

/*
 * MSC4529: your own name or picture for somebody else, shown in place of theirs on
 * every device you use. One pop-up per field, since a picture is found by looking
 * for "picture", not inside a nickname editor. Laid out like the profile editor.
 */
const ProfileOverrideEditor = ({ client, userID, realProfile, field }: ProfileOverrideEditorProps) => {
	const closeModal = use(ModalCloseContext)
	const fileInput = useRef<HTMLInputElement>(null)
	const override = getProfileOverride(userID)
	const origName = typeof override?.displayname === "string" ? override.displayname : ""
	const hasNameOverride = typeof override?.displayname === "string"
	const hasPictureOverride = override !== undefined && Object.hasOwn(override, "avatar_url")
	const [name, setName] = useState(origName)
	// A picked file waits here, previewed locally, until Save uploads it.
	const [newPicture, setNewPicture] = useState<{ file: File, preview: string } | null>(null)
	// Bumped on every pick so the file input starts empty again: picking the same
	// file twice, or after an error, must still fire a change.
	const [pickCount, setPickCount] = useState(0)
	const [saving, setSaving] = useState(false)
	// Which step a picture save is on, so the wait says what it's waiting for.
	const [uploading, setUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const realName = getRealDisplayname(userID, realProfile)

	const previewRef = useRef<string | null>(null)
	useEffect(() => () => {
		if (previewRef.current) {
			URL.revokeObjectURL(previewRef.current)
		}
	}, [])
	// Picked, dropped or pasted: every way in gets the same check.
	const acceptFile = async (file: File) => {
		setError(null)
		try {
			const preview = await preparePicture(file)
			if (previewRef.current) {
				URL.revokeObjectURL(previewRef.current)
			}
			previewRef.current = preview
			setNewPicture({ file, preview })
		} catch (err) {
			setError(err instanceof Error ? err.message : `${err}`)
		}
	}
	const onPickPicture = (evt: React.ChangeEvent<HTMLInputElement>) => {
		const file = evt.target.files?.[0]
		setPickCount(count => count + 1)
		if (file) {
			void acceptFile(file)
		}
	}

	// Drag a file in (from Finder or a screenshot tool's thumbnail). The webview gets
	// these drops itself: tauri.conf.json turns off Tauri's own drop handling.
	const [dropping, setDropping] = useState(false)
	const acceptsFiles = field === "picture" && !saving
	const hasFiles = (evt: React.DragEvent) => !!evt.dataTransfer?.types?.includes("Files")
	const onDragOver = (evt: React.DragEvent) => {
		if (acceptsFiles && hasFiles(evt)) {
			evt.preventDefault()
			evt.dataTransfer.dropEffect = "copy"
			setDropping(true)
		}
	}
	const onDragLeave = (evt: React.DragEvent) => {
		// Moving between the form's own children isn't leaving it.
		if (!evt.currentTarget.contains(evt.relatedTarget as Node | null)) {
			setDropping(false)
		}
	}
	const onDrop = (evt: React.DragEvent) => {
		if (!acceptsFiles || !hasFiles(evt)) {
			return
		}
		evt.preventDefault()
		setDropping(false)
		const file = evt.dataTransfer.files?.[0]
		if (file) {
			void acceptFile(file)
		}
	}
	// Paste too: most screenshot tools copy to the clipboard. Listened for on the
	// document, as nothing in this pop-up holds focus for a paste to land on.
	const acceptFileRef = useRef(acceptFile)
	acceptFileRef.current = acceptFile
	useEffect(() => {
		if (!acceptsFiles) {
			return
		}
		const onPaste = (evt: ClipboardEvent) => {
			const file = evt.clipboardData?.files?.[0]
			if (file) {
				evt.preventDefault()
				void acceptFileRef.current(file)
			}
		}
		document.addEventListener("paste", onPaste)
		return () => document.removeEventListener("paste", onPaste)
	}, [acceptsFiles])
	const trimmedName = name.trim()
	const changed = field === "name" ? trimmedName !== origName : newPicture !== null
	// undefined removes the field's override; a key left out keeps it as it is.
	const save = async (fields: Record<string, unknown>) => {
		setSaving(true)
		setError(null)
		try {
			const { type, content } = buildProfileOverridesUpdate(userID, fields)
			await client.rpc.setAccountData(type, content)
			closeModal()
		} catch (err) {
			setError(`Couldn't save: ${err instanceof Error ? err.message : err}`)
			setSaving(false)
		}
	}
	const onSubmit = async (evt: React.FormEvent) => {
		evt.preventDefault()
		if (!changed || saving) {
			return
		}
		if (field === "name") {
			await save({ displayname: trimmedName || undefined })
			return
		}
		setSaving(true)
		setUploading(true)
		let avatarURL: string
		try {
			// Unencrypted, as the account data event it goes in is. Encrypting it
			// would need MSC4483, which this client doesn't implement.
			avatarURL = await uploadAvatar(client, newPicture!.file)
		} catch (err) {
			setError(`Couldn't upload the picture: ${err instanceof Error ? err.message : err}`)
			setSaving(false)
			return
		} finally {
			setUploading(false)
		}
		await save({ avatar_url: avatarURL })
	}

	// The picture as it would look after Save: their own unless one is set or picked.
	const shownName = (field === "name" ? trimmedName : origName) || realName
	const pictureSrc = newPicture?.preview ?? getAvatarThumbnailURLWithoutOverride(userID, {
		displayname: shownName,
		avatar_url: hasPictureOverride ? override?.avatar_url ?? undefined : realProfile?.avatar_url,
	})
	const picture = <img src={pictureSrc} alt=""/>
	return <form
		className={`confirm-message-modal profile-editor profile-override-editor ${dropping ? "dropping" : ""}`}
		onSubmit={onSubmit}
		onDragOver={onDragOver}
		onDragLeave={onDragLeave}
		onDrop={onDrop}
	>
		<h3>{field === "name" ? "Override nickname" : "Override picture"} for {realName}</h3>
		<div className="profile-body">
			<div className="profile-avatar-column">
				{field === "picture" ? <>
					<button
						type="button"
						className="profile-avatar"
						onClick={() => fileInput.current?.click()}
						title="Choose a picture"
						disabled={saving}
					>
						{picture}
						{uploading
							? <span className="profile-avatar-busy">Uploading…</span>
							: dropping
								? <span className="profile-avatar-drop">Drop to use</span>
								: <span className="profile-avatar-hint">Change</span>}
					</button>
					<input
						key={pickCount}
						ref={fileInput}
						type="file"
						accept={PICTURE_ACCEPT}
						onChange={onPickPicture}
					/>
				</> : <div className="profile-avatar">{picture}</div>}
				<div className="profile-user-id">{userID}</div>
			</div>
			<div className="profile-fields">
				{field === "name" ? <>
					<label htmlFor="profile-override-name">Nickname</label>
					<input
						id="profile-override-name"
						type="text"
						value={name}
						placeholder={realName}
						disabled={saving}
						onChange={evt => setName(evt.target.value)}
						autoFocus
					/>
				</> : <>
					<button
						type="button"
						className="profile-override-choose"
						onClick={() => fileInput.current?.click()}
						disabled={saving}
					>{newPicture || hasPictureOverride ? "Choose another picture…" : "Choose a picture…"}</button>
					<div className="profile-note">
						Or drag one onto the picture, or paste a screenshot. PNG, JPEG, WebP or GIF.
					</div>
				</>}
			</div>
		</div>
		{error && <div className="profile-error">{error}</div>}
		<div className="profile-override-notice">
			<AlertIcon/>
			<p>
				{field === "name"
					? <>Only you see this name. {realName} and everyone else still see “{realName}”,
						and mentions you send use their real name.</>
					: <>Only you see this picture. {realName} and everyone else still see the one they chose.</>}
				{" "}It's saved to your account, which your homeserver can read.
			</p>
		</div>
		<div className="confirm-buttons">
			{field === "name" && hasNameOverride && <button
				type="button"
				className="profile-cancel profile-override-remove"
				onClick={() => save({ displayname: undefined })}
				disabled={saving}
			>Use their name</button>}
			{field === "picture" && hasPictureOverride && <button
				type="button"
				className="profile-cancel profile-override-remove"
				onClick={() => save({ avatar_url: undefined })}
				disabled={saving}
			>Use their picture</button>}
			<button type="button" className="profile-cancel" onClick={() => closeModal()} disabled={saving}>
				Cancel
			</button>
			<button type="submit" className="profile-save" disabled={!changed || saving}>
				{uploading ? "Uploading…" : saving ? "Saving…" : "Save"}
			</button>
		</div>
		{/* The shared SkeletonEdge is a faint 2px strip, easy to miss over a picture
		    upload that can take seconds; this one is in the accent colour. */}
		{saving ? <div className="profile-override-progress" aria-hidden="true"/> : null}
	</form>
}

export default ProfileOverrideEditor
