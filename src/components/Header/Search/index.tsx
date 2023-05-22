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
import OfflineIcon from "icons/wifi_off.svg"
import OnlineIcon from "icons/wifi_on.svg"
import {
	prefetchCachedAlbumList,
	prefetchCachedArtistList,
	prefetchCachedGenreList,
	prefetchCachedPlaylistList,
	prefetchCachedTrackList,
	useCachedAlbumList,
	useCachedArtistList,
	useCachedGenreList,
	useCachedPlaylistList,
	useCachedTrackList,
} from "client/sw/useSWCached"

const defaultArray = [] as never[]

const ArtistSearch = forwardRef(function _ArtistSearch({
	input,
	onSelect,
	offline,
	hidden,
}: {
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "artist", id: string }) => void
	offline: boolean
	hidden: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const { data: artistsRaw } = offline
		? useCachedArtistList() // eslint-disable-line react-hooks/rules-of-hooks -- offline is a key of this component
		: trpc.artist.searchable.useQuery()
	const artists = useAsyncInputStringDistance({
		inputRef: input,
		size: 45,
		dataList: artistsRaw || defaultArray,
	})

	if (hidden) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Artists</SectionTitle>
			<ArtistList
				ref={ref}
				artists={artists}
				onSelect={({ id }) => onSelect({ type: "artist", id })}
				loading={!artists.length}
				forceAvailable={offline}
			/>
		</div>
	)
})

const AlbumSearch = forwardRef(function _AlbumSearch({
	input,
	onSelect,
	offline,
	hidden,
}: {
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "album", id: string }) => void
	offline: boolean
	hidden: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const { data: albumsRaw } = offline
		? useCachedAlbumList() // eslint-disable-line react-hooks/rules-of-hooks -- offline is a key of this component
		: trpc.album.searchable.useQuery()
	const _albums = useAsyncInputStringDistance({
		inputRef: input,
		size: 44,
		dataList: albumsRaw || defaultArray,
		keys: ["name", "artists"],
	})
	const deferredAlbums = useDeferredValue(_albums)
	const albums = deferredAlbums.length === 0 ? _albums : deferredAlbums

	if (hidden) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Albums</SectionTitle>
			<AlbumList
				ref={ref}
				scrollable
				albums={albums}
				onSelect={({ id }) => onSelect({ type: "album", id })}
				loading={!albums.length}
				forceAvailable={offline}
			/>
		</div>
	)
})

function GenreSearch({
	input,
	onSelect,
	offline,
	hidden,
}: {
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "genre", id: string }) => void
	offline: boolean
	hidden: boolean
}) {
	const { data: genresRaw } = offline
		? useCachedGenreList() // eslint-disable-line react-hooks/rules-of-hooks -- offline is a key of this component
		: trpc.genre.searchable.useQuery()
	const _genres = useAsyncInputStringDistance({
		inputRef: input,
		size: 12,
		dataList: genresRaw || defaultArray,
	})
	const genres = useDeferredValue(_genres)

	if (hidden || !genres.length) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Genres</SectionTitle>
			<GenreList
				genres={genres}
				onSelect={({ id }) => onSelect({ type: "genre", id })}
				forceAvailable={offline}
			/>
		</div>
	)
}

function PlaylistSearch({
	input,
	onSelect,
	offline,
	hidden,
}: {
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "playlist", id: string }) => void
	offline: boolean
	hidden: boolean
}) {
	const { data: playlistsRaw } = offline
		? useCachedPlaylistList() // eslint-disable-line react-hooks/rules-of-hooks -- offline is a key of this component
		: trpc.playlist.searchable.useQuery()
	const _playlists = useAsyncInputStringDistance({
		inputRef: input,
		size: 3,
		dataList: playlistsRaw || defaultArray,
		keys: ["name", "artists"],
	})
	const playlists = useDeferredValue(_playlists)

	if (hidden || !playlists.length) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Playlists</SectionTitle>
			<PlaylistList
				playlists={playlists}
				onSelect={({ id }) => onSelect({ type: "playlist", id })}
				forceAvailable={offline}
			/>
		</div>
	)
}

function TrackSearch({
	input,
	onSelect,
	offline,
	hidden,
}: {
	input: RefObject<HTMLInputElement>
	onSelect: (item: { type: "track", id: string }) => void
	offline: boolean
	hidden: boolean
}) {
	const { data: tracksRaw } = offline
		? useCachedTrackList() // eslint-disable-line react-hooks/rules-of-hooks -- offline is a key of this component
		: trpc.track.searchable.useQuery()
	const _tracks = useAsyncInputStringDistance({
		inputRef: input,
		size: 12,
		dataList: tracksRaw || defaultArray,
		keys: ["name", "artist.name", "album.name"],
	})
	const tracks = useDeferredValue(_tracks)

	if (hidden || !tracks.length) return null

	return (
		<div>
			<SectionTitle className={styles.sectionTitle}>Tracks</SectionTitle>
			<TrackList
				tracks={tracks}
				onSelect={({ id }) => onSelect({ type: "track", id })}
				forceAvailable={offline}
			/>
		</div>
	)
}

function LatestSearches() {
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

export default function Search({
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

	const [showPast, setShowPast] = useState(true)
	const keepWorkersHot = useRef(false)

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

	const [offline, setOffline] = useState(false)

	const prefetches = useRef({ queries: false, caches: false })
	const trpcClient = trpc.useContext()
	const prefetchQueries = () => {
		if (prefetches.current.queries) return
		prefetches.current.queries = true
		trpcClient.artist.searchable.prefetch()
		trpcClient.album.searchable.prefetch()
		trpcClient.genre.searchable.prefetch()
		trpcClient.playlist.searchable.prefetch()
		trpcClient.track.searchable.prefetch()
	}
	const prefetchCache = () => {
		if (prefetches.current.caches) return
		prefetches.current.caches = true
		prefetchCachedArtistList()
		prefetchCachedAlbumList()
		prefetchCachedGenreList()
		prefetchCachedPlaylistList()
		prefetchCachedTrackList()
	}

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
					onFocus={() => {
						if (offline) prefetchCache()
						else prefetchQueries()
					}}
					onChange={() => {
						const newShowPast = !input.current?.value
						if (newShowPast === showPast) return
						setShowPast(newShowPast)
						keepWorkersHot.current = true
					}}
					defaultValue=""
					inputMode="search"
				/>
				<button
					type="button"
					onClick={() => {
						setOffline(!offline)
						if (!offline) prefetchCache()
						else prefetchQueries()
					}}
				>
					{offline ? <OfflineIcon /> : <OnlineIcon />}
					<span>{offline ? "offline" : "online"}</span>
				</button>
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
				{keepWorkersHot.current && (
					<>
						<ArtistSearch
							ref={artistList}
							onSelect={onSelect}
							input={input}
							offline={offline}
							key={`Artist${offline}`}
							hidden={showPast}
						/>
						<AlbumSearch
							ref={albumList}
							onSelect={onSelect}
							input={input}
							offline={offline}
							key={`Album${offline}`}
							hidden={showPast}
						/>
						<GenreSearch
							onSelect={onSelect}
							input={input}
							offline={offline}
							key={`Genre${offline}`}
							hidden={showPast}
						/>
						<PlaylistSearch
							onSelect={onSelect}
							input={input}
							offline={offline}
							key={`Playlist${offline}`}
							hidden={showPast}
						/>
						<TrackSearch
							onSelect={onSelect}
							input={input}
							offline={offline}
							key={`Track${offline}`}
							hidden={showPast}
						/>
					</>
				)}
			</output>
		</>
	)
}