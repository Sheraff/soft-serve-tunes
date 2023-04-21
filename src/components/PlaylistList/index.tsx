import { openPanel } from "components/AppContext"
import CoverImages from "components/NowPlaying/Cover/Images"
import { startTransition } from "react"
import { type RouterOutputs, trpc } from "utils/trpc"
import styles from "./index.module.css"

function PlaylistItem ({
	playlist,
	onSelect,
}: {
	playlist: { id: string, name: string }
	onSelect?: (playlist: Exclude<RouterOutputs["playlist"]["get"], null>) => void
}) {
	const { data } = trpc.playlist.get.useQuery({ id: playlist.id })

	return (
		<button
			className={styles.item}
			type="button"
			onClick={(event) => {
				navigator.vibrate(1)
				startTransition(() => {
					if (!data) return
					onSelect?.(data)
					const element = event.currentTarget
					const { top, height } = element.getBoundingClientRect()
					startTransition(() => {
						openPanel("playlist", {
							id: playlist.id,
							name: data?.name || playlist.name,
							rect: { top, height }
						})
					})
				})
			}}
		>
			<CoverImages
				className={styles.img}
				albums={data ? data.albums.slice(0, 6) : []}
			/>
			<p className={styles.text} key="text">
				<span className={styles.title}>{playlist.name}</span>
				<span className={styles.desc}>{data?.description}</span>
			</p>
		</button>
	)
}

export default function PlaylistList ({
	playlists,
	onSelect,
}: {
	playlists: { id: string, name: string }[]
	onSelect?: Parameters<typeof PlaylistItem>[0]["onSelect"]
}) {
	return (
		<ul className={styles.list}>
			{playlists.map((playlist) => (
				<li key={playlist.id}>
					<PlaylistItem
						playlist={playlist}
						onSelect={onSelect}
					/>
				</li>
			))}
		</ul>
	)
}