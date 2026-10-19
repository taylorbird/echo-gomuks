// TEMPORARY (reaction tooltip / room list scroll bug, 2026-10-08): prints
// messages sent from src/debug-scroll.ts into the vite (tauri dev) stdout.
import type { Plugin } from "vite"

const debugSink: Plugin = {
	name: "echo-debug-sink",
	configureServer(server) {
		server.ws.on("echo:debug", (data: unknown) => {
			console.log("[echo-debug]", JSON.stringify(data))
		})
	},
}

export default debugSink
