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
import React, { useLayoutEffect, useRef } from "react"
import { getSenderColor } from "@/api/media.ts"
import { getProfileOverride, useProfileOverrides } from "@/api/profileoverrides.ts"
import { MessageEventContent, UserID } from "@/api/types"
import { ensureString, getDisplayname, parseMatrixURI } from "@/util/validation.ts"
import EventContentProps from "./props.ts"

function isImageElement(elem: EventTarget): elem is HTMLImageElement {
	return (elem as HTMLImageElement).tagName === "IMG"
}

function isAnchorElement(elem: EventTarget): elem is HTMLAnchorElement {
	return (elem as HTMLAnchorElement).tagName === "A"
}

function isCheckbox(elem: EventTarget): elem is HTMLInputElement {
	return (elem as HTMLInputElement).tagName === "INPUT" && (elem as HTMLInputElement).type === "checkbox"
}

function onClickMatrixURI(href: string) {
	const  uri = parseMatrixURI(href)
	switch (uri?.identifier[0]) {
	case "@":
		return window.mainScreenContext.setRightPanel({
			type: "user",
			userID: uri.identifier,
		})
	case "!":
		return window.mainScreenContext.setActiveRoom(uri.identifier, {
			previewMeta: {
				via: uri.params.getAll("via"),
			},
			openEventID: uri?.eventID,
		})
	case "#":
		return window.client.rpc.resolveAlias(uri.identifier).then(
			res => window.mainScreenContext.setActiveRoom(res.room_id, {
				previewMeta: {
					alias: uri.identifier,
					via: res.servers.slice(0, 3),
				},
			}),
			err => window.alert(`Failed to resolve room alias ${uri.identifier}: ${err}`),
		)
	}
}

const onClickHTML = (evt: React.MouseEvent<HTMLDivElement>) => {
	const targetElem = evt.target as HTMLElement
	if (isImageElement(targetElem)) {
		window.openLightbox({
			src: targetElem.src,
			alt: targetElem.alt,
		})
	} else if (targetElem.closest?.("span.hicli-spoiler")?.classList.toggle("spoiler-revealed")) {
		// When unspoilering, don't trigger links and other clickables inside the spoiler
		evt.preventDefault()
		evt.stopPropagation()
	} else if (isAnchorElement(targetElem) && targetElem.href.startsWith("matrix:")) {
		onClickMatrixURI(targetElem.href)
		evt.preventDefault()
		evt.stopPropagation()
	} else if (isCheckbox(targetElem) && !targetElem.disabled) {
		targetElem.closest("div.html-body")?.querySelectorAll("input[type=checkbox]").forEach(elem => {
			(elem as HTMLInputElement).disabled = true
		})
		if (onHackyClickCheckbox(targetElem, targetElem.checked)) {
			evt.stopPropagation()
		} else {
			targetElem.checked = !targetElem.checked
		}
	}
}

const inputCheckboxRegex = /<input[^>]+type="checkbox"[^>]*>/g

