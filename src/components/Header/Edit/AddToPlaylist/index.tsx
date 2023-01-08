import { useAddToPlaylist } from "client/db/useMakePlaylist"
import { startTransition } from "react"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"

export default function AddToPlaylist({
	items,
	onSelect,
}: {
	items: {id: string}[]
	onSelect: () => void
}) {
	const {data} = trpc.playlist.list.useQuery()
	const hasSomePlaylsts = Boolean(data?.length)
	const addToPlaylist = useAddToPlaylist()

	if (!hasSomePlaylsts) {
		return (
			<p>No playlists were created yet</p>
		)
	}
	return (
		<ul>
			{data!.map((playlist) => (
				<li key={playlist.id}>
					<button
						className={styles.button}
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							if (!items.length) return
							onSelect()
							startTransition(() => {
								addToPlaylist(playlist.id, items)
							})
						}}
					>
						{playlist.name}
					</button>
				</li>
			))}
		</ul>
	)
}