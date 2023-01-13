import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect } from "react"
import { editOverlay, editOverlaySetter } from "./editOverlay"
import globalState from "./globalState"

type Panel = "artist" | "album" | "search" | "playlist"
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
	open: boolean,
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
	panelStack.setState((stack) => {
		const newStack = stack.filter((name) => name !== "artist")
		if (value.open) newStack.push("artist")
		return newStack
	}, queryClient)
	history.pushState({}, "just-allow-back-button")
})

type AlbumView = {
	id: string,
	name?: string,
	open: boolean,
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
	panelStack.setState((stack) => {
		const newStack = stack.filter((name) => name !== "album")
		if (value.open) newStack.push("album")
		return newStack
	}, queryClient)
	history.pushState({}, "just-allow-back-button")
})

type PlaylistView = {
	id: string,
	name?: string,
	open: boolean,
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
	panelStack.setState((stack) => {
		const newStack = stack.filter((name) => name !== "playlist")
		if (value.open) newStack.push("playlist")
		return newStack
	}, queryClient)
	history.pushState({}, "just-allow-back-button")
})


type SearchView = {
	open: boolean
}
export const searchView = globalState<SearchView>("searchView", {
	open: false,
}, (value, queryClient) => {
	panelStack.setState((stack) => {
		const newStack = stack.filter((name) => name !== "search")
		if (value.open) newStack.push("search")
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

		const close = <Prev extends AlbumView | ArtistView | SearchView>(
			prev: Prev
		) => {
			return {...prev, open: false}
		}

		if (stack.includes("album")) albumView.setState(close, queryClient)
		if (stack.includes("artist")) artistView.setState(close, queryClient)
		if (stack.includes("search")) searchView.setState(close, queryClient)
		if (stack.includes("playlist")) playlistView.setState(close, queryClient)
		if (which)
			mainView.setState(which, queryClient)
	}, [
		queryClient,
	])
}

export function AppState() {
	const stack = panelStack.useValue()
	const queryClient = useQueryClient()
	const showHome = useShowHome()
	useEffect(() => {
		const controller = new AbortController()
		const customNav = () => {
			if (editOverlay.getValue(queryClient).type !== null) {
				editOverlay.setState(editOverlaySetter(null), queryClient)
			} else if (stack.length) {
				showHome()
			} else {
				mainView.setState(value => value === "home" ? "suggestions" : "home", queryClient)
			}
			history.pushState({}, "just-allow-back-button")
		}
		addEventListener("popstate", event => {
			customNav()
			event.preventDefault()
		}, {capture: true, signal: controller.signal})
		window.addEventListener("keydown", (event) => {
			// @ts-expect-error -- it's fine if contentEditable doesn't exist, the value will just be undefined and it works
			const editable = event.target?.contentEditable as string | undefined
			if (event.key === "Escape" && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && editable !== "true") {
				event.preventDefault()
				event.stopPropagation()
				customNav()
			}
		}, {capture: true, passive: false, signal: controller.signal})
		return () => controller.abort()
	})
	return null
}
