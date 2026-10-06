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
import React, { useEffect, useState } from "react"
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

const YouTubeEmbed = ({ link }: { link: YouTubeLink }) => {
	const [meta, setMeta] = useState<OEmbed | null | undefined>(undefined)
	const [playing, setPlaying] = useState(false)
	const [thumbFailed, setThumbFailed] = useState(false)
	useEffect(() => {
		let cancelled = false
		setMeta(undefined)
		setPlaying(false)
		fetchOEmbed(link.videoID).then(res => !cancelled && setMeta(res))
		return () => {
			cancelled = true
		}
	}, [link.videoID])
	// Removed or private videos have no oEmbed; fall back to a normal link
	if (meta === null) {
		return null
	}
	const id = encodeURIComponent(link.videoID)
	const startParam = link.start ? `&start=${link.start}` : ""
	const embedURL = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${startParam}`
	const title = meta?.title ?? "YouTube video"
	return <div className="youtube-embed">
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
					allowFullScreen
				/>
				: <button
					className="youtube-embed-poster"
					onClick={() => setPlaying(true)}
					aria-label={`Play ${title}`}
				>
					{!thumbFailed && <img
						src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
						alt=""
						loading="lazy"
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
