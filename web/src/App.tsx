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
import React, { useEffect, useMemo } from "react"
import { BACKEND_WS_URL, isTauriFFI } from "./api/backend.ts"
import Client from "./api/client.ts"
import TauriFFIClient from "./api/ffiClient.ts"
import RPCClient from "./api/rpc.ts"
import SSEClient from "./api/sseclient.ts"
import { getLocalStoragePreferences } from "./api/types/preferences"
import WasmClient from "./api/wasmclient.ts"
import WSClient from "./api/wsclient.ts"
import ClientContext from "./ui/ClientContext.ts"
import DisconnectedScreen from "./ui/DisconnectedScreen.tsx"
import MainScreen from "./ui/MainScreen.tsx"
import WebAuthLogin from "./ui/WebAuthLogin.tsx"
import { LoginScreen, VerificationScreen } from "./ui/login"
import { LightboxWrapper, ModalContext, ModalWrapper, NestableModalContext } from "./ui/modal"
import { useEventAsState } from "./util/eventdispatcher.ts"
import { startUpdateChecks } from "./util/updater.ts"
import "./ui/login/SignedOut.css"

function makeRPCClient(): RPCClient {
	if (isTauriFFI) {
		return new TauriFFIClient()
	}
	if (window.gomuksWebWasm) {
		return new WasmClient()
	}
	const prefs = getLocalStoragePreferences("global_prefs", () => {})
	if (prefs.server_sent_events) {
		return new SSEClient()
	}
	return new WSClient(`${BACKEND_WS_URL}_gomuks/websocket`, prefs.low_bandwidth ?? false)
}

/*
 * The shell every screen shown before the app itself renders into: one quiet surface on the
 * chat ground, the wordmark alone in the traffic-light strip, and the content optically
 * centred. There is no app shell behind it — before signing in there are no rooms, and a
 * skeleton of data that does not exist reads as broken rather than as a preview.
 */
const SignedOut = ({ children }: { children: React.ReactNode }) =>
	<div className="pre-main signed-out">
		<div className="app-wordmark">echo</div>
		{children}
	</div>

function App() {
	const client = useMemo(() => new Client(makeRPCClient()), [])
	const connState = useEventAsState(client.rpc.connect)
	const clientState = useEventAsState(client.state)
	useEffect(() => {
		window.client = client
		return client.start()
	}, [client])
	// Runs regardless of auth state and is a no-op outside the packaged Tauri app. Checks once now
	// and then periodically — a launch-only check means a copy left open never sees a new release.
	// The returned cleanup clears the interval, so StrictMode's double-invoke leaves one running.
	useEffect(() => startUpdateChecks(), [])

	const needsWebAuth = connState?.error === "AUTH_REQUIRED" || connState?.error === "Invalid credentials"
	const afterConnectError = Boolean(connState?.error && connState.reconnecting && clientState?.is_verified)
	useEffect(() => {
		if (afterConnectError) {
			const cancelKeys = (evt: KeyboardEvent | MouseEvent) => evt.stopPropagation()
			document.body.addEventListener("keydown", cancelKeys, { capture: true })
			document.body.addEventListener("keyup", cancelKeys, { capture: true })
			document.body.addEventListener("click", cancelKeys, { capture: true })
			return () => {
				document.body.removeEventListener("keydown", cancelKeys, { capture: true })
				document.body.removeEventListener("keyup", cancelKeys, { capture: true })
				document.body.removeEventListener("click", cancelKeys, { capture: true })
			}
		}
	}, [afterConnectError])

	// Handle web auth login
	if (needsWebAuth) {
		return <SignedOut>
			<WebAuthLogin
				onSubmit={(username, password) => client.retryAuthWithCredentials(username, password)}
				error={connState?.error === "Invalid credentials" ? "Invalid credentials" : undefined}
			/>
		</SignedOut>
	}

	const errorOverlay = connState?.error ? <DisconnectedScreen
		error={connState.error}
		reconnecting={connState.reconnecting}
		nextAttempt={connState.nextAttempt}
	/> : null

	// The screen draws its own skeleton of the app and covers the window, so it needs no
	// pre-main surface under it the way the sign-in screens do.
	if (connState?.error && !afterConnectError) {
		return errorOverlay
	} else if ((!connState?.connected && !afterConnectError) || !clientState || !clientState.is_initialized) {
		const msg = connState?.connected ?
			clientState
				? "The local server is finishing its setup."
				: "Loading your session."
			: "Waiting for the local server to come up."
		return <SignedOut>
			<main className="signin-column">
				<div className="signin-head">
					<h1 className="signin-title">Starting echo</h1>
					<p className="signin-body">{msg}</p>
				</div>
				<div className="signin-rule" />
			</main>
		</SignedOut>
	} else if (!clientState.is_logged_in) {
		return <ModalWrapper ContextType={ModalContext}>
			<ModalWrapper ContextType={NestableModalContext}>
				<SignedOut><LoginScreen client={client} clientState={clientState}/></SignedOut>
			</ModalWrapper>
		</ModalWrapper>
	} else if (!clientState.is_verified) {
		return <ModalWrapper ContextType={ModalContext}>
			<ModalWrapper ContextType={NestableModalContext}>
				<SignedOut><VerificationScreen client={client} clientState={clientState}/></SignedOut>
			</ModalWrapper>
		</ModalWrapper>
	} else {
		return <ClientContext value={client}>
			<LightboxWrapper>
				<MainScreen/>
			</LightboxWrapper>
			{errorOverlay}
		</ClientContext>
	}
}

export default App
