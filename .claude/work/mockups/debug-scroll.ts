// TEMPORARY (reaction tooltip / room list scroll bug, 2026-10-08). Dev only.
const send = (data: Record<string, unknown>) => import.meta.hot?.send("echo:debug", { t: Math.round(performance.now()), ...data })

const describe = (el: unknown): string => {
	if (el === document || el === window) {
		return el === document ? "document" : "window"
	}
	if (!(el instanceof Element)) {
		return String(el)
	}
	const cls = typeof el.className === "string" ? el.className.trim().replace(/\s+/g, ".") : ""
	return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}`
}

const stack = () => (new Error().stack ?? "").split("\n").slice(2, 8).join(" | ")

window.addEventListener("scroll", evt => {
	const target = evt.target as Element
	send({ ev: "scroll", target: describe(target), top: (target as Element).scrollTop })
}, { capture: true, passive: true })

document.addEventListener("focusin", evt => send({ ev: "focusin", target: describe(evt.target) }), true)

document.addEventListener("mouseover", evt => {
	const el = (evt.target as Element).closest?.("div.reaction")
	if (el && !el.contains(evt.relatedTarget as Node)) {
		send({ ev: "reaction-enter", target: describe(evt.target) })
	}
}, true)

const proto = Element.prototype
const desc = Object.getOwnPropertyDescriptor(proto, "scrollTop")!
Object.defineProperty(proto, "scrollTop", {
	...desc,
	set(v: number) {
		send({ ev: "set-scrollTop", target: describe(this), v, stack: stack() })
		desc.set!.call(this, v)
	},
})
for (const name of ["scrollIntoView", "scrollTo", "scrollBy", "scroll", "focus"] as const) {
	const orig = (name === "focus" ? HTMLElement.prototype : proto)[name as "scrollTo"] as (...args: unknown[]) => void
	;(name === "focus" ? HTMLElement.prototype : proto)[name as "scrollTo"] = function(this: Element, ...args: unknown[]) {
		send({ ev: name, target: describe(this), args: JSON.stringify(args), stack: stack() })
		return orig.apply(this, args)
	} as never
}

new MutationObserver(records => {
	for (const r of records) {
		for (const n of r.addedNodes) {
			if (n instanceof Element && n.parentElement === document.body) {
				send({ ev: "body-child-added", target: describe(n) })
			}
		}
	}
}).observe(document.body, { childList: true })

send({ ev: "debug-scroll loaded" })
