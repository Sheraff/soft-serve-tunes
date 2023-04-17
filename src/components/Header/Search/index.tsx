import { type CSSProperties, useEffect, useId, useRef, useState } from "react"
import useAsyncInputStringDistance from "./useAsyncInputFilter"
import styles from "./index.module.css"
import ArtistList from "components/ArtistList"
import AlbumList from "components/AlbumList"
import GenreList from "components/GenreList"
import TrackList from "components/TrackList"
import PastSearch from "./PastSearch"
import { usePastSearchesMutation, usePastSearchesQuery } from "client/db/indexedPastSearches"
import SectionTitle from "atoms/SectionTitle"
import { trpc } from "utils/trpc"
import PlaylistList from "components/PlaylistList"

const defaultArray = [] as never[]

export default function Search ({
	open,
	z,
}: {
	open: boolean
	z: number
}) {

	const head = useRef<HTMLFormElement>(null)
	const input = useRef<HTMLInputElement>(null)
	const results = useRef<HTMLOutputElement>(null)
	const artistList = useRef<HTMLDivElement>(null)
	const albumList = useRef<HTMLDivElement>(null)
	const [enabled, setEnabled] = useState(false)

	const { data: tracksRaw } = trpc.track.searchable.useQuery(undefined, { enabled })
	const { data: albumsRaw } = trpc.album.searchable.useQuery(undefined, { enabled })
	const { data: artistsRaw } = trpc.artist.searchable.useQuery(undefined, { enabled })
	const { data: genresRaw } = trpc.genre.list.useQuery(undefined, { enabled })
	const { data: playlistsRaw } = trpc.playlist.searchable.useQuery(undefined, { enabled })

	const tracks = useAsyncInputStringDistance(input, 25, tracksRaw || defaultArray, ["name", "artist.name", "album.name"])
	const albums = useAsyncInputStringDistance(input, 44, albumsRaw || defaultArray, ["name", "artists"])
	const artists = useAsyncInputStringDistance(input, 45, artistsRaw || defaultArray)
	const genres = useAsyncInputStringDistance(input, 21, genresRaw || defaultArray)
	const playlists = useAsyncInputStringDistance(input, 6, playlistsRaw || defaultArray, ["name", "artists"])

	const [showPast, setShowPast] = useState(true)

	// handle focus because it toggles the virtual keyboard
	useEffect(() => {
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
		}, { once: true, signal: controller.signal })
		head.current.addEventListener("submit", (e) => {
			e.preventDefault()
			if (input.current) {
				input.current.blur()
			}
		}, { signal: controller.signal })
		input.current.addEventListener("focus", () => {
			results.current?.scroll({
				top: 0,
				behavior: "smooth",
			})
			artistList.current?.scroll({
				left: 0,
				behavior: "smooth"
			})
			albumList.current?.scroll({
				left: 0,
				behavior: "smooth"
			})
		}, { signal: controller.signal, passive: true })
		let lastScroll = 0
		results.current.addEventListener("scroll", () => {
			const scroll = results.current?.scrollTop || 0
			if (scroll > lastScroll) {
				input.current?.blur()
			}
			lastScroll = scroll
		}, { signal: controller.signal, passive: true })
		return () => controller.abort()
	}, [showPast, open])

	const { data: latestSearches = [] } = usePastSearchesQuery()
	const { mutate: onSelect } = usePastSearchesMutation()

	const id = useId()
	return (
		<>
			<form
				ref={head}
				className={styles.head}
				data-open={open}
				id={id}
				style={{ "--z": z } as CSSProperties}
			>
				<input
					ref={input}
					type="text"
					onFocus={!enabled ? (() => { setEnabled(true) }) : undefined}
					onChange={() => input.current?.value ? setShowPast(false) : setShowPast(true)}
					defaultValue=""
					inputMode="search"
				/>
			</form>
			<output
				ref={results}
				className={styles.results}
				data-open={open}
				htmlFor={id}
				style={{ "--z": z } as CSSProperties}
			>
				{showPast && latestSearches.length > 0 && (
					<div>
						<SectionTitle className={styles.sectionTitle}>Recent searches</SectionTitle>
						{latestSearches.map((item) => (
							<PastSearch key={item.id} id={item.id} type={item.type} />
						))}
					</div>
				)}
				{!showPast && (
					<div>
						<SectionTitle className={styles.sectionTitle}>Artists</SectionTitle>
						<ArtistList
							ref={artistList}
							artists={artists}
							onSelect={({ id }) => onSelect({ type: "artist", id })}
							loading={!artists.length}
						/>
					</div>
				)}
				{!showPast && (
					<div>
						<SectionTitle className={styles.sectionTitle}>Albums</SectionTitle>
						<AlbumList
							ref={albumList}
							scrollable
							albums={albums}
							onSelect={({ id }) => onSelect({ type: "album", id })}
							loading={!albums.length}
						/>
					</div>
				)}
				{!showPast && Boolean(genres.length) && (
					<div>
						<SectionTitle className={styles.sectionTitle}>Genres</SectionTitle>
						<GenreList
							genres={genres}
							onSelect={({ id }) => onSelect({ type: "genre", id })}
						/>
					</div>
				)}
				{!showPast && Boolean(playlists.length) && (
					<div>
						<SectionTitle className={styles.sectionTitle}>Playlists</SectionTitle>
						<PlaylistList
							playlists={playlists}
							onSelect={({ id }) => onSelect({ type: "playlist", id })}
						/>
					</div>
				)}
				{!showPast && Boolean(tracks.length) && (
					<div>
						<SectionTitle className={styles.sectionTitle}>Tracks</SectionTitle>
						<TrackList
							tracks={tracks}
							onSelect={({ id }) => onSelect({ type: "track", id })}
						/>
					</div>
				)}
			</output>
		</>
	)
}