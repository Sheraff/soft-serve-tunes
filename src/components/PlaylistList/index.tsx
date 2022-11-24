import { useSetPlaylist } from 'client/db/useMakePlaylist'
import { useShowHome } from 'components/AppContext'
import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type inferQueryOutput, trpc } from 'utils/trpc'
import styles from './index.module.css'

function PlaylistItem({
	playlist,
	onSelect,
	controller,
}: {
	playlist: {id: string, name: string}
	onSelect?: (playlist: inferQueryOutput<"playlist.get">) => void
	controller: {switch?: () => void}
}) {
	const {data} = trpc.useQuery(["playlist.get", {id: playlist.id}])

	const setPlaylist = useSetPlaylist()
	const showHome = useShowHome()

	const covers = data?.albums
		.filter(({coverId}) => coverId)
		|| []

	const [coverIndex, setCoverIndex] = useState(0)
	const [prevIndex, setPrevIndex] = useState(0)
	controller.switch = () => {
		setPrevIndex(coverIndex)
		setCoverIndex(Math.floor(Math.random() * covers.length))
	}

	const mainImg = useRef<HTMLImageElement>(null)
	useLayoutEffect(() => {
		if(!mainImg.current) return
		mainImg.current.getAnimations().forEach(a => a.cancel())
		mainImg.current.animate([
			{opacity: 1},
			{opacity: 0},
		], {
			duration: 2_500,
			fill: 'forwards'
		})
	}, [prevIndex])

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
			{covers.length > 0 && (
				<img
					className={styles.img}
					src={`/api/cover/${covers[coverIndex]!.coverId}/${Math.round(174.5 * 2)}`}
					alt=""
					key="base"
				/>
			)}
			{covers.length > 0 && (
				<img
					ref={mainImg}
					className={styles.img}
					src={`/api/cover/${covers[prevIndex]!.coverId}/${Math.round(174.5 * 2)}`}
					alt=""
					key="overlay"
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
	const controllers = useRef<{switch?: () => void}[]>()
	if (!controllers.current) {
		controllers.current = playlists.map(() => ({}))
	}

	useEffect(() => {
		const intervalId = setInterval(() => {
			const rand = Math.floor(Math.random() * playlists.length)
			controllers.current![rand]?.switch?.()
		}, 3_000)
		return () => {
			clearInterval(intervalId)
		}
	}, [playlists.length])

	return (
		<ul className={styles.list}>
			{playlists.map((playlist, i) => (
				<li key={playlist.id}>
					<PlaylistItem
						playlist={playlist}
						onSelect={onSelect}
						controller={controllers.current![i]!}
					/>
				</li>
			))}
		</ul>
	)
}