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
export interface YouTubeLink {
	videoID: string
	start?: number
	isMusic: boolean
	// Shorts are portrait, so they get a tall frame instead of the 16:9 one
	isShort: boolean
	url: string
}

const VIDEO_ID_RE = /^[\w-]{6,20}$/

// Accepts a YouTube "t"/"start" value: plain seconds ("90", "90s") or "1h2m3s".
function parseTimestamp(value: string | null): number | undefined {
	if (!value) {
		return undefined
	}
	if (/^\d+s?$/.test(value)) {
		return parseInt(value)
	}
	const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
	if (!match || !match[0]) {
		return undefined
	}
	return (parseInt(match[1] ?? "0") * 3600) + (parseInt(match[2] ?? "0") * 60) + parseInt(match[3] ?? "0")
}

export function parseYouTubeLink(url: string): YouTubeLink | null {
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		return null
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return null
	}
	const host = parsed.hostname.toLowerCase()
	const isYouTubeHost = host === "youtube.com" || host.endsWith(".youtube.com")
	let videoID: string | undefined
	if (host === "youtu.be") {
		videoID = parsed.pathname.slice(1).split("/")[0]
	} else if (isYouTubeHost && parsed.pathname === "/watch") {
		videoID = parsed.searchParams.get("v") ?? undefined
	} else if (isYouTubeHost) {
		const match = parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)
		videoID = match?.[1]
	}
	if (!videoID || !VIDEO_ID_RE.test(videoID)) {
		return null
	}
	return {
		videoID,
		start: parseTimestamp(parsed.searchParams.get("t") ?? parsed.searchParams.get("start")),
		isMusic: host === "music.youtube.com",
		isShort: isYouTubeHost && parsed.pathname.startsWith("/shorts/"),
		url,
	}
}
