import SectionTitle from "atoms/SectionTitle"
import classNames from "classnames"
import { type Playlist, usePlaylistExtractedDetails, onPlaylistSaved } from "client/db/useMakePlaylist"
import { memo, startTransition, useMemo, useState } from "react"
import { useQuery } from "react-query"
import { type inferQueryOutput, trpc } from "utils/trpc"
import styles from "./index.module.css"
import SaveIcon from 'icons/library_add.svg'
import EditIcon from 'icons/edit.svg'
import SavedIcon from 'icons/library_add_check.svg'

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
	const {albums, artists, name, length, id} = usePlaylistExtractedDetails()

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
			<div className={styles.panel}>
				<div className={styles.details}>
					<button className={styles.titleButton} type="button">
						<SectionTitle>{name}</SectionTitle>
						<EditIcon />
					</button>
					<p>{`${length ?? 0} track${length > 1 ? 's' : ''}${credits}`}</p>
				</div>
				<SaveButton id={id ?? null} />
			</div>
		</>
	)
}

const SaveButton = memo(function PureSaveButton({id}: {id: string | null}) {
	const trpcClient = trpc.useContext()
	const {mutate: savePlaylistMutation} = trpc.useMutation(["playlist.save"])
	const {mutate: deletePlaylistMutation} = trpc.useMutation(["playlist.delete"])
	const [saving, setSaving] = useState(false)

	const savePlaylist = () => {
		const cache = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
		if (!cache) {
			throw new Error('Trying to save a playlist, but none found in trpc cache')
		}
		savePlaylistMutation({
			name: cache.name,
			tracks: cache.tracks.map(({id}, index) => ({id, index}))
		}, {
			onSuccess(playlist) {
				trpcClient.setQueryData(["playlist.get", {id: playlist.id}], playlist)
				console.log('saved')
				onPlaylistSaved(trpcClient, playlist.id)
			},
			onSettled() {
				setSaving(false)
				console.log('after save')
			}
		})
	}

	const deletePlaylist = () => {
		if (!id) {
			throw new Error('Trying to delete a playlist, but no ID provided')
		}
		deletePlaylistMutation({ id }, {
			onSuccess() {
				trpcClient.setQueryData(["playlist.get", {id}], null)
				console.log('deleted')
				onPlaylistSaved(trpcClient, null)
			},
			onSettled() {
				setSaving(false)
				console.log('after delete')
			}
		})
	}

	console.log('is saving/deleting?', saving)
	return (
		<button
			type="button"
			onClick={() => {
				console.log('saving/deleting')
				setSaving(true)
				startTransition(id ? deletePlaylist : savePlaylist)
			}}
			className={styles.action}
		>
			{id ? (
				<>
					<SavedIcon className={styles.actionIcon}/>
					Delete Playlist
				</>
			) : (
				<>
					<SaveIcon className={styles.actionIcon}/>
					Save Playlist
				</>
			)}
		</button>
	)
})