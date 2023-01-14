import { useQueryClient } from "@tanstack/react-query"
import useDisplayAndShow from "components/useDisplayAndShow"
import { memo, useCallback, useEffect, useRef } from "react"
import { editOverlay, editOverlaySetter } from "./editOverlay"
import globalState from "./globalState"

type SearchPanel = {
	type: "search", 
	value: {
		open: "open" | "close" | "force-open" | "force-close",
	}
}
type ArtistPanel = {
	type: "artist", 
	value: {
		id: string,
		name?: string,
		open: "open" | "close" | "force-open" | "force-close",
		rect?: {
			top: number,
			left: number,
			width: number,
			src?: string,
		}
	}
}
type AlbumPanel = {
	type: "album", 
	value: {
		id: string,
		name?: string,
		open: "open" | "close" | "force-open" | "force-close",
		rect?: {
			top: number,
			left: number,
			width: number,
			src?: string,
		}
	}
}
type PlaylistPanel = {
	type: "playlist", 
	value: {
		id: string,
		name?: string,
		open: "open" | "close" | "force-open" | "force-close",
		rect?: {
			top: number,
			height: number,
			src?: string,
		}
	}
}


type Panel =
	| SearchPanel
	| ArtistPanel
	| AlbumPanel
	| PlaylistPanel

const newPanelStack: Panel[] = [
	{
		type: "album", 
		value:{
			id: "cl7",
			name: "Oracular Spectacular",
			open: "close",
		}
	}
]

const SinglePane = memo(function BasePane({
	tuplet,
	index,
}: {
	tuplet: Panel
	index: number
}) {
	if (tuplet.type === "playlist") {
		console.log(tuplet.value.rect)
		//                         ^?
	}
	const ref = useRef<HTMLDivElement>(null)
	const state = useDisplayAndShow(tuplet.value.open, ref, (open) => {
		// if force open, close above
		// if open, force close below
		// if close, remove self from stack
		// if force close, do nothing
		if (open === "force-open") {
			const before = newPanelStack.slice(0, index + 1)
			const after = newPanelStack.slice(index + 1)
			const nextStack: Panel[] = [...before, ...after.map(({type, value}) => ({
				type,
				value: {
					...value,
					open: "close",
				}
			} as Panel))]
			return
		}
		if (open === "open") {
			const before = newPanelStack.slice(0, index)
			const after = newPanelStack.slice(index)
			const nextStack: Panel[] = [...before, ...after.map(({type, value}) => ({
				type,
				value: {
					...value,
					open: "force-close",
				}
			} as Panel))]
			return
		}
		if (open === "close") {
			const before = newPanelStack.slice(0, index)
			const after = newPanelStack.slice(index + 1)
			const nextStack: Panel[] = [...before, ...after]
			return
		}
		if (open === "force-close") {
			return
		}
	})
	if (!state.display) return null
	return (
		<div ref={ref} className="pane" />
	)
})

function PanelStack() {
	return (
		<>
			{newPanelStack.map((tuplet, i) => (
				<SinglePane key={i} tuplet={tuplet} index={i} />
			))}
		</>
	)
}



// type Panel = "artist" | "album" | "search" | "playlist"
export const panelStack = globalState<Panel[]>(
	"panelStack",
	[],
	(_, queryClient) => {
		editOverlay.setState(editOverlaySetter(null), queryClient)
	}
)

type ArtistView = {
	id: string,
	name?: string,
	open: boolean | "force",
	rect?: {
		top: number,
		left: number,
		width: number,
		src?: string,
	}
}

export const artistView = globalState<ArtistView>("artistView", {
	id: "cl7ackbmy20574654y4vrqekmfb",
	name: "MGMT",
	open: false,
}, (value, queryClient) => {
	if (!value.open) return
	panelStack.setState((stack) => {
		const newStack = stack.filter((name) => name !== "artist")
		newStack.push("artist")
		return newStack
	}, queryClient)
	history.pushState({}, "just-allow-back-button")
})

type AlbumView = {
	id: string,
	name?: string,
	open: boolean | "force",
	rect?: {
		top: number,
		left: number,
		width: number,
		src?: string,
	}
}
export const albumView = globalState<AlbumView>("albumView", {
	id: "cl7ackd5z20628354y4a90y4vn7",
	name: "Oracular Spectacular",
	open: false,
}, (value, queryClient) => {
	if (!value.open) return
	panelStack.setState((stack) => {
		const newStack = stack.filter((name) => name !== "album")
		newStack.push("album")
		return newStack
	}, queryClient)
	history.pushState({}, "just-allow-back-button")
})

