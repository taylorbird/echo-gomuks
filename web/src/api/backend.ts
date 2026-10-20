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
//
// Where the gomuks backend lives, as a prefix for the relative _gomuks URLs used
// everywhere else. Deliberately dependency-free: this is imported from api/media.ts,
// which is imported from nearly everywhere.

// Tauri injects this before any page script runs, so index.html can check it too.
export const isTauri = Boolean(window.__TAURI_INTERNALS__)

// Normally the gomuks server serves the frontend itself, so relative URLs already
// point at the backend and this stays empty. A production Tauri build instead serves
// dist from tauri://localhost, which has no backend behind it, so the sidecar has to
// be addressed explicitly. Dev under Tauri loads from the Vite dev server, whose
// proxy forwards /_gomuks, so that case stays relative too.
//
// Has a trailing slash so that `${BACKEND_URL}_gomuks/foo` is byte-identical to the
// old relative `_gomuks/foo` when it's empty.
//
// On iOS the backend is linked into the app (gomuks's C FFI) and there is no HTTP server
// at all: the app marks the page with __ECHO_FFI__ and answers _gomuks URLs (media,
// URL previews) through its own gomuks:// scheme.
export const isTauriFFI = isTauri && Boolean(window.__ECHO_FFI__)
export const BACKEND_URL = isTauriFFI
	? "gomuks://localhost/"
	: isTauri && import.meta.env.PROD ? "http://localhost:29325/" : ""

export const BACKEND_WS_URL = BACKEND_URL.replace(/^http/, "ws")

// True exactly when the backend is on a different origin than the document.
export const BACKEND_CROSS_ORIGIN = BACKEND_URL !== ""

// Cross-origin requests to the sidecar need cookies explicitly opted in. Same-origin
// requests send them either way, so this is safe to pass unconditionally.
export const BACKEND_CREDENTIALS: RequestCredentials = BACKEND_CROSS_ORIGIN ? "include" : "same-origin"
