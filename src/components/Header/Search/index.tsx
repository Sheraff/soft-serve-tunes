import { useCallback, useEffect, useRef, useState } from "react"
import useAsyncInputStringDistance from "./useAsyncInputFilter"
import styles from "./index.module.css"
import AlbumMiniature from "./AlbumMiniature"
import useIndexedTRcpQuery from "../../../client/db/useIndexedTRcpQuery"
import { ListType } from "../../AudioTest"
import useRouteParts from "../../RouteContext"

const defaultArray = [] as never[]

export default function Search({
	open,
	onClose,
}: {
	open: boolean
	onClose: () => void
}) {
	const head = useRef<HTMLFormElement>(null)
	const input = useRef<HTMLInputElement>(null)
	const [enabled, setEnabled] = useState(false)

	const {data: tracksRaw} = useIndexedTRcpQuery(["track.list"], {enabled})
	const {data: albumsRaw} = useIndexedTRcpQuery(["album.list"], {enabled})
	const {data: artistsRaw} = useIndexedTRcpQuery(["artist.list"], {enabled})
	const {data: genresRaw} = useIndexedTRcpQuery(["genre.list"], {enabled})

	const tracks = useAsyncInputStringDistance(input, tracksRaw || defaultArray)
	const albums = useAsyncInputStringDistance(input, albumsRaw || defaultArray)
	const artists = useAsyncInputStringDistance(input, artistsRaw || defaultArray)
	const genres = useAsyncInputStringDistance(input, genresRaw || defaultArray)

	const {setRoute} = useRouteParts()
	const setPlaylist = useCallback((type: ListType, name: string, id: string) => {
		setRoute({type, name, id})
		onClose()
	}, [setRoute, onClose])

	// handle focus because it toggles the virtual keyboard
	useEffect(() => {
		if (!input.current || !head.current) {
			return
		}
		if (!open && document.activeElement === input.current) {
			input.current.blur()
			return
		}
		if (!open) {
			return
		}
		const controller = new AbortController()
		head.current.addEventListener("transitionend", () => {
			if (input.current) {
				input.current.focus()
			}
		}, {once: true, signal: controller.signal})
		head.current.addEventListener("submit", (e) => {
			e.preventDefault()
			if (input.current) {
				input.current.blur()
			}
		}, {signal: controller.signal})
		return () => controller.abort()
	}, [open])

	return (
		<>
			<form ref={head} className={styles.head} data-open={open}>
				<input
					ref={input}
					type="search"
					placeholder="Dee Dee Bridgewater Autumn Leaves"
					onFocus={!enabled ? (() => {setEnabled(true)}) : undefined}
				/>
			</form>
			<div className={styles.results} data-open={open}>
				{Boolean(tracks.length) && (
					<ul>
						{tracks.slice(0, 10).map(item => (
							<li key={item.id}>
								<button
									className={styles.basic}
									onClick={() => setPlaylist("track", item.name, item.id)}
									title={item.name}
								>
									{`${item.name} - ${item.artist?.name}`}
								</button>
							</li>
						))}
					</ul>
				)}
				{Boolean(albums.length) && (
					<ul className={styles.miniatures}>
						{albums.slice(0, 9).map(item => (
							<li key={item.id}>
								<button
									onClick={() => setPlaylist("album", item.name, item.id)}
									title={item.name}
								>
									<AlbumMiniature id={item.id} />
								</button>
							</li>
						))}
					</ul>
				)}
				{Boolean(artists.length) && (
					<ul className={styles.miniatures}>
						{artists.slice(0, 9).map(item => (
							<li key={item.id}>
								<button
									onClick={() => setPlaylist("artist", item.name, item.id)}
									title={item.name}
								>
									<AlbumMiniature id={item.albums[0]?.id} />
								</button>
							</li>
						))}
					</ul>
				)}
				{Boolean(genres.length) && (
					<ul>
						{genres.slice(0, 10).map(item => (
							<li key={item.id}>
								<button
									className={styles.basic}
									onClick={() => setPlaylist("genre", item.name, item.id)}
									title={item.name}
								>
									{`${item.name} (${item._count.tracks} tracks)`}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</>
	)
}