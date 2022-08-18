import { useEffect, useId, useRef, useState } from "react"
import useAsyncInputStringDistance from "./useAsyncInputFilter"
import styles from "./index.module.css"
import useIndexedTRcpQuery from "../../../client/db/useIndexedTRcpQuery"
import ArtistList from "../../ArtistList"
import AlbumList from "../../AlbumList"
import GenreList from "../../GenreList"
import TrackList from "../../TrackList"
import { inferQueryOutput } from "../../../utils/trpc"
import PastSearch, { PastSearchItem } from "./PastSearch"

const defaultArray = [] as never[]

const latestSearches: PastSearchItem[] = []

export default function Search({open}: {open: boolean}) {

	const head = useRef<HTMLFormElement>(null)
	const input = useRef<HTMLInputElement>(null)
	const results = useRef<HTMLOutputElement>(null)
	const [enabled, setEnabled] = useState(false)

	const {data: tracksRaw} = useIndexedTRcpQuery(["track.list"], {enabled})
	const {data: albumsRaw} = useIndexedTRcpQuery(["album.list"], {enabled})
	const {data: artistsRaw} = useIndexedTRcpQuery(["artist.list"], {enabled})
	const {data: genresRaw} = useIndexedTRcpQuery(["genre.list"], {enabled})

	const tracks = useAsyncInputStringDistance(input, tracksRaw || defaultArray, ["name", "artist.name", "album.name"])
	const albums = useAsyncInputStringDistance(input, albumsRaw || defaultArray, ["name", "artist.name"])
	const artists = useAsyncInputStringDistance(input, artistsRaw || defaultArray)
	const genres = useAsyncInputStringDistance(input, genresRaw || defaultArray)

	const [showPast, setShowPast] = useState(true)

	// handle focus because it toggles the virtual keyboard
	useEffect(() => {
		if (showPast) {
			return
		}
		if (!input.current || !head.current || !results.current) {
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
		input.current.addEventListener('focus', () => {
			results.current?.scroll({
				top: 0,
				behavior: 'smooth',
			})
		}, {signal: controller.signal, passive: true})
		let lastScroll = 0
		results.current.addEventListener('scroll', () => {
			const scroll = results.current?.scrollTop || 0
			if (scroll > lastScroll) {
				input.current?.blur()
			}
			lastScroll = scroll
		}, {signal: controller.signal, passive: true})
		return () => controller.abort()
	}, [showPast, open])

	const id = useId()
	return (
		<>
			<form
				ref={head}
				className={styles.head}
				data-open={open}
				id={id}
			>
				<input
					ref={input}
					type="search"
					placeholder="Dee Dee Bridgewater Autumn Leaves"
					onFocus={!enabled ? (() => {setEnabled(true)}) : undefined}
					onChange={() => input.current?.value ? setShowPast(false) : setShowPast(true)}
					defaultValue=""
				/>
			</form>
			<output
				ref={results}
				className={styles.results}
				data-open={open}
				htmlFor={id}
			>
				{showPast && latestSearches.length > 0 && (
					<div>
						<h2 className={styles.sectionTitle}>Recent searches</h2>
						{latestSearches.map((item) => (
							<PastSearch key={item.entity.id} {...item} />
						))}
					</div>
				)}
				{!showPast && Boolean(artists.length) && (
					<div>
						<h2 className={styles.sectionTitle}>Artists</h2>
						<ArtistList
							artists={artists.slice(0, 21)}
							onSelect={(entity: Exclude<inferQueryOutput<"artist.miniature">, null>) => latestSearches.unshift({type: 'artist', entity})}
						/>
					</div>
				)}
				{!showPast && Boolean(albums.length) && (
					<div>
						<h2 className={styles.sectionTitle}>Albums</h2>
						<AlbumList
							albums={albums.slice(0, 28)}
							onSelect={(entity: Exclude<inferQueryOutput<"album.miniature">, null>) => latestSearches.unshift({type: 'album', entity})}
						/>
					</div>
				)}
				{!showPast && Boolean(genres.length) && (
					<div>
						<h2 className={styles.sectionTitle}>Genres</h2>
						<GenreList
							genres={genres.slice(0, 21)}
							onSelect={(entity: Exclude<inferQueryOutput<"genre.list">[number], null>) => latestSearches.unshift({type: 'genre', entity})}
						/>
					</div>
				)}
				{!showPast && Boolean(tracks.length) && (
					<div>
						<h2 className={styles.sectionTitle}>Tracks</h2>
						<TrackList
							tracks={tracks.slice(0, 50)}
							onSelect={(entity: Exclude<inferQueryOutput<"track.miniature">, null>) => latestSearches.unshift({type: 'track', entity})}
						/>
					</div>
				)}
			</output>
		</>
	)
}