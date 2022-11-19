import Search from "./Search"
import styles from "./index.module.css"
import { albumView, artistView, mainView, panelStack, searchView, useShowHome } from "components/AppContext"
import useDisplayAndShow from "components/useDisplayAndShow"
import { signOut } from "next-auth/react"
import { CSSProperties, useRef } from "react"
import ArtistView from "./Artist"
import AlbumView from "./Album"
import { trpc } from "utils/trpc"
import SearchIcon from "icons/search.svg"
import LogoutIcon from "icons/logout.svg"
import DashboardIcon from "icons/dashboard.svg"
import QueueMusicIcon from "icons/queue_music.svg"
import { useAtom, useAtomValue } from "jotai"
import Upload from "./Upload"

export default function Header() {
	const stack = useAtomValue(panelStack)
	const searchZ = stack.indexOf("search")
	const artistZ = stack.indexOf("artist")
	const albumZ = stack.indexOf("album")
	
	const [search, setSearch] = useAtom(searchView)
	const [artist, setArtist] = useAtom(artistView)
	const [album, setAlbum] = useAtom(albumView)

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

	// prefetch select queries
	trpc.useQuery(["track.searchable"])

	const showHome = useShowHome()
	const main = useAtomValue(mainView)
	const showDashboardIcon = main === "home"
	const onClickMainIcon = showDashboardIcon
		? () => showHome("suggestions")
		: () => showHome("home")

	return (
		<>
			<div className={styles.head}>
				<div className={styles.bg} />
				<button onClick={() => signOut()} className={styles.button}>
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
		</>
	)
}