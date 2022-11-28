import Dialog from "atoms/Dialog"
import SectionTitle from "atoms/SectionTitle"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import revalidateSwCache from "client/sw/revalidateSwCache"
import AlbumList from "components/AlbumList"
import { useShowHome } from "components/AppContext"
import asyncPersistedAtom from "client/db/asyncPersistedAtom"
import ArtistList from "components/ArtistList"
import GenreList from "components/GenreList"
import PlaylistList from "components/PlaylistList"
import TrackList from "components/TrackList"
import FilterIcon from "icons/filter_list.svg"
import PlaylistIcon from "icons/queue_music.svg"
import { useAtom } from "jotai"
import { memo, Suspense, useEffect, useState } from "react"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"
import PillChoice from "./PillChoice"

const FEATURES = {
	danceability: {
		asc: {
			qualifier: "hectic",
			description: "Hectic {{type}}",
		},
		desc: {
			qualifier: "beats",
			description: "{{Type}} with the strongest beat",
		},
	},
	energy: {
		asc: {
			qualifier: "chill",
			description: "Relaxing {{type}}",
		},
		desc: {
			qualifier: "high-octane",
			description: "High-octane {{type}}",
		},
	},
	acousticness: {
		asc: {
			qualifier: "electric",
			description: "Electric {{type}}",
		},
		desc: {
			qualifier: "acoustic",
			description: "Acoustic {{type}}",
		},
	},
	instrumentalness: {
		asc: {
			qualifier: "song",
			description: "{{Type}} to sing along",
		},
		desc: {
			qualifier: "instrumental",
			description: "Most instrumental {{type}}",
		},
	},
	liveness: {
		asc: {
			qualifier: "studio",
			description: "{{Type}} recorded in a studio",
		},
		desc: {
			qualifier: "live",
			description: "{{Type}} performed live",
		},
	},
	valence: {
		asc: {
			qualifier: "euphoric",
			description: "Cheerful {{type}}",
		},
		desc: {
			qualifier: "depressed",
			description: "Depressing {{type}}",
		},
	},
} as const

type Option = {label: string, key: keyof typeof FEATURES, type: keyof typeof FEATURES[keyof typeof FEATURES] }
const options = Object.entries(FEATURES).map(([key, {asc, desc}]) => ([
	{label: asc.qualifier, key, type: "asc"},
	{label: desc.qualifier, key, type: "desc"},
])) as [Option, Option][]

function moustache(description: `${string}{{type}}${string}` | `{{Type}}${string}`, type: "tracks" | "albums") {
	const [first, ...rest] = type
	const capitalized = [(first as string).toUpperCase(), ...rest].join("")
	const replaceFirst = description.replace("{{Type}}", capitalized)
	const replaceOther = replaceFirst.replace("{{type}}", type)
	return replaceOther
}

export const preferredTrackList = asyncPersistedAtom<{
	trait: keyof typeof FEATURES
	order: "asc" | "desc"
}>("preferredTrackList", {
	trait: "danceability",
	order: "desc"
})

function TracksByTraitSuggestion() {
	const [open, setOpen] = useState(false)
	const [{trait, order}, setPreferredTracks] = useAtom(preferredTrackList)
	const onSelect = (option: Option) => {
		setOpen(false)
		setPreferredTracks({
			trait: option.key,
			order: option.type,
		})
	}
	const makePlaylist = useMakePlaylist()
	const showHome = useShowHome()
	const {data: tracks = []} = trpc.track.byTrait.useQuery({trait, order})
	const title = moustache(FEATURES[trait][order].description, "tracks")
	return (
		<>
			<SectionTitle>{title}</SectionTitle>
			<div className={styles.buttons}>
				<button type="button" onClick={() => {
					makePlaylist({type: "by-trait", order, trait}, title)
					showHome("home")
				}}><PlaylistIcon /></button>
				<button type="button" onClick={() => setOpen(true)}><FilterIcon /></button>
			</div>
			<Dialog title="Choose your mood" open={open} onClose={() => setOpen(false)}>
				<PillChoice options={options} onSelect={onSelect} current={FEATURES[trait][order].qualifier}/>
			</Dialog>
			<TrackList tracks={tracks} />
		</>
	)
}

export const preferredAlbumList = asyncPersistedAtom<{
	trait: keyof typeof FEATURES
	order: "asc" | "desc"
}>("preferredAlbumList", {
	trait: "danceability",
	order: "desc"
})

