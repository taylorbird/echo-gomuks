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
import { invoke } from "@tauri-apps/api/core"
import { UnlistenFn, listen } from "@tauri-apps/api/event"
import RPCClient from "./rpc.ts"
import type { MediaMessageEventContent, RPCCommand } from "./types"

// What the native side emits for every event the backend produces. `data` is the
// backend's JSON, passed through as text so Rust never has to parse it.
interface FFIEvent {
	command: string
	request_id: number
	data: string
}

/*
 * The backend linked into the app itself (echo on iOS): gomuks's C FFI, reached through
 * Tauri commands, with its events arriving as Tauri events. Same protocol as the
 * websocket, so everything above RPCClient is unchanged. Media and URL previews are
 * served by the app's gomuks:// URL scheme instead (see BACKEND_URL).
 */
export default class TauriFFIClient extends RPCClient {
	public readonly rpcMediaUpload = true
	protected isConnected = false
	#unlisten?: UnlistenFn

	async start() {
		// Listen first: starting the backend immediately sends the client state.
		this.#unlisten = await listen<FFIEvent>("gomuks-event", evt => {
			this.onCommand({
				command: evt.payload.command,
				request_id: evt.payload.request_id,
				data: evt.payload.data ? JSON.parse(evt.payload.data) : null,
			} as RPCCommand)
		})
		try {
			await invoke("gomuks_start")
			this.isConnected = true
			this.connect.emit({ connected: true, reconnecting: false, error: null })
		} catch (err) {
			this.connect.emit({ connected: false, reconnecting: false, error: `${err}` })
		}
	}

	// The in-app backend has no web login of its own to pass.
	async doAuth(): Promise<void> {}

	async stop() {
		this.#unlisten?.()
		this.#unlisten = undefined
		this.isConnected = false
	}

	protected send(data: RPCCommand) {
		const request_id = data.request_id ?? 0
		invoke<[string, string]>("gomuks_command", {
			command: data.command,
			data: JSON.stringify(data.data ?? {}),
		}).then(
			([command, resp]) => this.onCommand({
				command,
				request_id,
				data: resp ? JSON.parse(resp) : null,
			} as RPCCommand),
			err => this.onCommand({ command: "error", request_id, data: `${err}` } as RPCCommand),
		)
	}

	async uploadMedia(file: Blob, filename: string, encrypt: boolean): Promise<MediaMessageEventContent> {
		// Raw bytes as the request body: a JSON array of numbers would be several times larger.
		const bytes = new Uint8Array(await file.arrayBuffer())
		const [command, resp] = await invoke<[string, string]>("gomuks_upload", bytes, {
			headers: { "X-Gomuks-Params": JSON.stringify({ filename, encrypt }) },
		})
		if (command !== "response") {
			throw new Error(resp ? JSON.parse(resp) : "upload failed")
		}
		return JSON.parse(resp)
	}
}
