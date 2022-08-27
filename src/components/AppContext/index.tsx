import { createContext, useContext, useEffect, useRef, useState } from "react"

type PlaylistDefinition = {
	type: "track" | "album" | "artist" | "genre"
	id: string
	index: number
} | null

const PANELED_VIEWS = ["search", "artist", "album"] as const

type ViewDefinition = {
	type: "suggestions"
} | {
	type: "home"
} | {
	type: "search"
} | {
	type: "artist"
	id: string
} | {
	type: "album"
	id: string
}

type NonPaneledView = Exclude<ViewDefinition['type'], (typeof PANELED_VIEWS)[number]>

type SetAppState = (
	nextState: {playlist?: Partial<PlaylistDefinition>, view?: ViewDefinition}
	| ((prevState: {playlist: PlaylistDefinition, view: ViewDefinition}) => {playlist?: Partial<PlaylistDefinition>, view?: ViewDefinition})
) => void

const initialAppState = {
	view: {
		type: "suggestions",
	},
	playlist: null,
	setAppState: () => {},
	main: {
		type: "suggestions",
	}
} as const

const AppStateContext = createContext<{
	playlist: PlaylistDefinition
	view: ViewDefinition
	setAppState: SetAppState
	main: ViewDefinition & {type: NonPaneledView}
}>(initialAppState)

function mergePlaylistStates(prevState: PlaylistDefinition, nextState?: Partial<PlaylistDefinition>) {
	if (nextState === null) return null
	if (!nextState) return prevState
	if (prevState && nextState) return {...prevState, ...nextState}
	const {type, id, index} = nextState
	if (type && id && index !== undefined) return {type, id, index}
	throw new Error("Invalid playlist state")
}

function isPaneledView(type: ViewDefinition['type']) {
	return PANELED_VIEWS.includes(type as (typeof PANELED_VIEWS)[number])
}

export function AppState({children}: {children: React.ReactNode}) {
	const [appState, _setAppState] = useState<{playlist: PlaylistDefinition, view: ViewDefinition}>(initialAppState)

	const latestNonPaneledView = useRef<ViewDefinition & {type: NonPaneledView}>(initialAppState.view)
	if (!isPaneledView(appState.view.type)) {
		latestNonPaneledView.current = appState.view as (ViewDefinition & {type: NonPaneledView})
	}

	const setAppState: SetAppState = (nextState) => {
		_setAppState(prevState => {
			const nextAppState = typeof nextState === "function"
				? nextState(prevState)
				: nextState
			const view = nextAppState.view || prevState.view
			const playlist = mergePlaylistStates(prevState.playlist, nextAppState.playlist)

			history.pushState({}, "just-allow-back-button")

			if (playlist && prevState.playlist
				&& playlist.type === prevState.playlist.type
				&& playlist.id === prevState.playlist.id
				&& playlist.index === prevState.playlist.index
			) {
				const audioElement = document.querySelector("audio") as HTMLAudioElement
				const {currentTime, duration} = audioElement
				if (currentTime > duration - 1) {
					audioElement.currentTime = 0
				}
			}

			return { view, playlist }
		})
	}

	useEffect(() => {
		const controller = new AbortController()
		addEventListener('popstate', event => {
			if (isPaneledView(appState.view.type)) {
				setAppState({view: {type: latestNonPaneledView.current.type}})
			} else if (appState.view.type === "home") {
				setAppState({view: {type: "suggestions"}})
			} else {
				setAppState({view: {type: "home"}})
			}
			event.preventDefault()
			history.pushState({}, "just-allow-back-button")
		}, {capture: true, signal: controller.signal})
		return () => controller.abort()
	})

	return (
		<AppStateContext.Provider value={{
			...appState,
			setAppState,
			main: latestNonPaneledView.current,
		}}>
			{children}
		</AppStateContext.Provider>
	)
}

export function useAppState() {
	return useContext(AppStateContext)
}