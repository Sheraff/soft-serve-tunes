import { useEffect } from "react"
import { editOverlay, editOverlaySetter } from "./editOverlay"
import globalState from "client/globalState"

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
type GenrePanel = {
	type: "genre"
	key: string
	value: {
		id: string
		name?: string
		open: "open" | "close" | "force-open" | "force-close"
		rect?: {
			top: number
			left: number
		}
	}
}

type Panel =
	| ArtistPanel
	| AlbumPanel
	| PlaylistPanel
	| GenrePanel

export const panelStack = globalState<Panel[]>(
	"panelStack",
	[],
	() => {
		editOverlay.setState(editOverlaySetter(null))
		history.pushState({}, "just-allow-back-button")
	}
)

export function openPanel<P extends Panel> (
	type: P["type"],
	value: Omit<P["value"], "open">
) {
	panelStack.setState(prev => {
		// const clean = prev.filter(({value: {id}}) => id !== value.id)
		const clean = prev.filter((panel, i) => i === prev.length - 1 || panel.type !== type)
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
	})
}

export function closePanel (id: string) {
	panelStack.setState(prev => {
		const match = prev.findIndex(({ value }) => value.id === id)
		if (match === -1) return prev
		if (match !== prev.length - 1) {
			return [
				...prev.slice(0, match),
				...prev.slice(match + 1),
			]
		} else {
			const replacement = {
				...prev[match]!,
				value: {
					...prev[match]!.value,
					open: "close",
					rect: undefined,
				}
			} as const
			return [
				...prev.slice(0, match),
				replacement,
			]
		}
	})
}

type SearchView = {
	open: boolean,
}
export const searchView = globalState<SearchView>(
	"searchView",
	{ open: false },
	() => history.pushState({}, "just-allow-back-button")
)

type LibraryView = {
	open: boolean,
}
export const libraryView = globalState<LibraryView>(
	"libraryView",
	{ open: false },
	() => history.pushState({}, "just-allow-back-button")
)

type MainView = "suggestions" | "home"
export const mainView = globalState<MainView>(
	"mainView",
	"suggestions",
	() => editOverlay.setState(editOverlaySetter(null))
)

export function useIsHome () {
	const stack = panelStack.useValue()
	const view = mainView.useValue()
	return stack.length === 0 && view === "suggestions"
}

export function showHome (which?: MainView) {
	if (which) {
		mainView.setState(which)
	}

	const search = searchView.getValue()
	if (search.open) {
		searchView.setState({ open: false })
	}

	const stack = panelStack.getValue()
	if (stack.length > 0) {
		const { type, key, value } = stack.at(-1)!
		panelStack.setState([{
			type,
			key,
			value: {
				...value,
				open: "close",
			}
		} as Panel])
	}

	const library = libraryView.getValue()
	if (library.open) {
		libraryView.setState({ open: false })
	}
}

export function AppState () {
	useEffect(() => {
		const controller = new AbortController()
		const backNav = () => {
			history.pushState({}, "just-allow-back-button")

			if (editOverlay.getValue().type !== null) {
				editOverlay.setState(editOverlaySetter(null))
				return
			}

			if (searchView.getValue().open) {
				searchView.setState({ open: false })
				return
			}

			const stack = panelStack.getValue()
			if (stack.length > 1) {
				// at least 2 in stack, force-open the penultimate, it will auto-trigger the closing of the last
				const rest = stack.slice(0, -2)
				const closeBase = stack.at(-1)!
				const close = {
					type: closeBase.type,
					key: closeBase.key,
					value: {
						...closeBase.value,
						rect: undefined,
						open: "close",
					}
				} as Panel
				const nextBase = stack.at(-2)!
				const next = {
					type: nextBase.type,
					key: nextBase.key,
					value: {
						...nextBase.value,
						rect: undefined,
						open: "force-open",
					}
				} as Panel
				panelStack.setState([...rest, next, close])
				return
			}
			if (stack.length > 0) {
				// only 1 in stack, close it
				const rest = stack.slice(0, -1)
				const { type, key, value } = stack.at(-1)!
				const close = {
					type,
					key,
					value: {
						...value,
						open: "close",
					}
				} as Panel
				panelStack.setState([...rest, close])
				return
			}

			if (libraryView.getValue().open) {
				libraryView.setState({ open: false })
				return
			}

			mainView.setState(value => value === "home" ? "suggestions" : "home")
		}

		addEventListener("popstate", event => {
			backNav()
			event.preventDefault()
		}, { capture: true, signal: controller.signal })

		window.addEventListener("keydown", (event) => {
			// @ts-expect-error -- it's fine if contentEditable doesn't exist, the value will just be undefined and it works
			const editable = event.target?.contentEditable as string | undefined
			if (event.key === "Escape" && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && editable !== "true") {
				event.preventDefault()
				event.stopPropagation()
				backNav()
			}
		}, { capture: true, passive: false, signal: controller.signal })

		return () => controller.abort()
	}, [])

	return null
}
