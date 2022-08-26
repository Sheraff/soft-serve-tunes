import Search from "./Search"
import styles from "./index.module.css"
import { useAppState } from "components/AppContext"
import useDisplayAndShow from "components/useDisplayAndShow"
import { signOut } from "next-auth/react"
import { useRef } from "react"
import ArtistView from "./Artist"
import AlbumView from "./Album"
import { trpc } from "utils/trpc"
import SearchIcon from "icons/search.svg"
import LogoutIcon from "icons/logout.svg"
import DashboardIcon from "icons/dashboard.svg"
import QueueMusicIcon from "icons/queue_music.svg"

export default function Header() {
	const {view, main, setAppState} = useAppState()

	const searchToggle = useRef<HTMLButtonElement>(null)
	const searchState = useDisplayAndShow(view.type === "search", searchToggle)
	const artistToggle = useRef<HTMLDivElement>(null)
	const artistState = useDisplayAndShow(view.type === "artist", artistToggle)
	const albumToggle = useRef<HTMLDivElement>(null)
	const albumState = useDisplayAndShow(view.type === "album", albumToggle)

	// prefetch select queries
	trpc.useQuery(["track.searchable"])

	console.log('header', view)

	const showDashboardIcon = main.type === "home"
	const onClickMainIcon = showDashboardIcon
		? () => setAppState({view: {type: "suggestions"}})
		: () => setAppState({view: {type: "home"}})

	return (
		<>
			<div className={styles.head}>
				<button onClick={() => signOut()} className={styles.logout}>
					<LogoutIcon />
				</button>
				<button onClick={onClickMainIcon} className={styles.logout}>
					{showDashboardIcon && <DashboardIcon />}
					{!showDashboardIcon && <QueueMusicIcon />}
				</button>
				<button
					ref={searchToggle}
					className={styles.toggle}
					data-open={searchState.show}
					onClick={() => {
						if (view.type === "search") {
							history.back()
						} else {
							setAppState({view: {type: "search"}})
						}
					}}
				>
					<SearchIcon />
				</button>
			</div>
			{searchState.display && (
				<Search open={searchState.show} />
			)}
			{artistState.display && (
				<ArtistView open={artistState.show} id={view.id as string} ref={artistToggle}/>
			)}
			{albumState.display && (
				<AlbumView open={albumState.show} id={view.id as string} ref={albumToggle}/>
			)}
		</>
	)
}