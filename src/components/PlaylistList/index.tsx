import { useQueryClient } from "@tanstack/react-query"
import { useSetPlaylist } from "client/db/useMakePlaylist"
import { playlistView, useShowHome } from "components/AppContext"
import { startTransition } from "react"
import { type RouterOutputs, trpc } from "utils/trpc"
import styles from "./index.module.css"

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

	// const setPlaylist = useSetPlaylist()
	// const showHome = useShowHome()

	const covers = data?.albums
		.filter(({coverId}) => coverId)
		|| []

	const src = covers[0] ? `/api/cover/${covers[0].coverId}/${Math.round(174.5 * 2)}` : ""

	const queryClient = useQueryClient()

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
					const {top, height} = element.getBoundingClientRect()
					startTransition(() => {
						playlistView.setState({
							id: playlist.id,
							name: data?.name || playlist.name,
							open: true,
							rect: {top, height, src}
						}, queryClient)
					})
				})
			}}
		>
			{src && (
				<img
					className={styles.img}
					src={src}
					alt=""
					key={src}
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
	onSelect?: Parameters<typeof PlaylistItem>[0]["onSelect"]
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