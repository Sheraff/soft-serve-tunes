import classNames from "classnames"
import { usePlaylistExtractedDetails, useRenamePlaylist } from "client/db/useMakePlaylist"
import { Fragment, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"
import SaveButton from "./SaveButton"
import descriptionFromPlaylistCredits from "client/db/utils/descriptionFromPlaylistCredits"
import EditableTitle from "atoms/SectionTitle/EditableTitle"
import SectionTitle from "atoms/SectionTitle"
import { artistView } from "components/AppContext"
import { useSetAtom } from "jotai"

export default function Cover() {
	const {albums, artists, name, length, id} = usePlaylistExtractedDetails()

	const trpcClient = trpc.useContext()
	const {data: albumData = []} = useQuery(["playlist-cover", {ids: (albums?.map(({id}) => id) || [])}], {
		enabled: Boolean(albums?.length),
		queryFn: () => {
			if (!albums) return []
			return Promise.all(albums.map(({id}) => (
				trpcClient.album.miniature.fetch({id})
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
				trpcClient.artist.miniature.fetch({id})
			)))
		},
		select: (data) => data.filter(a => a) as Exclude<typeof data[number], null>[],
		keepPreviousData: true,
	})
	
	const setArtist = useSetAtom(artistView)
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
						onClick={() => setArtist({
							id: artistData[i]!.id,
							name: artistData[i]!.name,
							open: true,
						})}
					>
						{artistData[i]!.name}
					</button>
				)
		])
	}, [artistData, length, setArtist])

	const [editing, setEditing] = useState(false)
	const onTitleEdit = useRef<(newName: string) => void>(() => {})
	const renamePlaylist = useRenamePlaylist()
	onTitleEdit.current = (newName) => {
		setEditing(false)
		renamePlaylist(id!, newName.trim())
	}
	const onTitleEditStart = useRef<() => void>(() => {})
	onTitleEditStart.current = () => {
		setEditing(true)
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