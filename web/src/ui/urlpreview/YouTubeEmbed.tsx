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
import React, { useEffect, useRef, useState } from "react"
import { YouTubeLink } from "./youtube.ts"
import "./YouTubeEmbed.css"

interface OEmbed {
	title?: string
	author_name?: string
}

const oEmbedCache = new Map<string, Promise<OEmbed | null>>()

function fetchOEmbed(videoID: string): Promise<OEmbed | null> {
	let promise = oEmbedCache.get(videoID)
	if (!promise) {
		const watchURL = `https://www.youtube.com/watch?v=${videoID}`
		promise = fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchURL)}`)
			// YouTube answers errors (private/removed videos) with a plain-text body
			.then(res => res.ok ? res.json() as Promise<OEmbed> : null)
			.catch(() => null)
		oEmbedCache.set(videoID, promise)
	}
	return promise
}

// Stops whichever player is running. Only one plays at a time: starting another one, or
// the playing card leaving the timeline, unloads the old iframe and its memory with it.
let stopActivePlayer: (() => void) | null = null

const YouTubeEmbed = ({ link, fallback }: {
	link: YouTubeLink
	// Shown instead when YouTube has nothing for the video (removed, private, or unreachable)
	fallback?: React.ReactNode
}) => {
	const [meta, setMeta] = useState<OEmbed | null | undefined>(undefined)
	const [playing, setPlaying] = useState(false)
	const [thumbFailed, setThumbFailed] = useState(false)
	// Nothing goes to YouTube until the card is near the screen, so the timeline loading
	// messages you never scroll to doesn't tell YouTube about their videos.
	const [visible, setVisible] = useState(false)
	const cardRef = useRef<HTMLDivElement>(null)
	const stopRef = useRef(() => setPlaying(false))
	useEffect(() => {
		const card = cardRef.current
		if (visible || !card) {
			return
		}
		const observer = new IntersectionObserver(entries => {
			if (entries.some(entry => entry.isIntersecting)) {
				setVisible(true)
			}
		}, { rootMargin: "200px 0px" })
		observer.observe(card)
		return () => observer.disconnect()
	}, [visible])
	useEffect(() => {
		if (!visible) {
			return
		}
		let cancelled = false
		setMeta(undefined)
		setPlaying(false)
		fetchOEmbed(link.videoID).then(res => !cancelled && setMeta(res))
		return () => {
			cancelled = true
		}
	}, [link.videoID, visible])
	useEffect(() => {
		const stop = stopRef.current
		return () => {
			if (stopActivePlayer === stop) {
				stopActivePlayer = null
			}
		}
	}, [])
	const play = () => {
		if (stopActivePlayer !== stopRef.current) {
			stopActivePlayer?.()
		}
		stopActivePlayer = stopRef.current
		setPlaying(true)
	}
	if (meta === null) {
		return fallback ?? null
	}
	const id = encodeURIComponent(link.videoID)
	const startParam = link.start ? `&start=${link.start}` : ""
	const embedURL = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${startParam}`
	const title = meta?.title ?? "YouTube video"
	return <div className={`youtube-embed ${link.isShort ? "short" : ""}`} ref={cardRef}>
		<div className="youtube-embed-header">
			<span className="youtube-embed-source">{link.isMusic ? "YouTube Music" : "YouTube"}</span>
			<a className="youtube-embed-title" href={link.url} title={title} target="_blank" rel="noreferrer noopener">
				{meta ? title : " "}
			</a>
			{meta?.author_name && <span className="youtube-embed-author">{meta.author_name}</span>}
		</div>
		<div className="youtube-embed-frame">
			{playing
				? <iframe
					src={embedURL}
					title={title}
					allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
					referrerPolicy="strict-origin-when-cross-origin"
					// The player needs its own scripts and origin; popups let "Watch on YouTube" open.
					// Everything else (top navigation, forms, downloads) stays off.
					sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
					allowFullScreen
				/>
				: <button
					className="youtube-embed-poster"
					onClick={play}
					aria-label={`Play ${title}`}
				>
					{visible && !thumbFailed && <img
						src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
						alt=""
						onError={() => setThumbFailed(true)}
					/>}
					<span className="youtube-embed-play" aria-hidden="true">
						<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>
					</span>
				</button>}
		</div>
	</div>
}

export default React.memo(YouTubeEmbed)
