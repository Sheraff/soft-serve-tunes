import Search from "./Search"
import styles from "./index.module.css"
import {
	albumView,
	artistView,
	editOverlay,
	mainView,
	panelStack,
	searchView,
	useShowHome,
} from "components/AppContext"
import useDisplayAndShow from "components/useDisplayAndShow"
import { signOut } from "next-auth/react"
import { CSSProperties, useRef } from "react"
import ArtistView from "./Artist"
import AlbumView from "./Album"
import EditOverlay from "./Edit"
import { trpc } from "utils/trpc"
import SearchIcon from "icons/search.svg"
import LogoutIcon from "icons/logout.svg"
import DashboardIcon from "icons/dashboard.svg"
import QueueMusicIcon from "icons/queue_music.svg"
import Upload from "./Upload"

export default function Header() {
	const stack = panelStack.useValue()
	const searchZ = stack.indexOf("search")
	const artistZ = stack.indexOf("artist")
	const albumZ = stack.indexOf("album")
	
	const [search, setSearch] = searchView.useState()
	const [artist, setArtist] = artistView.useState()
	const [album, setAlbum] = albumView.useState()
	const edit = editOverlay.useValue()

	const searchToggle = useRef<HTMLButtonElement>(null)
	const searchState = useDisplayAndShow(search.open, searchToggle, () => {
		setArtist(prev => ({...prev, open: false}))
		setAlbum(prev => ({...prev, open: false}))
	})

	const artistToggle = useRef<HTMLDivElement>(null)
	const artistState = useDisplayAndShow(artist.open, artistToggle, () => {
		setSearch(prev => ({...prev, open: false}))
		setAlbum(prev => ({...prev, open: false}))
	})

	const albumToggle = useRef<HTMLDivElement>(null)
	const albumState = useDisplayAndShow(album.open, albumToggle, () => {
		setSearch(prev => ({...prev, open: false}))
		setArtist(prev => ({...prev, open: false}))
	})

	const editToggle = useRef<HTMLDivElement>(null)
	const editState = useDisplayAndShow(Boolean(edit.selection.length), editToggle)

	// prefetch select queries
	trpc.track.searchable.useQuery()

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
				<button onClick={onClickMainIcon} className={styles.button}>
					{showDashboardIcon && <DashboardIcon />}
					{!showDashboardIcon && <QueueMusicIcon />}
				</button>
				<button
					ref={searchToggle}
					className={styles.toggle}
					data-open={searchState.show}
					style={{"--z": searchZ + 10} as CSSProperties}
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
					z={searchZ + 10}
					open={searchState.show}
				/>
			)}
			{artistState.display && (
				<ArtistView
					z={artistZ + 10}
					open={artistState.show}
					id={artist.id}
					ref={artistToggle}
				/>
			)}
			{albumState.display && (
				<AlbumView
					z={albumZ + 10}
					open={albumState.show}
					id={album.id}
					ref={albumToggle}
				/>
			)}
			{editState.display && (
				<EditOverlay
					z={Math.max(searchZ, artistZ, albumZ) + 20}
					open={editState.show}
					ref={editToggle}
				/>
			)}
		</>
	)
}