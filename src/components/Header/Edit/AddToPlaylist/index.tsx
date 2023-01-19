import { useAddToPlaylist, useCreatePlaylist } from "client/db/useMakePlaylist"
import { startTransition } from "react"
import { trpc } from "utils/trpc"
import NewIcon from "icons/library_add.svg"
import SmartIcon from "icons/auto_mode.svg"
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
	const {mutateAsync: getMore} = trpc.playlist.more.useMutation()

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
			<li key="smart">
				<button
					className={styles.button}
					type="button"
					onClick={() => {
						navigator.vibrate(1)
						if (!items.length) return
						onSelect()
						const trackIds = items.map((item) => item.id)
						getMore({
							type: "by-similar-tracks",
							trackIds,
						}).then((data = []) => {
							startTransition(() => {
								createPlaylist([...trackIds, ...data.map((item) => item.id)])
							})
						})
					}}
				>
					<SmartIcon className={styles.icon}/>
					Create smart playlist
				</button>
			</li>
		</ul>
	)
}