import { createContext, useContext, useEffect, useState } from "react"

type PlaylistDefinition = {
	type: "track" | "album" | "artist" | "genre"
	id: string
	index: number
} | null

type ViewDefinition = {
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

type SetAppState = (
	nextState: {playlist?: Partial<PlaylistDefinition>, view?: ViewDefinition}
	| ((prevState: {playlist: PlaylistDefinition, view: ViewDefinition}) => {playlist?: Partial<PlaylistDefinition>, view?: ViewDefinition})
) => void

const initialAppState = {
	view: {
		type: "home",
	},
	playlist: null,
	setAppState: () => {},
} as const

const AppStateContext = createContext<{
	playlist: PlaylistDefinition
	view: ViewDefinition
	setAppState: SetAppState
}>(initialAppState)

function mergePlaylistStates(prevState: PlaylistDefinition, nextState?: Partial<PlaylistDefinition>) {
	if (nextState === null) return null
	if (!nextState) return prevState
	if (prevState && nextState) return {...prevState, ...nextState}
	const {type, id, index} = nextState
	if (type && id && index !== undefined) return {type, id, index}
	throw new Error("Invalid playlist state")
}

export function AppState({children}: {children: React.ReactNode}) {
	const [appState, _setAppState] = useState<{playlist: PlaylistDefinition, view: ViewDefinition}>(initialAppState)
	const setAppState: SetAppState = (nextState) => {
		_setAppState(prevState => {
			const nextAppState = typeof nextState === "function"
				? nextState(prevState)
				: nextState
			const view = nextAppState.view || prevState.view
			const playlist = mergePlaylistStates(prevState.playlist, nextAppState.playlist)

			console.log(prevState, view)

			if (prevState.view.type === "home" && view.type !== "home") {
				history.pushState({}, "just-allow-back-button")
			}

			if (playlist && prevState.playlist
				&& playlist.type === prevState.playlist.type
				&& playlist.id === prevState.playlist.id
				&& playlist.index === prevState.playlist.index
			) {
				const audioElement = document.querySelector("audio") as HTMLAudioElement
				const {currentTime, duration} = audioElement
				if (currentTime > duration - 1) {
					audioElement.currentTime = 0
					audioElement.play()
				}
			}

			return { view, playlist }
		})
	}

	useEffect(() => {
		const controller = new AbortController()
		addEventListener('popstate', event => {
			if (appState.view.type !== "home") {
				setAppState({view: {type: "home"}})
				event.preventDefault()
			}
		}, {capture: true, signal: controller.signal})
		return () => controller.abort()
	})

	return (
		<AppStateContext.Provider value={{
			...appState,
			setAppState,
		}}>
			{children}
		</AppStateContext.Provider>
	)
}

export function useAppState() {
	return useContext(AppStateContext)
}