type PlaylistView = {
	id: string,
	name?: string,
	open: boolean | "force",
	rect?: {
		top: number,
		height: number,
		src?: string,
	}
}
export const playlistView = globalState<PlaylistView>("playlistView", {
	id: "cl7ackd5z20628354y4a90y4vn7",
	name: "Oracular Spectacular",
	open: false,
}, (value, queryClient) => {
	if (!value.open) return
	panelStack.setState((stack) => {
		const newStack = stack.filter((name) => name !== "playlist")
		newStack.push("playlist")
		return newStack
	}, queryClient)
	history.pushState({}, "just-allow-back-button")
})


type SearchView = {
	open: boolean | "force",
}
export const searchView = globalState<SearchView>("searchView", {
	open: false,
}, (value, queryClient) => {
	panelStack.setState((stack) => {
		const newStack = stack.filter((name) => name !== "search")
		if (!value.open) newStack.push("search")
		return newStack
	}, queryClient)
	history.pushState({}, "just-allow-back-button")
})

type MainView = "suggestions" | "home"
export const mainView = globalState<MainView>(
	"mainView",
	"suggestions",
	(_, queryClient) => {
		editOverlay.setState(editOverlaySetter(null), queryClient)
	}
)

export function useIsHome() {
	const stack = panelStack.useValue()
	const view = mainView.useValue()
	return stack.length === 0 && view === "suggestions"
}

export function useShowHome() {
	const queryClient = useQueryClient()

	return useCallback((which?: MainView) => {
		const stack = panelStack.getValue(queryClient)

		const close = <Prev extends AlbumView | ArtistView | PlaylistView | SearchView>(
			prev: Prev
		) => {
			console.log("show home close", prev.name, prev.open)
			return {...prev, open: false}
		}
		console.log("show home", stack)
		if (stack.includes("album")) albumView.setState(close, queryClient)
		if (stack.includes("artist")) artistView.setState(close, queryClient)
		if (stack.includes("search")) searchView.setState(close, queryClient)
		if (stack.includes("playlist")) playlistView.setState(close, queryClient)
		if (stack.length > 0) panelStack.setState([], queryClient)
		if (which)
			mainView.setState(which, queryClient)
	}, [
		queryClient,
	])
}

const PANEL_KEY_TO_VIEW = {
	album: albumView,
	artist: artistView,
	playlist: playlistView,
	search: searchView,
}

export function AppState() {
	const queryClient = useQueryClient()
	const showHome = useShowHome()

	// useEffect(() => {
	// 	const interval = setInterval(() => {
	// 		const stack = panelStack.getValue(queryClient)
	// 		const artist = artistView.getValue(queryClient)
	// 		console.log("stack", stack, artist)
	// 	}, 200)
	// 	return () => clearInterval(interval)
	// }, [queryClient])

	useEffect(() => {
		const controller = new AbortController()
		const backNav = () => {
			history.pushState({}, "just-allow-back-button")

			if (editOverlay.getValue(queryClient).type !== null) {
				editOverlay.setState(editOverlaySetter(null), queryClient)
				return
			}

			const stack = panelStack.getValue(queryClient)
			console.log("backNav", stack)
			if (stack.length === 1 || (stack.length > 1 && stack.at(-1) === "search")) {
				showHome()
				return
			}

			if (stack.length > 1) {
				// const visiblePanel = stack.at(-1)! as Exclude<Panel, "search">
				// const visibleView = PANEL_KEY_TO_VIEW[visiblePanel]
				// // @ts-expect-error -- this is fine, we know the key is in the object
				// visibleView.setState(({id, name}) => ({id, name, open: false}), queryClient)
				const belowPanel = stack.at(-2)! as Exclude<Panel, "search">
				panelStack.setState((stack) => {
					const newStack = [...stack]
					newStack.pop()
					return newStack
				}, queryClient)
				const belowView = PANEL_KEY_TO_VIEW[belowPanel]
				// @ts-expect-error -- this is fine, we know the key is in the object
				belowView.setState(({id, name}) => ({id, name, open: "force"}), queryClient)
				
				return
			}

			mainView.setState(value => value === "home" ? "suggestions" : "home", queryClient)
		}

		addEventListener("popstate", event => {
			backNav()
			event.preventDefault()
		}, {capture: true, signal: controller.signal})

		window.addEventListener("keydown", (event) => {
			// @ts-expect-error -- it's fine if contentEditable doesn't exist, the value will just be undefined and it works
			const editable = event.target?.contentEditable as string | undefined
			if (event.key === "Escape" && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && editable !== "true") {
				event.preventDefault()
				event.stopPropagation()
				backNav()
			}
		}, {capture: true, passive: false, signal: controller.signal})

		return () => controller.abort()
	}, [queryClient, showHome])

	return null
}
