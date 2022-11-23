import SectionTitle from "atoms/SectionTitle"
import classNames from "classnames"
import { usePlaylistExtractedDetails } from "client/db/useMakePlaylist"
import { useMemo } from "react"
import { useQuery } from "react-query"
import { type inferQueryOutput, trpc } from "utils/trpc"
import styles from "./index.module.css"

function playlistArtistName(
	artistData: Array<Exclude<inferQueryOutput<"artist.miniature">, undefined | null>>,
) {
	const MAX = 3
	if (artistData.length === 0) return ''
	if (artistData.length === 1) return ` by ${artistData[0]!.name}`
	const nameList = artistData.slice(0, MAX).map(({name}) => name)
	const formatter = new Intl.ListFormat('en-US', { style: "short" })
	if (artistData.length <= MAX) {
		return ` by ${formatter.format(nameList)}`
	}
	return ` by ${formatter.format(nameList.concat('others'))}`
}

export default function Cover() {
	const {albums, artists, name, length} = usePlaylistExtractedDetails()

	const trpcClient = trpc.useContext()
	const {data: albumData = []} = useQuery(["playlist-cover", {ids: (albums?.map(([id]) => id) || [])}], {
		enabled: Boolean(albums?.length),
		queryFn: () => {
			if (!albums) return []
			return Promise.all(albums.map(([id]) => (
				trpcClient.fetchQuery(["album.miniature", {id}])
			)))
		},
		select: (data) => {
			return data.filter(a => a?.cover) as Exclude<typeof data[number], null>[]
		},
		keepPreviousData: true,
	})
	const {data: artistData = []} = useQuery(["playlist-artist-data", {ids: (artists?.map(([id]) => id) || [])}], {
		enabled: Boolean(artists?.length),
		queryFn: () => {
			if (!artists) return []
			return Promise.all(artists.map(([id]) => (
				trpcClient.fetchQuery(["artist.miniature", {id}])
			)))
		},
		select: (data) => data.filter(a => a) as Exclude<typeof data[number], null>[],
		keepPreviousData: true,
	})
	const credits = useMemo(
		() => playlistArtistName(artistData),
		[artistData]
	)

	return (
		<>
			<div className={classNames(styles.main, styles[`count-${albumData.length}`])}>
				{albumData.map((album) => (
					<img
						key={album.id}
						className={styles.img}
						src={`/api/cover/${album.cover!.id}`}
						alt=""
					/>
				))}
			</div>
			<div className={styles.details}>
				<SectionTitle>{name}</SectionTitle>
				<p>{`${length ?? 0} track${length > 1 ? 's' : ''}${credits}`}</p>
			</div>
		</>
	)
}