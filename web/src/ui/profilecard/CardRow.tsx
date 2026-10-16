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
import React, { useId, useState } from "react"
import ChevronIcon from "@/icons/chevron-right.svg?react"

interface CardRowProps {
	label: string
	summary: React.ReactNode
	// Shown instead of the summary while open, when the detail repeats it.
	openSummary?: React.ReactNode
	// Without children the row is a plain line with nothing to open.
	children?: React.ReactNode
	defaultOpen?: boolean
}

/*
 * One line of the profile card: a label, a one-line summary, and the detail
 * folded underneath. The detail used to sit open on the face of the side panel.
 */
const CardRow = ({ label, summary, openSummary, children, defaultOpen = false }: CardRowProps) => {
	const [open, setOpen] = useState(defaultOpen)
	const detailID = useId()
	if (!children) {
		return <div className="card-row">
			<span className="card-row-label">{label}</span>
			<span className="card-row-summary">{summary}</span>
		</div>
	}
	// The whole line opens it, except clicks on controls inside the summary (room
	// chips). Those can't live inside a <button>, so the toggle is the chevron, and
	// the line is a plain clickable div that keyboard users don't need.
	const onClickLine = (evt: React.MouseEvent) => {
		if (!(evt.target as HTMLElement).closest("button, a")) {
			setOpen(!open)
		}
	}
	return <>
		<div className={`card-row expandable ${open ? "open" : ""}`} onClick={onClickLine}>
			<span className="card-row-label">{label}</span>
			<span className="card-row-summary">{open && openSummary !== undefined ? openSummary : summary}</span>
			<button
				className="card-row-toggle"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				aria-controls={detailID}
				aria-label={`${open ? "Hide" : "Show"} ${label.toLowerCase()}`}
			><ChevronIcon/></button>
		</div>
		{open && <div className="card-row-detail" id={detailID}>{children}</div>}
	</>
}

export default CardRow
