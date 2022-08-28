import Dialog from "atoms/Dialog"
import SectionTitle from "atoms/SectionTitle"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import AlbumList from "components/AlbumList"
import asyncPersistedAtom from "components/AppContext/asyncPersistedAtom"
import ArtistList from "components/ArtistList"
import GenreList from "components/GenreList"
import TrackList from "components/TrackList"
import FilterIcon from "icons/filter_list.svg"
import { useAtom } from "jotai"
import { memo, Suspense, useState } from "react"
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
	const {data: tracks = []} = useIndexedTRcpQuery(["track.by-trait", {trait, order}])
	return (
		<>
			<SectionTitle>{moustache(FEATURES[trait][order].description, "tracks")}</SectionTitle>
			<button type="button" onClick={() => setOpen(true)}><FilterIcon /></button>
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
	const {data: albums = [], isLoading} = useIndexedTRcpQuery(["album.by-trait", {trait, order}])
	return (
		<>
			<SectionTitle>{moustache(FEATURES[trait][order].description, "albums")}</SectionTitle>
			<button type="button" onClick={() => setOpen(true)}><FilterIcon /></button>
			<Dialog title="Choose your mood" open={open} onClose={() => setOpen(false)}>
				<PillChoice options={options} onSelect={onSelect} current={FEATURES[trait][order].qualifier}/>
			</Dialog>
			<AlbumList albums={albums}  lines={1} scrollable loading={isLoading}/>
		</>
	)
}

export default memo(function Suggestions(){

	const {data: artistFavs = [], isLoading: artistFavsLoading} = useIndexedTRcpQuery(["artist.most-fav"])
	const {data: artistRecent = [], isLoading: artistRecentLoading} = useIndexedTRcpQuery(["artist.most-recent-listen"])
	const {data: artistLongTime = [], isLoading: artistLongTimeLoading} = useIndexedTRcpQuery(["artist.least-recent-listen"])
	const {data: albumFavs = [], isLoading: albumFavsLoading} = useIndexedTRcpQuery(["album.most-fav"])
	const {data: albumRecent = [], isLoading: albumRecentLoading} = useIndexedTRcpQuery(["album.most-recent-listen"])
	const {data: albumNewest = [], isLoading: albumNewestLoading} = useIndexedTRcpQuery(["album.most-recent-add"])
	const {data: genreFavs = []} = useIndexedTRcpQuery(["genre.most-fav"])

	return (
		<div className={styles.scrollable}>
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