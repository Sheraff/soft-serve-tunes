import classNames from "classnames"
import { useCurrentTrackDetails, usePlaylistExtractedDetails } from "client/db/useMakePlaylist"
import { useQuery } from "react-query"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"

export default function Cover() {
	// const track = useCurrentTrackDetails()
	const {albums} = usePlaylistExtractedDetails()

	const trpcClient = trpc.useContext()
	const {data: data = []} = useQuery(["playlist-cover", ...(albums?.map(([id]) => id) || [])], {
		enabled: Boolean(albums?.length),
		queryFn: () => {
			if (!albums) return []
			return Promise.all(albums.map(([id]) => (
				trpcClient.fetchQuery(["album.miniature", {id}])
			)))
		},
		select: (data) => {
			return data.filter(a => a?.cover) as Exclude<typeof data[number], null>[]
		}
	})

	console.log('data', data)
	return (
		<div className={classNames(styles.main, styles[`count-${data.length}`])}>
			{data.map((album) => (
				<img
					key={album.id}
					className={styles.img}
					src={`/api/cover/${album.cover!.id}`}
					alt=""
				/>
			))}
		</div>
	)
}