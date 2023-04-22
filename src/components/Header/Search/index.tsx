import { type CSSProperties, useEffect, useId, useRef, useState, useDeferredValue, type RefObject, forwardRef, ForwardedRef } from "react"
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

const ArtistSearch = forwardRef(function _ArtistSearch ({
	enabled,
	input,
	onSelect,
}: {
	enabled: boolean
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "artist", id: string }) => void
}, ref: ForwardedRef<HTMLDivElement>) {
	const { data: artistsRaw } = trpc.artist.searchable.useQuery(undefined, { enabled })
	const artists = useAsyncInputStringDistance(input, 45, artistsRaw || defaultArray)

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Artists</SectionTitle>
			<ArtistList
				ref={ref}
				artists={artists}
				onSelect={({ id }) => onSelect({ type: "artist", id })}
				loading={!artists.length}
			/>
		</div>
	)
})

const AlbumSearch = forwardRef(function _AlbumSearch ({
	enabled,
	input,
	onSelect,
}: {
	enabled: boolean
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "album", id: string }) => void
}, ref: ForwardedRef<HTMLDivElement>) {
	const { data: albumsRaw } = trpc.album.searchable.useQuery(undefined, { enabled })
	const _albums = useAsyncInputStringDistance(input, 44, albumsRaw || defaultArray, ["name", "artists"])
	const deferredAlbums = useDeferredValue(_albums)
	const albums = deferredAlbums.length === 0 ? _albums : deferredAlbums

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Albums</SectionTitle>
			<AlbumList
				ref={ref}
				scrollable
				albums={albums}
				onSelect={({ id }) => onSelect({ type: "album", id })}
				loading={!albums.length}
			/>
		</div>
	)
})

function GenreSearch ({
	enabled,
	input,
	onSelect,
}: {
	enabled: boolean
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "genre", id: string }) => void
}) {
	const { data: genresRaw } = trpc.genre.list.useQuery(undefined, { enabled })
	const _genres = useAsyncInputStringDistance(input, 16, genresRaw || defaultArray)
	const genres = useDeferredValue(_genres)

	if (!genres.length) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Genres</SectionTitle>
			<GenreList
				genres={genres}
				onSelect={({ id }) => onSelect({ type: "genre", id })}
			/>
		</div>
	)
}

function PlaylistSearch ({
	enabled,
	input,
	onSelect,
}: {
	enabled: boolean
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "playlist", id: string }) => void
}) {
	const { data: playlistsRaw } = trpc.playlist.searchable.useQuery(undefined, { enabled })
	const _playlists = useAsyncInputStringDistance(input, 6, playlistsRaw || defaultArray, ["name", "artists"])
	const playlists = useDeferredValue(_playlists)

	if (!playlists.length) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Playlists</SectionTitle>
			<PlaylistList
				playlists={playlists}
				onSelect={({ id }) => onSelect({ type: "playlist", id })}
			/>
		</div>
	)
}

function TrackSearch ({
	enabled,
	input,
	onSelect,
}: {
	enabled: boolean
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "track", id: string }) => void
}) {
	const { data: tracksRaw } = trpc.track.searchable.useQuery(undefined, { enabled })
	const _tracks = useAsyncInputStringDistance(input, 25, tracksRaw || defaultArray, ["name", "artist.name", "album.name"])
	const tracks = useDeferredValue(_tracks)

	if (!tracks.length) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Tracks</SectionTitle>
			<TrackList
				tracks={tracks}
				onSelect={({ id }) => onSelect({ type: "track", id })}
			/>
		</div>
	)
}

function LatestSearches () {
	const { data: latestSearches = [] } = usePastSearchesQuery()

	if (latestSearches.length === 0) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Recent searches</SectionTitle>
			{latestSearches.map((item) => (
				<PastSearch key={item.id} id={item.id} type={item.type} />
			))}
		</div>
	)
}

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
				{showPast && (
					<LatestSearches />
				)}
				{!showPast && (
					<>
						<ArtistSearch
							ref={artistList}
							onSelect={onSelect}
							enabled={enabled}
							input={input}
						/>
						<AlbumSearch
							ref={albumList}
							onSelect={onSelect}
							enabled={enabled}
							input={input}
						/>
						<GenreSearch
							onSelect={onSelect}
							enabled={enabled}
							input={input}
						/>
						<PlaylistSearch
							onSelect={onSelect}
							enabled={enabled}
							input={input}
						/>
						<TrackSearch
							onSelect={onSelect}
							enabled={enabled}
							input={input}
						/>
					</>
				)}
			</output>
		</>
	)
}