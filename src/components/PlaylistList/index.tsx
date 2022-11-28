import { useSetPlaylist } from 'client/db/useMakePlaylist'
import { useShowHome } from 'components/AppContext'
import { startTransition } from 'react'
import { type RouterOutputs, trpc } from 'utils/trpc'
import styles from './index.module.css'

function PlaylistItem({
	playlist,
	onSelect,
	index,
}: {
	playlist: {id: string, name: string}
	onSelect?: (playlist: Exclude<RouterOutputs["playlist"]["get"], null>) => void
	index: number
}) {
	const {data} = trpc.playlist.get.useQuery({id: playlist.id})

	const setPlaylist = useSetPlaylist()
	const showHome = useShowHome()

	const covers = data?.albums
		.filter(({coverId}) => coverId)
		|| []

	return (
		<button
			className={styles.item}
			type="button"
			onClick={() => {
				startTransition(() => {
					if (!data) return
					onSelect?.(data)
					setPlaylist(playlist.name, playlist.id, data.tracks)
					showHome("home")
				})
			}}
		>
			{covers[0] && (
				<img
					className={styles.img}
					src={`/api/cover/${covers[0].coverId}/${Math.round(174.5 * 2)}`}
					alt=""
					key={covers[0].coverId}
					loading={index > 2 ? "lazy" : undefined}
					decoding={index > 2 ? "async" : undefined}
				/>
			)}
			<p className={styles.text} key="text">
				<span className={styles.title}>{playlist.name}</span>
				<span className={styles.desc}>{data?.description}</span>
			</p>
		</button>
	)
}

export default function PlaylistList({
	playlists,
	onSelect,
}: {
	playlists: {id: string, name: string}[]
	onSelect?: Parameters<typeof PlaylistItem>[0]['onSelect']
}) {
	return (
		<ul className={styles.list}>
			{playlists.map((playlist, i) => (
				<li key={playlist.id}>
					<PlaylistItem
						playlist={playlist}
						onSelect={onSelect}
						index={i}
					/>
				</li>
			))}
		</ul>
	)
}