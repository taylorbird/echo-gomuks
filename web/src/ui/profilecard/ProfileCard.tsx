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
import React, { use, useCallback, useEffect, useRef, useState } from "react"
import { getAvatarURL } from "@/api/media.ts"
import { getProfileOverride, useProfileOverrides } from "@/api/profileoverrides.ts"
import {
	RoomStateStore,
	fakeGomuksSender,
	maybeRedactMemberEvent,
	useAccountData,
	useRoomMember,
} from "@/api/statestore"
import type { GetProfileResponse, IgnoredUsersEventContent, PronounSet, UserID } from "@/api/types"
import { ensureArray, ensureString, getDisplayname, getRealDisplayname } from "@/util/validation.ts"
import ClientContext from "../ClientContext.ts"
import MainScreenContext from "../MainScreenContext.ts"
import { SkeletonBlock, SkeletonLine } from "../loading"
import { LightboxContext, ModalCloseContext, ModalContext, modals } from "../modal"
import ProfileEditor from "../modal/ProfileEditor.tsx"
import ProfileOverrideEditor, { OverrideField } from "../modal/ProfileOverrideEditor.tsx"
import type { RoomContextData } from "../roomview/roomcontext.ts"
import { EventKind } from "../settings/devtools-util.ts"
import { SanitizedHTMLView } from "../timeline/content/TextMessageBody.tsx"
import RoomRow from "./RoomRow.tsx"
import SecurityRow from "./SecurityRow.tsx"
import SharedRoomsRow from "./SharedRoomsRow.tsx"
import { findDMRoom, startDM } from "./startdm.ts"
import ChatIcon from "@/icons/chat.svg?react"
import CheckIcon from "@/icons/check.svg?react"
import CloseIcon from "@/icons/close.svg?react"
import CopyIcon from "@/icons/copy.svg?react"
import EditIcon from "@/icons/edit.svg?react"
import LinkIcon from "@/icons/modern/link.svg?react"
import MoreIcon from "@/icons/more.svg?react"
import PictureIcon from "@/icons/person.svg?react"
import "./ProfileCard.css"

interface ProfileCardProps {
	userID: UserID
	// The room it was opened from, if any: its member event and moderation.
	roomCtx?: RoomContextData
}

function localTime(tz: string): string | null {
	try {
		return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: tz })
			.format(new Date())
	} catch {
		return null
	}
}

interface CopyButtonProps {
	text: string
	label: string
	Icon: React.FunctionComponent<React.SVGProps<SVGSVGElement>>
}

// A small button beside the data it copies. Shows a tick for a moment so a
// silent clipboard write still reads as done.
const CopyButton = ({ text, label, Icon }: CopyButtonProps) => {
	const [copied, setCopied] = useState(false)
	useEffect(() => {
		if (!copied) {
			return
		}
		const timeout = setTimeout(() => setCopied(false), 1500)
		return () => clearTimeout(timeout)
	}, [copied])
	const onClick = () => navigator.clipboard.writeText(text).then(
		() => setCopied(true),
		err => window.alert(`Couldn't copy: ${err}`),
	)
	return <button
		className={`profile-card-copy ${copied ? "copied" : ""}`}
		onClick={onClick}
		title={copied ? "Copied" : label}
		aria-label={copied ? "Copied" : label}
	>{copied ? <CheckIcon/> : <Icon/>}</button>
}

// Their clock, ticking over on the minute.
const LocalTime = ({ tz }: { tz: string }) => {
	const [time, setTime] = useState(() => localTime(tz))
	useEffect(() => {
		let interval: ReturnType<typeof setInterval> | undefined
		const timeout = setTimeout(() => {
			setTime(localTime(tz))
			interval = setInterval(() => setTime(localTime(tz)), 60_000)
		}, 60_000 - Date.now() % 60_000)
		return () => interval ? clearInterval(interval) : clearTimeout(timeout)
	}, [tz])
	if (!time) {
		return null
	}
	return <div className="profile-card-time" title={tz}>
		<b>{time}</b> for them<br/>{tz.replaceAll("_", " ")}
	</div>
}

/*
 * The person behind a name: who they are on the left, what you can do on the
 * right. Replaces the side panel's user view, which on a laptop put every action
 * below a 236px picture.
 */
