import { atom, Provider, useAtomValue, useSetAtom } from "jotai"
import { Suspense, useCallback, useEffect } from "react"

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
	(get, set, value: ArtistView | ((prev: ArtistView, get: any) => ArtistView | undefined)) => {
		const newView = typeof value === "function"
			? value(get(_artistView), get)
			: value
		if (newView === undefined) return
		set(panelStack, (stack) => {
			const newStack = stack.filter((name) => name !== "artist")
			if (newView.open) newStack.push("artist")
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
	(get, set, value: AlbumView | ((prev: AlbumView, get: any) => AlbumView | undefined)) => {
		const newView = typeof value === "function"
			? value(get(_albumView), get)
			: value
		if (newView === undefined) return
		set(panelStack, (stack) => {
			const newStack = stack.filter((name) => name !== "album")
			if (newView.open) newStack.push("album")
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
	(get, set, value: SearchView | ((prev: SearchView, get: any) => SearchView | undefined)) => {
		const newView = typeof value === "function"
			? value(get(_searchView), get)
			: value
		if (newView === undefined) return
		set(panelStack, (stack) => {
			const newStack = stack.filter((name) => name !== "search")
			if (newView.open) newStack.push("search")
			return newStack
		})
		history.pushState({}, "just-allow-back-button")
		set(_searchView, newView)
	}
)

type MainView = "suggestions" | "home"
export const mainView = atom<MainView>("suggestions")

export function useShowHome() {
	const setAlbum = useSetAtom(albumView)
	const setArtist = useSetAtom(artistView)
	const setSearch = useSetAtom(searchView)
	const setMainView = useSetAtom(mainView)

	return useCallback((which?: MainView) => {
		const close = <P extends Panel>(name: P) => (
			prev: P extends "album" ? AlbumView : P extends "artist" ? ArtistView : SearchView,
			get: any
		) => {
			const stack = get(panelStack)
			if(!stack.includes(name)) return undefined
			return {...prev, open: false}
		}
		setAlbum(close("album"))
		setArtist(close("artist"))
		setSearch(close("search"))
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
		const customNav = () => {
			if (stack.length) {
				showHome()
			} else {
				setMainView(value => value === "home" ? "suggestions" : "home")
			}
			history.pushState({}, "just-allow-back-button")
		}
		addEventListener('popstate', event => {
			customNav()
			event.preventDefault()
		}, {capture: true, signal: controller.signal})
		window.addEventListener('keydown', (event) => {
			// @ts-expect-error -- it's fine if contentEditable doesn't exist, the value will just be undefined and it works
			const editable = event.target?.contentEditable as string | undefined
			if (event.key === 'Escape' && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && editable !== 'true') {
				event.preventDefault()
				event.stopPropagation()
				customNav()
			}
		}, {capture: true, passive: false, signal: controller.signal})
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