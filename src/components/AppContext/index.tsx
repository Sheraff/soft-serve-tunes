import { atom, Provider, useAtomValue, useSetAtom } from "jotai"
import { Suspense, useCallback, useEffect } from "react"
import asyncPersistedAtom from "./asyncPersistedAtom"

type Panel = "artist" | "album" | "search"
export const panelStack = atom<Panel[]>([])

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
const _artistView = atom<ArtistView>({
	id: "cl7ackbmy20574654y4vrqekmfb",
	name: "MGMT",
	open: false,
})
export const artistView = atom(
	(get) => get(_artistView),
	(get, set, value: ArtistView | ((prev: ArtistView) => ArtistView)) => {
		const newView = typeof value === "function"
			? value(get(_artistView))
			: value
		set(panelStack, (stack) => {
			const newStack = stack.filter((name) => name !== "artist")
			if(newView.open) newStack.push("artist")
			return newStack
		})
		history.pushState({}, "just-allow-back-button")
		set(_artistView, newView)
	}
)

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
const _albumView = atom<AlbumView>({
	id: "cl7ackd5z20628354y4a90y4vn7",
	name: "Oracular Spectacular",
	open: false,
})
export const albumView = atom(
	(get) => get(_albumView),
	(get, set, value: AlbumView | ((prev: AlbumView) => AlbumView)) => {
		const newView = typeof value === "function"
			? value(get(_albumView))
			: value
		set(panelStack, (stack) => {
			const newStack = stack.filter((name) => name !== "album")
			if(newView.open) newStack.push("album")
			return newStack
		})
		history.pushState({}, "just-allow-back-button")
		set(_albumView, newView)
	}
)

type SearchView = {
	open: boolean
}
const _searchView = atom<SearchView>({
	open: false,
})
export const searchView = atom(
	(get) => get(_searchView),
	(get, set, value: SearchView | ((prev: SearchView) => SearchView)) => {
		const newView = typeof value === "function"
			? value(get(_searchView))
			: value
		set(panelStack, (stack) => {
			const newStack = stack.filter((name) => name !== "search")
			if(newView.open) newStack.push("search")
			return newStack
		})
		history.pushState({}, "just-allow-back-button")
		set(_searchView, newView)
	}
)

type MainView = "suggestions" | "home"
export const mainView = atom<MainView>("suggestions")


type Playlist = {
	type: "track" | "album" | "artist" | "genre"
	id: string
	index: number
}

export const playlist = asyncPersistedAtom<Playlist>("playlist", {
	type: "album",
	id: "cl7ackd5z20628354y4a90y4vn7",
	index: 0,
})

export function useShowHome() {
	const setAlbum = useSetAtom(albumView)
	const setArtist = useSetAtom(artistView)
	const setSearch = useSetAtom(searchView)
	const setMainView = useSetAtom(mainView)

	return useCallback((which?: MainView) => {
		setAlbum(prev => ({...prev, open: false}))
		setArtist(prev => ({...prev, open: false}))
		setSearch(prev => ({...prev, open: false}))
		if (which)
			setMainView(which)
	}, [
		setAlbum,
		setArtist,
		setSearch,
		setMainView,
	])
}

function Back() {
	const stack = useAtomValue(panelStack)
	const setMainView = useSetAtom(mainView)
	const showHome = useShowHome()
	useEffect(() => {
		const controller = new AbortController()
		addEventListener('popstate', event => {
			if (stack.length) {
				showHome()
			} else {
				setMainView(value => value === "home" ? "suggestions" : "home")
			}
			event.preventDefault()
			history.pushState({}, "just-allow-back-button")
		}, {capture: true, signal: controller.signal})
		return () => controller.abort()
	})
	return null
}


export function AppState({children}: {children: React.ReactNode}) {
	return (
		<Provider>
			<Suspense>
				{children}
				<Back />
			</Suspense>
		</Provider>
	)
}