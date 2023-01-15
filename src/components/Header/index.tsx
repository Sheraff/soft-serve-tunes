import Search from "./Search"
import styles from "./index.module.css"
import {
	mainView,
	panelStack,
	searchView,
	libraryView,
	useShowHome,
} from "components/AppContext"
import { editOverlay } from "components/AppContext/editOverlay"
import useDisplayAndShow from "components/useDisplayAndShow"
import { signOut } from "next-auth/react"
import { type CSSProperties, memo, useRef, useEffect, Suspense } from "react"
import ArtistView from "./Artist"
import AlbumView from "./Album"
import PlaylistView from "./Playlist"
import EditOverlay from "./Edit"
import Library from "./Library"
import { trpc } from "utils/trpc"
import SearchIcon from "icons/search.svg"
import LogoutIcon from "icons/logout.svg"
import DashboardIcon from "icons/dashboard.svg"
import QueueMusicIcon from "icons/queue_music.svg"
import LibraryIcon from "icons/library_music.svg"
import Upload from "./Upload"
import { useQueryClient } from "@tanstack/react-query"

type Panel = ReturnType<typeof panelStack.useValue>[number]

const BASE_HEADER_Z = 10

const PANEL_COMPONENTS = {
	artist: ArtistView,
	album: AlbumView,
	playlist: PlaylistView,
} as const

const SinglePane = memo(function BasePane({
	panel,
	index,
	isTop,
}: {
	panel: Panel
	index: number
	isTop: boolean
}) {
	const ref = useRef<HTMLDivElement>(null)
	const queryClient = useQueryClient()
	const state = useDisplayAndShow(panel.value.open, ref, (open) => {
		// if force open, close above
		// if open, force close below
		// if close, remove self from stack
		// if force close, do nothing
		if (open === "force-open") {
			panelStack.setState(prev => {
				const before = prev.slice(0, index + 1)
				const after = prev.slice(index + 1)
				const next: Panel[] = [...before, ...after.map(({type, key, value}) => ({
					type,
					key,
					value: {
						...value,
						open: "close",
					}
				} as Panel))]
				return next
			}, queryClient)
			return
		}
		if (open === "open") {
			panelStack.setState(prev => {
				const before = prev.slice(0, index)
				const after = prev.slice(index)
				const next: Panel[] = [...before.map(({type, key, value}) => ({
					type,
					key,
					value: {
						...value,
						open: "force-close",
					}
				} as Panel)), ...after]
				return next
			}, queryClient)
			if (searchView.getValue(queryClient).open) {
				searchView.setState(prev => ({...prev, open: false}), queryClient)
			}
			return
		}
		if (open === "close") {
			panelStack.setState(prev => {
				const before = prev.slice(0, index)
				const after = prev.slice(index + 1)
				const next: Panel[] = [...before, ...after]
				return next
			}, queryClient)
			return
		}
		if (open === "force-close") {
			return
		}
	})

	if (!state.display) return null

	const Component = PANEL_COMPONENTS[panel.type]
	return (
		<Component
			ref={ref}
			{...panel.value}
			isTop={isTop}
			open={state.show}
			z={index + BASE_HEADER_Z}
		/>
	)
})

function PanelStack({stack}: {stack: Panel[]}) {
	return (
		<>
			{stack.map((panel, i) => (
				<SinglePane
					key={panel.key}
					panel={panel}
					index={i}
					isTop={i === stack.length - 1}
				/>
			))}
		</>
	)
}

export default function Header() {
	const stack = panelStack.useValue()
	
	// search
	const [search, setSearch] = searchView.useState()
	const searchToggle = useRef<HTMLButtonElement>(null)
	const searchState = useDisplayAndShow(search.open, searchToggle)
	const trpcClient = trpc.useContext()
	useEffect(() => {
		trpcClient.track.searchable.prefetch()
	}, [trpcClient])

	// edit
	const edit = editOverlay.useValue()
	const editToggle = useRef<HTMLDivElement>(null)
	const editState = useDisplayAndShow(Boolean(edit.selection.length), editToggle)
	const editZ = stack.length

	// dashboard
	const showHome = useShowHome()
	const main = mainView.useValue()
	const showDashboardIcon = main === "home"
	const onClickMainIcon = () => {
		navigator.vibrate(1)
		if (showDashboardIcon) {
			showHome("suggestions")
		} else {
			showHome("home")
		}
	}

	// library
	const [library, setLibrary] = libraryView.useState()
	const libraryToggle = useRef<HTMLDivElement>(null)
	const libraryState = useDisplayAndShow(library.open, libraryToggle)

	return (
		<>
			<div className={styles.head}>
				<div className={styles.bg} />
				<button onClick={() => {
					navigator.vibrate(1)
					signOut()
				}} className={styles.button}>
					<LogoutIcon />
				</button>
				<Upload className={styles.button} />
				<button onClick={() => {
					navigator.vibrate(1)
					setLibrary({open: !library.open})
				}} className={styles.button}>
					<LibraryIcon />
				</button>
				<button onClick={onClickMainIcon} className={styles.button}>
					{showDashboardIcon && <DashboardIcon />}
					{!showDashboardIcon && <QueueMusicIcon />}
				</button>
				<button
					ref={searchToggle}
					className={styles.toggle}
					data-open={searchState.show}
					style={{"--z": BASE_HEADER_Z - 1} as CSSProperties}
					onClick={() => {
						navigator.vibrate(1)
						if (search.open) {
							showHome()
						} else {
							setSearch(prev => ({...prev, open: true}))
						}
					}}
				>
					<SearchIcon />
				</button>
			</div>
			{searchState.display && (
				<Search
					z={BASE_HEADER_Z - 1}
					open={searchState.show}
				/>
			)}
			{libraryState.display && (
				<Suspense>
					<Library
						z={BASE_HEADER_Z}
						open={libraryState.show}
						ref={libraryToggle}
					/>
				</Suspense>
			)}
			<PanelStack stack={stack} />
			{editState.display && (
				<EditOverlay
					z={editZ + BASE_HEADER_Z}
					open={editState.show}
					ref={editToggle}
				/>
			)}
		</>
	)
}