const ProfileCard = ({ userID, roomCtx }: ProfileCardProps) => {
	const client = use(ClientContext)!
	const mainScreen = use(MainScreenContext)
	const closeCard = use(ModalCloseContext)
	const openModal = use(ModalContext)
	const openLightbox = use(LightboxContext)
	const room: RoomStateStore | undefined = roomCtx?.store
	useProfileOverrides()
	const memberEvt = useRoomMember(client, room, userID)
	const member = maybeRedactMemberEvent(memberEvt)
	const [profileResp, setProfileResp] = useState<GetProfileResponse | null>(null)
	const [profileError, setProfileError] = useState<string | null>(null)
	const [menuOpen, setMenuOpen] = useState(false)
	const [bioOpen, setBioOpen] = useState(false)
	const [dmPending, setDMPending] = useState(false)
	const ignored = useAccountData(client.store, "m.ignored_user_list") as IgnoredUsersEventContent | null
	const menuRef = useRef<HTMLDivElement>(null)
	const isSelf = userID === client.userID
	const isFake = userID === fakeGomuksSender

	const loadProfile = useCallback(() => {
		if (isFake) {
			return
		}
		client.rpc.getProfile(userID).then(setProfileResp, err => setProfileError(`${err}`))
	}, [client, userID, isFake])
	useEffect(() => {
		setProfileResp(null)
		setProfileError(null)
		loadProfile()
	}, [loadProfile])
	useEffect(() => {
		if (!menuOpen) {
			return
		}
		const close = (evt: MouseEvent) => {
			if (!menuRef.current?.contains(evt.target as Node)) {
				setMenuOpen(false)
			}
		}
		document.addEventListener("mousedown", close)
		return () => document.removeEventListener("mousedown", close)
	}, [menuOpen])

	const globalProfile = profileResp?.profile
	const realProfile = member ?? globalProfile
	const loading = !realProfile && !profileError && !isFake
	const displayname = getDisplayname(userID, realProfile)
	const realName = getRealDisplayname(userID, realProfile)
	const override = getProfileOverride(userID)
	const nameOverridden = typeof override?.displayname === "string"
	const pictureOverridden = override !== undefined && Object.hasOwn(override, "avatar_url")
	const tzOverride = override?.["m.tz"]
	const tz = typeof tzOverride === "string" ? tzOverride
		: tzOverride === null ? ""
			: ensureString(globalProfile?.["m.tz"] ?? globalProfile?.["us.cloke.msc4175.tz"])
	const pronouns = (ensureArray(globalProfile?.["io.fsky.nyx.pronouns"]) as PronounSet[])
		.map(set => ensureString(set.summary)).filter(Boolean).join(", ")
	const bioHTML = profileResp?.bio?.html
	const hasDM = !isSelf && !!findDMRoom(client, userID)
	const isIgnored = !!ignored?.ignored_users?.[userID]

	const openOverrideEditor = (field: OverrideField) => openModal({
		dimmed: true,
		boxed: true,
		boxClass: "profile-override-box",
		content: <ProfileOverrideEditor client={client} userID={userID} realProfile={realProfile} field={field}/>,
	})
	const onMessage = () => {
		// Making a new DM invites them, so ask first, as the side panel did. Going to
		// an existing one stays a single click.
		if (!hasDM && !window.confirm(`Start a chat with ${realName}? This sends them an invite.`)) {
			return
		}
		setDMPending(true)
		startDM(client, mainScreen, userID).then(
			() => closeCard(),
			err => {
				setDMPending(false)
				window.alert(`Couldn't start a chat: ${err}`)
			},
		)
	}
	const onEditOwnProfile = () => {
		closeCard()
		openModal({ dimmed: true, boxed: true, content: <ProfileEditor client={client}/> })
	}
	const toggleIgnore = () => {
		const users = { ...(ignored?.ignored_users ?? {}) }
		if (isIgnored) {
			delete users[userID]
		} else {
			if (!window.confirm(`Ignore ${realName}? You won't see their messages or invites.`)) {
				return
			}
			users[userID] = {}
		}
		client.rpc.setAccountData("m.ignored_user_list", { ...(ignored ?? {}), ignored_users: users }).catch(
			err => window.alert(`Couldn't ${isIgnored ? "unignore" : "ignore"} ${realName}: ${err}`),
		)
	}

	const avatarURL = getAvatarURL(userID, realProfile)
	return <div className="profile-card" role="dialog" aria-label={`Profile of ${displayname}`}>
		<div className="profile-card-header">
			<span className="profile-card-title">User profile</span>
			{/* No event passed on: the modal's close handler ignores clicks that didn't
			    land on the backdrop itself, which is every click on this icon. */}
			<button className="profile-card-close" onClick={() => closeCard()} title="Close" aria-label="Close">
				<CloseIcon/>
			</button>
		</div>
		<div className="profile-card-body">
			<div className="profile-card-identity">
				{loading ? <SkeletonBlock className="profile-card-avatar"/> : <button
					className="profile-card-avatar"
					onClick={() => openLightbox({ src: avatarURL, alt: displayname })}
					title="View full size"
				>
					{/* Full resolution, as the side panel's big avatar was: it's 120px across,
					    and the server can't thumbnail every format (an SVG override showed
					    as a letter tile here). */}
					<img src={avatarURL} alt=""/>
				</button>}
				{pictureOverridden && <span
					className="profile-card-override-word"
					title="Your picture for them. Only you see it."
				>[override]</span>}
				{tz && <LocalTime tz={tz}/>}
			</div>
			<div className="profile-card-details">
				<div className="profile-card-names">
					{loading ? <SkeletonLine width="60%"/> : <div className="profile-card-name-line">
						<h2 className="profile-card-name">{displayname}</h2>
						{nameOverridden && <span
							className="profile-card-override-word"
							title={`Your nickname for them. They go by ${realName}.`}
						>[override]</span>}
					</div>}
					<div className="profile-card-uid">
						<span>{userID}</span>
						<CopyButton text={userID} label="Copy user ID" Icon={CopyIcon}/>
						<CopyButton
							text={`https://matrix.to/#/${userID}`}
							label="Copy link to profile"
							Icon={LinkIcon}
						/>
					</div>
					{pronouns && <div className="profile-card-pronouns">{pronouns}</div>}
					{profileError && !realProfile && <div className="profile-card-error">
					Couldn't load their profile: {profileError}
					</div>}
				</div>
				{bioHTML && <div className={`profile-card-bio ${bioOpen ? "open" : ""}`}>
					<SanitizedHTMLView html={bioHTML}/>
					<button className="profile-card-link" onClick={() => setBioOpen(!bioOpen)}>
						{bioOpen ? "Less" : "More"}
					</button>
				</div>}
				{!isFake && <div className="profile-card-actions">
					{isSelf ? <button className="card-btn primary" onClick={onEditOwnProfile}>
						<EditIcon/>Edit profile
					</button> : <>
						<button className="card-btn primary" onClick={onMessage} disabled={dmPending}>
							<ChatIcon/>{dmPending ? "Starting…" : hasDM ? "Message" : "Start chat"}
						</button>
						<button className="card-btn" onClick={() => openOverrideEditor("name")}>
							<EditIcon/>{nameOverridden ? "Change nickname" : "Nickname"}
						</button>
						<button className="card-btn" onClick={() => openOverrideEditor("picture")}>
							<PictureIcon/>{pictureOverridden ? "Change picture" : "Picture"}
						</button>
					</>}
					<div className="profile-card-more" ref={menuRef}>
						<button
							className={`card-btn icon ${menuOpen ? "active" : ""}`}
							onClick={() => setMenuOpen(!menuOpen)}
							title="Technical details"
							aria-label="Technical details"
							aria-expanded={menuOpen}
						><MoreIcon/></button>
						{menuOpen && <div className="profile-card-menu" role="menu">
							{globalProfile && <button role="menuitem" onClick={() => {
								setMenuOpen(false)
								openModal(modals.jsonView(globalProfile))
							}}>View global profile</button>}
							{memberEvt && room && <button role="menuitem" onClick={() => {
								setMenuOpen(false)
								openModal(modals.roomStateExplorer(room, EventKind.State, "m.room.member", userID))
							}}>View member event</button>}
						</div>}
					</div>
				</div>}
				{isFake ? <p className="profile-card-note">
				This isn't a real account. echo's backend uses it for messages it sends itself, such as
				command responses.
				</p> : <div className="profile-card-rows">
					{!isSelf && <SharedRoomsRow client={client} userID={userID}/>}
					<SecurityRow client={client} room={room} userID={userID}/>
					{room && <RoomRow client={client} room={room} userID={userID} member={memberEvt}/>}
				</div>}
				{!isFake && !isSelf && <div className="profile-card-footer">
					<button className={`profile-card-link ${isIgnored ? "" : "danger"}`} onClick={toggleIgnore}>
						{isIgnored ? `Stop ignoring ${realName}` : `Ignore ${realName}`}
					</button>
				</div>}
			</div>
		</div>
	</div>
}

export default ProfileCard
