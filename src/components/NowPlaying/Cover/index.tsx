import classNames from "classnames"
import { usePlaylistExtractedDetails, useRenamePlaylist } from "client/db/useMakePlaylist"
import { Fragment, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"
import SaveButton from "./SaveButton"
import descriptionFromPlaylistCredits from "client/db/useMakePlaylist/descriptionFromPlaylistCredits"
import EditableTitle from "atoms/SectionTitle/EditableTitle"
import SectionTitle from "atoms/SectionTitle"
import { artistView } from "components/AppContext"
import Images from "./Images"

export default function Cover() {
	const {albums, artists, name, length, id} = usePlaylistExtractedDetails()

	const trpcClient = trpc.useContext()
	// TODO: replace with trpcClient.useQueries?
	const {data: artistData = []} = useQuery(["playlist-artist-data", {ids: (artists?.map(({id}) => id) || [])}], {
		enabled: Boolean(artists?.length),
		queryFn: () => {
			if (!artists) return []
			return Promise.all(artists.map(({id}) => (
				trpcClient.artist.miniature.fetch({id})
			)))
		},
		select: (data) => data.filter(a => a) as Exclude<typeof data[number], null>[],
		keepPreviousData: true,
	})
	
	const queryClient = useQueryClient()
	const description = useMemo(() => {
		const string = descriptionFromPlaylistCredits(artistData, length, true)
		const parts = string.split("{{name}}")
		return parts.flatMap((part, i) => [
			<Fragment key={i}>{part}</Fragment>,
			i === parts.length - 1
				? null
				: (
					<button
						key={artistData[i]!.id}
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							artistView.setState({
								id: artistData[i]!.id,
								name: artistData[i]!.name,
								open: true,
							}, queryClient)
						}}
					>
						{artistData[i]!.name}
					</button>
				)
		])
	}, [artistData, length, queryClient])

	const [editing, setEditing] = useState(false)
	const onTitleEdit = useRef<(newName: string) => void>(() => {})
	const renamePlaylist = useRenamePlaylist()
	onTitleEdit.current = (newName) => {
		navigator.vibrate(1)
		setEditing(false)
		renamePlaylist(newName.trim())
	}
	const onTitleEditStart = useRef<() => void>(() => {})
	onTitleEditStart.current = () => {
		navigator.vibrate(1)
		setEditing(true)
	}

	return (
		<>
			<Images albums={albums} />
			<div className={classNames(styles.panel, {[styles.editing]: editing})}>
				<div className={styles.details}>
					{id && (
						<EditableTitle name={name} onEditEnd={onTitleEdit} onEditStart={onTitleEditStart} />
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