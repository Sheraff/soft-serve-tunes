import Search from "./Search"
import styles from "./index.module.css"
import {
	albumView,
	artistView,
	mainView,
	panelStack,
	playlistView,
	searchView,
	useShowHome,
} from "components/AppContext"
import { editOverlay } from "components/AppContext/editOverlay"
import useDisplayAndShow from "components/useDisplayAndShow"
import { signOut } from "next-auth/react"
import { CSSProperties, useRef } from "react"
import ArtistView from "./Artist"
import AlbumView from "./Album"
import PlaylistView from "./Playlist"
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
	const playlistZ = stack.indexOf("playlist")
	const maxZ = Math.max(searchZ, artistZ, albumZ, playlistZ)
	
	const [search, setSearch] = searchView.useState()
	const [artist, setArtist] = artistView.useState()
	const [album, setAlbum] = albumView.useState()
	const [playlist, setPlaylist] = playlistView.useState()
	const edit = editOverlay.useValue()

	const searchToggle = useRef<HTMLButtonElement>(null)
	const searchState = useDisplayAndShow(search.open, searchToggle, () => {
		if (artist.open) setArtist(prev => ({...prev, open: false}))
		if (album.open) setAlbum(prev => ({...prev, open: false}))
		if (playlist.open) setPlaylist(prev => ({...prev, open: false}))
	})

	const artistToggle = useRef<HTMLDivElement>(null)
	const artistState = useDisplayAndShow(artist.open, artistToggle, () => {
		if (search.open) setSearch(prev => ({...prev, open: false}))
		if (album.open) setAlbum(prev => ({...prev, open: false}))
		if (playlist.open) setPlaylist(prev => ({...prev, open: false}))
	})

	const albumToggle = useRef<HTMLDivElement>(null)
	const albumState = useDisplayAndShow(album.open, albumToggle, () => {
		if (search.open) setSearch(prev => ({...prev, open: false}))
		if (artist.open) setArtist(prev => ({...prev, open: false}))
		if (playlist.open) setPlaylist(prev => ({...prev, open: false}))
	})

	const playlistToggle = useRef<HTMLDivElement>(null)
	const playlistState = useDisplayAndShow(playlist.open, playlistToggle, () => {
		if (search.open) setSearch(prev => ({...prev, open: false}))
		if (album.open) setAlbum(prev => ({...prev, open: false}))
		if (artist.open) setArtist(prev => ({...prev, open: false}))
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
					z={artistZ === -1 ? maxZ + 11 : artistZ + 10}
					open={artistState.show}
					id={artist.id}
					ref={artistToggle}
				/>
			)}
			{albumState.display && (
				<AlbumView
					z={albumZ === -1 ? maxZ + 11 : albumZ + 10}
					open={albumState.show}
					id={album.id}
					ref={albumToggle}
				/>
			)}
			{playlistState.display && (
				<PlaylistView
					z={playlistZ === -1 ? maxZ + 11 : playlistZ + 10}
					open={playlistState.show}
					id={playlist.id}
					ref={playlistToggle}
				/>
			)}
			{editState.display && (
				<EditOverlay
					z={maxZ + 20}
					open={editState.show}
					ref={editToggle}
				/>
			)}
		</>
	)
}