function AlbumsByTraitSuggestion() {
	const [open, setOpen] = useState(false)
	const [{trait, order}, setPreferredAlbums] = useAtom(preferredAlbumList)
	const onSelect = (option: Option) => {
		setOpen(false)
		setPreferredAlbums({
			trait: option.key,
			order: option.type,
		})
	}
	const {data: albums = [], isLoading} = trpc.album.byTrait.useQuery({trait, order})
	return (
		<>
			<SectionTitle>{moustache(FEATURES[trait][order].description, "albums")}</SectionTitle>
			<div className={styles.buttons}>
				<button type="button" onClick={() => setOpen(true)}><FilterIcon /></button>
			</div>
			<Dialog title="Choose your mood" open={open} onClose={() => setOpen(false)}>
				<PillChoice options={options} onSelect={onSelect} current={FEATURES[trait][order].qualifier}/>
			</Dialog>
			<AlbumList albums={albums}  lines={1} scrollable loading={isLoading}/>
		</>
	)
}

let updateSuggestionTimeoutId: ReturnType<typeof setTimeout> | null = null
const UpdateSuggestions = () => {
	useEffect(() => {
		if (updateSuggestionTimeoutId) {
			clearTimeout(updateSuggestionTimeoutId)
		}
		return () => {
			updateSuggestionTimeoutId = setTimeout(() => {
				updateSuggestionTimeoutId = null
				revalidateSwCache(["artist", "mostFav"])
				revalidateSwCache(["artist", "mostRecentListen"])
				revalidateSwCache(["artist", "leastRecentListen"])
				revalidateSwCache(["album", "mostFav"])
				revalidateSwCache(["album", "mostRecentListen"])
				revalidateSwCache(["album", "mostRecentAdd"])
				revalidateSwCache(["genre", "mostFav"])
			}, 20_000)
		}
	}, [])
	return null
}

export default memo(function Suggestions(){

	const {data: artistFavs = [], isLoading: artistFavsLoading} = trpc.artist.mostFav.useQuery()
	const {data: artistRecent = [], isLoading: artistRecentLoading} = trpc.artist.mostRecentListen.useQuery()
	const {data: artistLongTime = [], isLoading: artistLongTimeLoading} = trpc.artist.leastRecentListen.useQuery()
	const {data: albumFavs = [], isLoading: albumFavsLoading} = trpc.album.mostFav.useQuery()
	const {data: albumRecent = [], isLoading: albumRecentLoading} = trpc.album.mostRecentListen.useQuery()
	const {data: albumNewest = [], isLoading: albumNewestLoading} = trpc.album.mostRecentAdd.useQuery()
	const {data: genreFavs = []} = trpc.genre.mostFav.useQuery()
	const {data: playlists = []} = trpc.playlist.list.useQuery(undefined, {
		select(playlists) {
			return playlists.slice(0, 4)
		}
	})

	return (
		<div className={styles.scrollable}>
			<UpdateSuggestions />
			<div className={styles.main}>
				<div className={styles.section}>
					<SectionTitle>Recently listened artists</SectionTitle>
					<ArtistList artists={artistRecent} lines={1} loading={artistRecentLoading} />
				</div>
				<div className={styles.section}>
					<Suspense>
						<AlbumsByTraitSuggestion />
					</Suspense>
				</div>
				<div className={styles.section}>
					<SectionTitle>Favorite genres</SectionTitle>
					<GenreList genres={genreFavs} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Recently listened albums</SectionTitle>
					<AlbumList albums={albumRecent} lines={1} scrollable loading={albumRecentLoading}/>
				</div>
				<div className={styles.section}>
					<SectionTitle>Favorite artists</SectionTitle>
					<ArtistList artists={artistFavs} lines={1} loading={artistFavsLoading} />
				</div>
				{playlists.length > 0 && (
					<div className={styles.section}>
						<SectionTitle>Recent playlists</SectionTitle>
						<PlaylistList playlists={playlists}/>
					</div>
				)}
				<div className={styles.section}>
					<Suspense>
						<TracksByTraitSuggestion />
					</Suspense>
				</div>
				<div className={styles.section}>
					<SectionTitle>Favorite albums</SectionTitle>
					<AlbumList albums={albumFavs} lines={1} scrollable loading={albumFavsLoading}/>
				</div>
				<div className={styles.section}>
					<SectionTitle>Artists not played in a while</SectionTitle>
					<ArtistList artists={artistLongTime} lines={1} loading={artistLongTimeLoading} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Newest albums</SectionTitle>
					<AlbumList albums={albumNewest} lines={1} scrollable loading={albumNewestLoading}/>
				</div>
			</div>
		</div>
	)
})