import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect } from "react"
import { editOverlay, editOverlaySetter } from "./editOverlay"
import globalState from "./globalState"

type ArtistPanel = {
	type: "artist"
	key: string
	value: {
		id: string
		name?: string
		open: "open" | "close" | "force-open" | "force-close"
		rect?: {
			top: number
			left: number
			width: number
			src?: string
		}
	}
}
type AlbumPanel = {
	type: "album"
	key: string
	value: {
		id: string
		name?: string
		open: "open" | "close" | "force-open" | "force-close"
		rect?: {
			top: number
			left: number
			width: number
			src?: string
		}
	}
}
type PlaylistPanel = {
	type: "playlist"
	key: string
	value: {
		id: string
		name?: string
		open: "open" | "close" | "force-open" | "force-close"
		rect?: {
			top: number
			height: number
			src?: string
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
		history.pushState({}, "just-allow-back-button")
	}
)

export function openPanel<P extends Panel>(type: P["type"], value: Omit<P["value"], "open">, queryClient: QueryClient) {
	panelStack.setState(prev => {
		// const clean = prev.filter(({value: {id}}) => id !== value.id)
		const clean = prev.filter((panel) => panel.type !== type)
		const keyPrefix = clean.length > 0 ? clean.at(-1)!.key : "root"
		return [
			...clean,
			{
				type,
				key: `${keyPrefix}-${value.id}`,
				value: {
					...value,
					open: "open",
				}
			} as Panel
		]
	}, queryClient)
}

type SearchView = {
	open: boolean,
}
export const searchView = globalState<SearchView>("searchView", {
	open: false,
}, () => {
	history.pushState({}, "just-allow-back-button")
})

type LibraryView = {
	open: boolean,
}
export const libraryView = globalState<LibraryView>("libraryView", {
	open: false,
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
		if (search.open) {
			searchView.setState({open: false}, queryClient)
		}

		const stack = panelStack.getValue(queryClient)
		if (stack.length > 0) {
			const {type, key, value} = stack.at(-1)!
			panelStack.setState([{
				type,
				key,
				value: {
					...value,
					open: "close",
				}
			} as Panel], queryClient)
		}

		const library = libraryView.getValue(queryClient)
		if (library.open) {
			libraryView.setState({open: false}, queryClient)
		}

	}, [queryClient])
}

export function AppState() {
	const queryClient = useQueryClient()

	useEffect(() => {
		const controller = new AbortController()
		const backNav = () => {
			history.pushState({}, "just-allow-back-button")

			if (editOverlay.getValue(queryClient).type !== null) {
				editOverlay.setState(editOverlaySetter(null), queryClient)
				return
			}

			if (searchView.getValue(queryClient).open) {
				searchView.setState({open: false}, queryClient)
				return
			}

			const stack = panelStack.getValue(queryClient)
			if (stack.length > 1) {
				// at least 2 in stack, force-open the penultimate, it will auto-trigger the closing of the last
				const rest = stack.slice(0, -2)
				const close = stack.at(-1)!
				const {type, key, value} = stack.at(-2)!
				const next = {
					type,
					key,
					value: {
						...value,
						rect: undefined,
						open: "force-open",
					}
				} as Panel
				panelStack.setState([...rest, next, close], queryClient)
				return
			}
			if (stack.length > 0) {
				// only 1 in stack, close it
				const rest = stack.slice(0, -1)
				const {type, key, value} = stack.at(-1)!
				const close = {
					type,
					key,
					value: {
						...value,
						open: "close",
					}
				} as Panel
				panelStack.setState([...rest, close], queryClient)
				return
			}

			const library = libraryView.getValue(queryClient)
			if (library.open) {
				libraryView.setState({open: false}, queryClient)
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
