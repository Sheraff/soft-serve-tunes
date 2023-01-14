import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect } from "react"
import { editOverlay, editOverlaySetter } from "./editOverlay"
import globalState from "./globalState"

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
	| ArtistPanel
	| AlbumPanel
	| PlaylistPanel

export const panelStack = globalState<Panel[]>(
	"panelStack",
	[],
	(_, queryClient) => {
		editOverlay.setState(editOverlaySetter(null), queryClient)
	}
)

export function openPanel<P extends Panel>(type: P["type"], value: Omit<P["value"], "open">, queryClient: QueryClient) {
	panelStack.setState(prev => [
		...prev,
		{
			type,
			value: {
				...value,
				open: "open",
			}
		} as Panel
	], queryClient)
}

type SearchView = {
	open: "open" | "close",
}
export const searchView = globalState<SearchView>("searchView", {
	open: "close",
}, () => {
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
		if (which) {
			mainView.setState(which, queryClient)
		}

		const search = searchView.getValue(queryClient)
		if (search.open === "open") {
			searchView.setState({open: "close"}, queryClient)
			return
		}

		const stack = panelStack.getValue(queryClient)
		if (stack.length === 0) return

		const {type, value} = stack.at(-1)!
		panelStack.setState([{
			type,
			value: {
				...value,
				open: "close",
			}
		} as Panel], queryClient)
	}, [queryClient])
}

export function AppState() {
	const queryClient = useQueryClient()

	// useEffect(() => {
	// 	const interval = setInterval(() => {
	// 		const stack = panelStack.getValue(queryClient)
	// 		console.log("stack", stack)
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

			if (searchView.getValue(queryClient).open === "open") {
				searchView.setState({open: "close"}, queryClient)
				return
			}

			const stack = panelStack.getValue(queryClient)
			if (stack.length > 0) {
				const {type, value} = stack.at(-1)!
				panelStack.setState([{
					type,
					value: {
						...value,
						open: "close",
					}
				} as Panel], queryClient)
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
	}, [queryClient])

	return null
}
