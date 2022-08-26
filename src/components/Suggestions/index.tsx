import Dialog from "atoms/Dialog"
import SectionTitle from "atoms/SectionTitle"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import AlbumList from "components/AlbumList"
import ArtistList from "components/ArtistList"
import GenreList from "components/GenreList"
import TrackList from "components/TrackList"
import FilterIcon from "icons/filter_list.svg"
import { ReactNode, useState } from "react"
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

function moustache(description: `${string}{{type}}${string}` | `{{Type}}${string}`, type: "track" | "album") {
	const [first, ...rest] = type
	const capitalized = [(first as string).toUpperCase(), ...rest].join("")
	const replaceFirst = description.replace("{{Type}}", capitalized)
	const replaceOther = replaceFirst.replace("{{type}}", type)
	return replaceOther
}

export default function Suggestions(){

	const [open, setOpen] = useState(false)
	const [trait, setTrait] = useState<keyof typeof FEATURES>("danceability")
	const [order, setOrder] = useState<"asc" | "desc">("desc")
	const onSelect = (option: Option) => {
		setOpen(false)
		setTrait(option.key)
		setOrder(option.type)
	}

	const {data: artistFavs = []} = useIndexedTRcpQuery(["artist.most-fav"])
	const {data: artistRecent = []} = useIndexedTRcpQuery(["artist.most-recent-listen"])
	const {data: artistNewest = []} = useIndexedTRcpQuery(["artist.most-recent-add"])
	const {data: albumFavs = []} = useIndexedTRcpQuery(["album.most-fav"])
	const {data: albumRecent = []} = useIndexedTRcpQuery(["album.most-recent-listen"])
	const {data: albumNewest = []} = useIndexedTRcpQuery(["album.most-recent-add"])
	const {data: trackDanceable = []} = useIndexedTRcpQuery(["track.most-danceable", {trait, order}])
	const {data: albumDanceable = []} = useIndexedTRcpQuery(["album.most-danceable"])
	const {data: genreFavs = []} = useIndexedTRcpQuery(["genre.most-fav"])

	return (
		<div className={styles.scrollable}>
			<div className={styles.main}>
				<div className={styles.section}>
					<SectionTitle>Favorite artists</SectionTitle>
					<ArtistList artists={artistFavs} lines={1} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Recently listened albums</SectionTitle>
					<AlbumList albums={albumRecent} lines={1} scrollable />
				</div>
				<div className={styles.section}>
					<SectionTitle>{moustache(FEATURES[trait][order].description, "track")}</SectionTitle>
					<button type="button" onClick={() => setOpen(true)}><FilterIcon /></button>
					<Dialog title="Choose your mood" open={open} onClose={() => setOpen(false)}>
						<PillChoice options={options} onSelect={onSelect} current={FEATURES[trait][order].qualifier}/>
					</Dialog>
					<TrackList tracks={trackDanceable} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Favorite genres</SectionTitle>
					<GenreList genres={genreFavs} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Danceable albums</SectionTitle>
					<AlbumList albums={albumDanceable} lines={1} scrollable />
				</div>
				<div className={styles.section}>
					<SectionTitle>Recently listened artists</SectionTitle>
					<ArtistList artists={artistRecent} lines={1} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Favorite albums</SectionTitle>
					<AlbumList albums={albumFavs} lines={1} scrollable />
				</div>
				<div className={styles.section}>
					<SectionTitle>Newest artists</SectionTitle>
					<ArtistList artists={artistNewest} lines={1} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Newest albums</SectionTitle>
					<AlbumList albums={albumNewest} lines={1} scrollable />
				</div>
			</div>
		</div>
	)
}