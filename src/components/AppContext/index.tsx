import { createContext, useContext, useState } from "react"

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
			const view = { ...prevState.view, ...nextAppState.view }
			const playlist = mergePlaylistStates(prevState.playlist, nextAppState.playlist)
			return { view, playlist }
		})
	}
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