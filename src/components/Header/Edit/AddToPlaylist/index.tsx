import { useAddToPlaylist, useCreatePlaylist } from "client/db/useMakePlaylist"
import { startTransition } from "react"
import { trpc } from "utils/trpc"
import NewIcon from "icons/library_add.svg"
import styles from "./index.module.css"

export default function AddToPlaylist({
	items,
	onSelect,
}: {
	items: {id: string}[]
	onSelect: () => void
}) {
	const {data} = trpc.playlist.list.useQuery()
	const addToPlaylist = useAddToPlaylist()
	const createPlaylist = useCreatePlaylist()

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
			<li key="new">
				<button
					className={styles.button}
					type="button"
					onClick={() => {
						navigator.vibrate(1)
						if (!items.length) return
						onSelect()
						startTransition(() => {
							createPlaylist(items.map((item) => item.id))
						})
					}}
				>
					<NewIcon className={styles.icon}/>
					Create new playlist
				</button>
			</li>
		</ul>
	)
}