function onHackyClickCheckbox(targetElem: HTMLInputElement, checked: boolean): boolean {
	const targetIdx = parseInt(targetElem.getAttribute("data-checkbox-index") ?? "")
	if (isNaN(targetIdx)) {
		return false
	}
	const evtID = targetElem.closest("div.timeline-event")?.getAttribute("data-event-id")
	const evt = window.activeRoomContext?.store.eventsByID.get(evtID ?? "")
	if (!evt || typeof evt.content.formatted_body !== "string") {
		return false
	}
	let idx = -1
	const newHTML = evt.content.formatted_body.replaceAll(inputCheckboxRegex, match => {
		idx++
		if (idx === targetIdx) {
			const unchecked = match.replace(/checked(?:="[^"]*")?/, "")
			if (checked) {
				return match.replace(/^<input/, "<input checked")
			}
			return unchecked
		}
		return match
	})
	window.client.sendMessage({
		relates_to: {
			rel_type: "m.replace",
			event_id: evt.event_id,
		},
		room_id: evt.room_id,
		text: "",
		base_content: {
			msgtype: "m.text",
			...evt.content,
			body: "",
			formatted_body: newHTML,
		},
	})
	return true
}

let mathImported = false

function importMath() {
	if (mathImported) {
		return
	}
	mathImported = true
	import("./math.ts").then(
		() => console.info("Imported math"),
		err => console.error("Failed to import math", err),
	)
}

function fallbackBodyForMedia(msgtype: string): string {
	switch (msgtype) {
	case "m.image":
		return "Sent an image"
	case "m.audio":
		return "Sent an audio file"
	case "m.video":
		return "Sent a video"
	case "m.file":
		return "Sent a file"
	case "m.location":
		return "Sent a location"
	default:
		return ""
	}
}

export const SanitizedHTMLView = ({ className, html }: { className?: string, html: string }) => {
	return <div
		className={`standalone-text html-body ${className ?? ""}`}
		onClick={onClickHTML}
		dangerouslySetInnerHTML={{ __html: html }}
	/>
}

const TextMessageBody = ({ event, sender }: EventContentProps) => {
	const content = event.content as MessageEventContent
	const htmlRef = useRef<HTMLDivElement>(null)
	const sanitizedHTML = event.local_content?.sanitized_html
	// User pills come from the backend as plain HTML, so React never sees who they point at. Give
	// each one the colour that person's name has in this room; the CSS tints the pill with it.
	// Pills naming you are skipped: they keep the red highlight from StylePreferences.
	const profileOverrides = useProfileOverrides()
	useLayoutEffect(() => {
		for (const pill of htmlRef.current?.querySelectorAll<HTMLAnchorElement>("a.hicli-matrix-uri-user") ?? []) {
			const userID = parseMatrixURI(pill.href)?.identifier
			// An MSC4529 nickname replaces the name the sender wrote, the way it does
			// everywhere else. The written text is kept on the pill so that removing
			// the nickname brings it back (React won't re-set this HTML on its own).
			const override = userID?.startsWith("@") ? getProfileOverride(userID as UserID)?.displayname : undefined
			if (typeof override === "string" && override) {
				pill.dataset.writtenText ??= pill.textContent ?? ""
				pill.textContent = override
			} else if (pill.dataset.writtenText !== undefined) {
				pill.textContent = pill.dataset.writtenText
				delete pill.dataset.writtenText
			}
			// The link text is usually a bare display name. When the sender's client already
			// wrote an "@" (or used the raw user ID), don't add a second one.
			pill.classList.toggle("mention-at", !pill.textContent?.trimStart().startsWith("@"))
			if (userID?.startsWith("@") && userID !== window.client.userID) {
				pill.style.setProperty("--mention-color", getSenderColor(event.room_id, userID))
			}
		}
	}, [sanitizedHTML, event.room_id, profileOverrides])
	const classNames = ["message-text"]
	let eventSenderName: string | undefined
	if (content.msgtype === "m.notice") {
		classNames.push("notice-message")
	} else if (content.msgtype === "m.emote") {
		classNames.push("emote-message")
		eventSenderName = getDisplayname(event.sender, sender?.content)
	}
	if (event.local_content?.big_emoji) {
		classNames.push("big-emoji-body")
	}
	if (event.local_content?.was_plaintext) {
		classNames.push("plaintext-body")
	}
	if (event.local_content?.has_math) {
		classNames.push("math-body")
		importMath()
	}
	if (event.local_content?.sanitized_html) {
		classNames.push("html-body")
		return <div
			ref={htmlRef}
			onClick={onClickHTML}
			className={classNames.join(" ")}
			data-event-sender={eventSenderName}
			dangerouslySetInnerHTML={{ __html: event.local_content.sanitized_html }}
		/>
	}
	return <div className={classNames.join(" ")} data-event-sender={eventSenderName}>
		{ensureString(content.body) || fallbackBodyForMedia(content.msgtype)}
	</div>
}

export default TextMessageBody
