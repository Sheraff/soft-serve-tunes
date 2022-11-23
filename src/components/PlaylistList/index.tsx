import { useSetPlaylist } from 'client/db/useMakePlaylist'
import { useShowHome } from 'components/AppContext'
import { type CSSProperties, startTransition } from 'react'
import { type inferQueryOutput, trpc } from 'utils/trpc'
import styles from './index.module.css'

function PlaylistItem({
	playlist,
	onSelect,
}: {
	playlist: {id: string, name: string}
	onSelect?: (playlist: inferQueryOutput<"playlist.get">) => void
}) {
	const {data} = trpc.useQuery(["playlist.get", {id: playlist.id}])

	const setPlaylist = useSetPlaylist()
	const showHome = useShowHome()

	console.log(data)

	const covers = data?.albums
		.filter(({coverId}) => coverId)
		.slice(0, 6)
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
			{covers.map(({coverId}, i) => (
				<img
					className={styles.img}
					src={`/api/cover/${coverId}/${Math.round(174.5 * 2)}`}
					alt=""
					key={coverId}
					style={{
						'--i': i,
						'--l': covers.length,
					} as CSSProperties}
				/>
			))}
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
			{playlists.map(playlist => (
				<li key={playlist.id}>
					<PlaylistItem playlist={playlist} onSelect={onSelect} />
				</li>
			))}
		</ul>
	)
}