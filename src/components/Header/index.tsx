import Search from "./Search"
import styles from "./index.module.css"
import { useAppState } from "../AppContext"
import useDisplayAndShow from "../useDisplayAndShow"
import { useRef } from "react"
import ArtistView from "./Artist"
import { trpc } from "../../utils/trpc"

export default function Header() {
	const {view, setAppState} = useAppState()

	const searchToggle = useRef<HTMLButtonElement>(null)
	const searchState = useDisplayAndShow(view.type === "search", searchToggle)
	const artistToggle = useRef<HTMLDivElement>(null)
	const artistState = useDisplayAndShow(view.type === "artist", artistToggle)

	// prefetch select queries
	trpc.useQuery(["track.list"])

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
					🔎
				</button>
			</div>
			{searchState.display && (
				<Search open={searchState.show} />
			)}
			{artistState.display && (
				<ArtistView open={artistState.show} id={view.id as string} ref={artistToggle}/>
			)}
		</>
	)
}