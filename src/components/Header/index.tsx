import Search from "./Search"
import styles from "./index.module.css"
import { useAppState } from "components/AppContext"
import useDisplayAndShow from "components/useDisplayAndShow"
import { useRef } from "react"
import ArtistView from "./Artist"
import AlbumView from "./Album"
import { trpc } from "utils/trpc"
import SearchIcon from "icons/search.svg"

export default function Header() {
	const {view, setAppState} = useAppState()

	const searchToggle = useRef<HTMLButtonElement>(null)
	const searchState = useDisplayAndShow(view.type === "search", searchToggle)
	const artistToggle = useRef<HTMLDivElement>(null)
	const artistState = useDisplayAndShow(view.type === "artist", artistToggle)
	const albumToggle = useRef<HTMLDivElement>(null)
	const albumState = useDisplayAndShow(view.type === "album", albumToggle)

	// prefetch select queries
	trpc.useQuery(["track.searchable"])

	console.log('header', view)

	return (
		<>
			<div className={styles.head}>
				<button
					ref={searchToggle}
					className={styles.toggle}
					data-open={searchState.show}
					onClick={() => setAppState(
						({view}) => view.type === "search"
							? {view: {type: "home"}}
							: {view: {type: "search"}}
					)}
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