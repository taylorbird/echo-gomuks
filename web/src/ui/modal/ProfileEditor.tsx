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
import React, { use, useEffect, useRef, useState } from "react"
import type Client from "@/api/client.ts"
import { getAvatarThumbnailURL } from "@/api/media.ts"
import type { ContentURI } from "@/api/types"
import { SkeletonEdge } from "../loading"
import { ModalCloseContext } from "./contexts.ts"
import { PICTURE_ACCEPT, preparePicture, uploadAvatar } from "./uploadavatar.ts"
import "./ConfirmModal.css"
import "./ProfileEditor.css"

interface ProfileEditorProps {
	client: Client
}

/*
 * Your own name, picture and bio, editable from the sidebar avatar with or without
 * a room open. Before this, the only editor lived in a room's side panel, and the
 * account-wide profile could only be viewed as raw JSON.
 */
const ProfileEditor = ({ client }: ProfileEditorProps) => {
	const closeModal = use(ModalCloseContext)
	const fileInput = useRef<HTMLInputElement>(null)
	const [loaded, setLoaded] = useState(false)
	const [origName, setOrigName] = useState("")
	const [origBio, setOrigBio] = useState("")
	const [origAvatar, setOrigAvatar] = useState<ContentURI | undefined>(undefined)
	const [name, setName] = useState("")
	const [bio, setBio] = useState("")
	// A picked file waits here, previewed locally, until Save uploads it.
	const [newAvatar, setNewAvatar] = useState<{ file: File, preview: string } | null>(null)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		client.rpc.getProfile(client.userID).then(resp => {
			const displayname = typeof resp.profile.displayname === "string" ? resp.profile.displayname : ""
			setOrigName(displayname)
			setName(displayname)
			setOrigAvatar(resp.profile.avatar_url)
			setOrigBio(resp.bio?.edit_source ?? "")
			setBio(resp.bio?.edit_source ?? "")
			setLoaded(true)
		}, err => {
			setError(`Couldn't load your profile: ${err}`)
			setLoaded(true)
		})
	}, [client])
	useEffect(() => () => {
		if (newAvatar) {
			URL.revokeObjectURL(newAvatar.preview)
		}
	}, [newAvatar])

	const onPickAvatar = async (evt: React.ChangeEvent<HTMLInputElement>) => {
		const file = evt.target.files?.[0]
		if (!file) {
			return
		}
		setError(null)
		try {
			// The previous preview is revoked by the effect above when this replaces it.
			setNewAvatar({ file, preview: await preparePicture(file) })
		} catch (err) {
			setError(err instanceof Error ? err.message : `${err}`)
		}
	}
	const changed = name.trim() !== origName || bio !== origBio || newAvatar !== null
	const onSubmit = async (evt: React.FormEvent) => {
		evt.preventDefault()
		if (!changed || saving) {
			return
		}
		setSaving(true)
		setError(null)
		try {
			let avatarURL = origAvatar
			if (newAvatar) {
				avatarURL = await uploadAvatar(client, newAvatar.file)
				await client.rpc.setProfileField("avatar_url", avatarURL)
			}
			const trimmedName = name.trim()
			if (trimmedName !== origName) {
				await client.rpc.setProfileField("displayname", trimmedName || undefined)
			}
			if (bio !== origBio) {
				// The backend's own bio field: it keeps the text as typed and stores the
				// rendered version alongside it.
				await client.rpc.setProfileField("_gomuks_bio", bio || undefined)
			}
			// The sidebar avatar reads this, so it updates without waiting for a sync.
			client.profile.emit({ ...client.profile.current, displayname: trimmedName, avatar_url: avatarURL })
			closeModal()
		} catch (err) {
			setError(`Couldn't save your profile: ${err instanceof Error ? err.message : err}`)
			setSaving(false)
		}
	}

	const avatarSrc = newAvatar?.preview
		?? getAvatarThumbnailURL(client.userID, { displayname: name || origName, avatar_url: origAvatar })
	return <form className="confirm-message-modal profile-editor" onSubmit={onSubmit}>
		<h3>Your profile</h3>
		<div className="profile-body">
			<div className="profile-avatar-column">
				<button
					type="button"
					className="profile-avatar"
					onClick={() => fileInput.current?.click()}
					title="Choose a new picture"
					disabled={!loaded || saving}
				>
					<img src={avatarSrc} alt=""/>
					<span className="profile-avatar-hint">Change</span>
				</button>
				<input ref={fileInput} type="file" accept={PICTURE_ACCEPT} onChange={onPickAvatar} value=""/>
				<div className="profile-user-id">{client.userID}</div>
			</div>
			<div className="profile-fields">
				<label htmlFor="profile-display-name">Display name</label>
				<input
					id="profile-display-name"
					type="text"
					value={name}
					placeholder={client.userID}
					disabled={!loaded || saving}
					onChange={evt => setName(evt.target.value)}
					autoFocus
				/>
				<label htmlFor="profile-bio">Bio</label>
				<textarea
					id="profile-bio"
					value={bio}
					rows={4}
					placeholder="A few words about you"
					disabled={!loaded || saving}
					onChange={evt => setBio(evt.target.value)}
				/>
				<div className="profile-note">Shown to everyone, in every room.</div>
			</div>
		</div>
		{error && <div className="profile-error">{error}</div>}
		<div className="confirm-buttons">
			<button type="button" className="profile-cancel" onClick={closeModal} disabled={saving}>Cancel</button>
			<button type="submit" className="profile-save" disabled={!changed || saving}>Save</button>
		</div>
		{saving || !loaded ? <SkeletonEdge /> : null}
	</form>
}

export default ProfileEditor
