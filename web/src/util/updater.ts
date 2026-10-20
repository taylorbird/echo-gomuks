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
import { isTauri, isTauriFFI } from "@/api/backend.ts"
import { stashReleaseNotes } from "./releasenotes.ts"
import Subscribable from "./subscribable.ts"

// "ready" means a new version is downloaded and staged — restarting applies it.
export type UpdateState = "idle" | "checking" | "downloading" | "ready"

// Only the packaged app can update itself: `npm run dev` runs against the Vite dev server
// (no bundle to replace), and the plain-web build has no Tauri IPC at all.
// Not on iOS (isTauriFFI): the app there has no updater plugin; updates come through the store.
const updatesSupported = isTauri && !isTauriFFI && import.meta.env.PROD

const updateStore = new Subscribable()
// useSyncExternalStore compares snapshots with Object.is, so the snapshot has to be a stable
// reference. Keeping the whole state in one string means getUpdateState can just return it.
let updateState: UpdateState = "idle"
let checkInProgress = false
/*
 * What the feed said about the staged release. Held separately from updateState rather than folded
 * into it because the state is a plain string, which is what makes it a stable useSyncExternalStore
 * snapshot; putting an object in that slot would hand out a fresh reference every render and spin.
 * It is always written before the state moves to "ready", so anything re-rendering on that
 * transition sees it already populated.
 */
let pendingUpdate: { version: string; notes: string } | null = null

export const getPendingUpdate = () => pendingUpdate

// How often to look again after a check finds nothing.
//
// A launch-only check is not enough: this app is one people leave open for days, so a release cut
// an hour after launch would never be noticed. That is not hypothetical — on 2026-08-27 a running
// copy sat on 0.3.5 for ninety minutes while three releases came and went, and every "just
// relaunch to get the fix" was really "your app cannot see the fix yet".
const RECHECK_INTERVAL_MS = 30 * 60 * 1000

function setUpdateState(state: UpdateState) {
	if (updateState === state) {
		return
	}
	updateState = state
	updateStore.notify()
}

export const subscribeToUpdateState = updateStore.subscribe
export const getUpdateState = (): UpdateState => updateState

// Fire-and-forget: any failure here (no network, malformed feed, bad signature) must leave the
// app exactly as it was, so everything is logged and swallowed rather than surfaced.
export async function checkForUpdates() {
	// Nothing to do once an update is staged, and never two checks at once.
	if (!updatesSupported || checkInProgress || updateState === "downloading" || updateState === "ready") {
		return
	}
	checkInProgress = true
	try {
		setUpdateState("checking")
		// Dynamic so the plugin module body only runs once we've decided we're in the packaged
		// app. (It doesn't keep the code out of the web bundle: vite's manualChunks sends every
		// non-splitDeps dependency to the eager `vendor` chunk. It's ~2KB, so that's fine.)
		const { check } = await import("@tauri-apps/plugin-updater")
		const update = await check()
		if (!update) {
			setUpdateState("idle")
			return
		}
		console.log("Update available:", update.version)
		setUpdateState("downloading")
		await update.downloadAndInstall()
		// `body` is the `notes` field of the updater feed. Absent on releases cut before notes
		// existed, and on any release where the notes file was empty.
		pendingUpdate = { version: update.version, notes: update.body ?? "" }
		// Stashed now rather than at restart time: the user may quit and reopen instead of using
		// the button, and the notes should still be waiting for them when they do.
		stashReleaseNotes(update.version, pendingUpdate.notes)
		setUpdateState("ready")
	} catch (err) {
		console.warn("Update check failed:", err)
		setUpdateState("idle")
	} finally {
		// Always cleared, so a failed check never permanently disables updating and the next
		// interval tick can try again.
		checkInProgress = false
	}
}

// Checks now, then keeps checking, so a copy left running for days still finds new releases.
export function startUpdateChecks(): () => void {
	if (!updatesSupported) {
		return () => {}
	}
	checkForUpdates()
	const timer = setInterval(checkForUpdates, RECHECK_INTERVAL_MS)
	return () => clearInterval(timer)
}

// The staged bundle only takes effect after a relaunch. The Rust side kills the gomuks sidecar
// before restarting — otherwise the old backend keeps port 29325 and serves the old frontend.
/*
 * Relaunches the app for a reason that has nothing to do with updates.
 *
 * Deliberately NOT restartToApply: that one is gated on `updatesSupported`, which is
 * `isTauri && import.meta.env.PROD`, because an unpackaged build has no bundle to swap.
 * A plain relaunch has no such requirement, and the state that needs it most — the backend
 * session pass running out after 24 hours — happens in dev constantly. Reusing the update
 * helper would make the button silently do nothing in exactly the build where it is needed.
 *
 * The underlying command is still restart_for_update (lib.rs): it kills the sidecar and calls
 * app.restart(), which is the whole job. Renaming it is a Rust change plus two ACL entries
 * (build.rs AppManifest and capabilities/default.json), so the name stays and this comment
 * explains why it is being called from here.
 */
export function restartApp() {
	if (!isTauri) {
		window.location.reload()
		return
	}
	invoke("restart_for_update").catch(err => {
		console.error("Failed to restart:", err)
		window.alert(
			"echo couldn't relaunch itself.\n\nQuit echo and open it again.\n\n" + `(${err})`,
		)
	})
}

export function restartToApply() {
	if (!updatesSupported) {
		return
	}
	// Not swallowed into console.error: the update is already installed on disk by this point, so
	// a failure here means the button does nothing at all and the user has no way to know why.
	// That is exactly how the ACL denial of this command survived into a release — the production
	// window loads the sidecar origin, which tauri treats as remote, and remote origins have every
	// app command denied unless a capability grants it (see build.rs). Say something instead.
	invoke("restart_for_update").catch(err => {
		console.error("Failed to restart for update:", err)
		window.alert(
			"The update is installed, but echo couldn't relaunch itself automatically.\n\n" +
			"Quit echo and open it again to finish updating.\n\n" +
			`(${err})`,
		)
	})
}
