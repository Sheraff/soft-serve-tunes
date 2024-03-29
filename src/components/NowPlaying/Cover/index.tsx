import classNames from "classnames"
import { usePlaylistExtractedDetails, useRenamePlaylist } from "client/db/useMakePlaylist"
import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"
import SaveButton from "./SaveButton"
import EditableTitle from "atoms/SectionTitle/EditableTitle"
import Images from "./Images"
import usePlaylistDescription from "./usePlaylistDescription"

export default function Cover() {
	const { albums, artists, name, length, id } = usePlaylistExtractedDetails()

	const trpcClient = trpc.useContext()
	// TODO: replace with trpcClient.useQueries?
	const { data: artistData = [] } = useQuery(["playlist-artist-data", { ids: (artists?.map(({ id }) => id) || []) }], {
		enabled: Boolean(artists?.length),
		queryFn: () => {
			if (!artists) return []
			return Promise.all(artists.map(({ id }) => (
				trpcClient.artist.miniature.fetch({ id })
			)))
		},
		keepPreviousData: true,
	})

	const description = usePlaylistDescription({ artistData, length })

	const [editing, setEditing] = useState(false)
	const onTitleEdit = useRef<(newName: string) => void>(() => { })
	const renamePlaylist = useRenamePlaylist()
	onTitleEdit.current = (newName) => {
		navigator.vibrate(1)
		setEditing(false)
		renamePlaylist(newName.trim(), id)
	}
	const onTitleEditStart = useRef<() => void>(() => { })
	onTitleEditStart.current = () => {
		navigator.vibrate(1)
		setEditing(true)
	}

	return (
		<>
			<Images albums={albums} />
			<div className={classNames(styles.panel, { [styles.editing]: editing })}>
				<div className={styles.details}>
					<EditableTitle name={name} onEditEnd={onTitleEdit} onEditStart={onTitleEditStart} />
					<p>{description}</p>
				</div>
				<SaveButton id={id} className={styles.action} />
			</div>
		</>
	)
}