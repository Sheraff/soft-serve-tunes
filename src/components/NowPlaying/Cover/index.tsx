import classNames from "classnames"
import { usePlaylistExtractedDetails, useRenamePlaylist } from "client/db/useMakePlaylist"
import { useMemo, useRef } from "react"
import { useQuery } from "react-query"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"
import SaveButton from "./SaveButton"
import descriptionFromPlaylistCredits from "client/db/utils/descriptionFromPlaylistCredits"
import EditableTitle from "atoms/SectionTitle/EditableTitle"
import SectionTitle from "atoms/SectionTitle"

export default function Cover() {
	const {albums, artists, name, length, id} = usePlaylistExtractedDetails()

	const trpcClient = trpc.useContext()
	const {data: albumData = []} = useQuery(["playlist-cover", {ids: (albums?.map(({id}) => id) || [])}], {
		enabled: Boolean(albums?.length),
		queryFn: () => {
			if (!albums) return []
			return Promise.all(albums.map(({id}) => (
				trpcClient.fetchQuery(["album.miniature", {id}])
			)))
		},
		select: (data) => {
			return data.filter(a => a?.cover) as Exclude<typeof data[number], null>[]
		},
		keepPreviousData: true,
	})
	const {data: artistData = []} = useQuery(["playlist-artist-data", {ids: (artists?.map(({id}) => id) || [])}], {
		enabled: Boolean(artists?.length),
		queryFn: () => {
			if (!artists) return []
			return Promise.all(artists.map(({id}) => (
				trpcClient.fetchQuery(["artist.miniature", {id}])
			)))
		},
		select: (data) => data.filter(a => a) as Exclude<typeof data[number], null>[],
		keepPreviousData: true,
	})
	
	const description = useMemo(() => descriptionFromPlaylistCredits(artistData, length), [artistData, length])

	const onTitleEdit = useRef<(newName: string) => void>(() => {})
	const renamePlaylist = useRenamePlaylist()
	onTitleEdit.current = (newName) => {
		renamePlaylist(id!, newName)
	}

	return (
		<>
			<div className={classNames(styles.main, styles[`count-${albumData.length}` as keyof typeof styles])}>
				{albumData.map((album) => (
					<img
						key={album.id}
						className={styles.img}
						src={`/api/cover/${album.cover!.id}`}
						alt=""
					/>
				))}
			</div>
			<div className={styles.panel}>
				<div className={styles.details}>
					{id && (
						<EditableTitle name={name} onEditEnd={onTitleEdit} />
					)}
					{!id && (
						<SectionTitle>{name}</SectionTitle>
					)}
					<p>{description}</p>
				</div>
				<SaveButton id={id ?? null} className={styles.action} />
			</div>
		</>
	)
}