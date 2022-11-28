import Dialog from "atoms/Dialog"
import { useAddToPlaylist } from "client/db/useMakePlaylist"
import { startTransition } from "react"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"

export default function AddToPlaylist({
	item,
	setItem,
}: {
	item: {id: string} | null
	setItem: (item: null) => void
}) {
	const {data} = trpc.playlist.list.useQuery()
	const hasSomePlaylsts = Boolean(data?.length)
	const addToPlaylist = useAddToPlaylist()
	return (
		<Dialog title="Add to playlist" open={Boolean(item)} onClose={() => setItem(null)}>
			{!hasSomePlaylsts && (
				<p>No playlists were created yet</p>
			)}
			{hasSomePlaylsts && (
				<ul>
					{data!.map((playlist) => (
						<li key={playlist.id}>
							<button
								className={styles.button}
								type="button"
								onClick={() => {
									if (!item) return
									setItem(null)
									startTransition(() => {
										addToPlaylist(playlist.id, item)
									})
								}}
							>
								{playlist.name}
							</button>
						</li>
					))}
				</ul>
			)}
		</Dialog>
	)
}