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
import { BACKEND_CREDENTIALS, BACKEND_URL } from "@/api/backend.ts"
import type Client from "@/api/client.ts"
import type { ContentURI, MediaMessageEventContent } from "@/api/types"

// Uploads unencrypted, as a profile picture has to be readable by everyone.
export async function uploadAvatar(client: Client, file: File): Promise<ContentURI> {
	let media: MediaMessageEventContent
	if (client.rpc.rpcMediaUpload) {
		media = await client.rpc.uploadMedia(file, file.name, false)
	} else {
		const params = new URLSearchParams([["encrypt", "false"], ["progress", "false"], ["filename", file.name]])
		const resp = await fetch(`${BACKEND_URL}_gomuks/upload?${params.toString()}`, {
			method: "POST",
			body: file,
			headers: { "Content-Type": file.type },
			credentials: BACKEND_CREDENTIALS,
		})
		media = await resp.json()
		if (!resp.ok) {
			throw new Error((media as { error?: string }).error ?? resp.statusText)
		}
	}
	if (!media.url) {
		throw new Error("the upload returned no address")
	}
	return media.url
}

// Formats the homeserver can thumbnail and every client can show. SVG is left out
// on purpose: it uploads fine, but the server can't thumbnail it, so it showed as
// a letter tile everywhere small (seen 2026-10-16 with an icon file).
export const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
export const PICTURE_ACCEPT = PICTURE_TYPES.join(",")

const TYPE_NAMES: Record<string, string> = {
	"image/svg+xml": "an SVG",
	"image/heic": "a HEIC photo",
	"image/heif": "a HEIF photo",
	"image/x-icon": "an icon file",
	"image/vnd.microsoft.icon": "an icon file",
	"image/x-icns": "a Mac icon file",
	"image/tiff": "a TIFF",
	"image/bmp": "a BMP",
	"image/avif": "an AVIF",
}

function describeType(type: string): string {
	if (!type) {
		return "not a picture echo can use"
	}
	return TYPE_NAMES[type] ?? (type.startsWith("image/") ? "a picture format echo can't use" : "not a picture")
}

/*
 * Checks a picked file before it's previewed or uploaded: an allowed type, and
 * actually decodable. Returns an object URL for the preview, which the caller
 * revokes. Throws an Error whose message can be shown as is.
 */
export async function preparePicture(file: File): Promise<string> {
	if (!PICTURE_TYPES.includes(file.type)) {
		throw new Error(`${file.name} is ${describeType(file.type)}. Choose a PNG, JPEG, WebP or GIF.`)
	}
	const url = URL.createObjectURL(file)
	try {
		const img = new Image()
		img.src = url
		await img.decode()
	} catch {
		URL.revokeObjectURL(url)
		throw new Error(`echo couldn't read ${file.name} as a picture. It may be damaged.`)
	}
	return url
}
