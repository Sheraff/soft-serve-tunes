import classNames from "classnames"
import { trpc, type inferQueryOutput } from "utils/trpc"
import { albumView, artistView, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import pluralize from "utils/pluralize"
import { useSetAtom } from "jotai"
import { startTransition } from "react"
import { useMakePlaylist } from "client/db/useMakePlaylist"

const OPTIONS = {
	track: {
		key: "track.miniature",
		Component: TrackInfo,
	},
	album: {
		key: "album.miniature",
		Component: AlbumInfo,
	},
	artist: {
		key: "artist.miniature",
		Component: ArtistInfo,
	},
	genre: {
		key: "genre.get",
		Component: GenreInfo,
	},
} as const

export default function PastSearch({
	id,
	type,
}: {
	id: string
	type: keyof typeof OPTIONS
}) {

	const setArtist = useSetAtom(artistView)
	const setAlbum = useSetAtom(albumView)
	const makePlaylist = useMakePlaylist()
	const showHome = useShowHome()

	const {key, Component} = OPTIONS[type]
	const {data: entity} = trpc.useQuery([key, {id}])

	const isEmpty = !entity || !('cover' in entity)
	const src = entity?.cover ? `/api/cover/${entity.cover.id}/${Math.round(56 * 2)}` : undefined

	return (
		<button
			type="button"
			className={classNames(styles.main, {[styles.empty as string]: isEmpty})}
			onClick={() => {
				startTransition(() => {
					if (type === 'track' || type === 'genre') {
						makePlaylist({type, id})
						showHome("home")
					} else if (type === "album") {
						setAlbum({id, open: true, name: entity?.name})
					} else if (type === "artist") {
						setArtist({id, open: true, name: entity?.name})
					}
				})
			}}
		>
			{!isEmpty && (
				<img
					className={styles.img}
					src={src}
					alt=""
				/>
			)}
			<div>
				{entity && (
					<>
						<p className={styles.name}>{entity.name}</p>
						<Component {...entity} />
					</>
				)}
			</div>
		</button>
	)
}

function ArtistInfo(entity: Exclude<inferQueryOutput<typeof OPTIONS['artist']['key']>, null>) {
	return (
		<p className={styles.info}>Artist{entity._count?.albums
			? ` · ${entity._count.albums} album${entity._count.albums > 1 ? 's': ''}`
			: entity._count?.tracks
				? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? 's': ''}`
				: ''
		}</p>
	)
}

function AlbumInfo(entity: Exclude<inferQueryOutput<typeof OPTIONS['album']['key']>, null>) {
	return (
		<p className={styles.info}>Album{entity._count?.tracks
			? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? 's': ''}`
			: ''
		}</p>
	)
}

function TrackInfo(entity: Exclude<inferQueryOutput<typeof OPTIONS['track']['key']>, null>) {
	return (
		<p className={styles.info}>Track{entity.artist
			? ` · by ${entity.artist.name}`
			: entity.album
				? ` · from ${entity.album.name}`
				: ''
		}</p>
	)
}

function GenreInfo(entity: Exclude<inferQueryOutput<typeof OPTIONS['genre']['key']>, null>) {
	return (
		<p className={styles.info}>Genre{entity._count?.tracks
			? ` · ${entity._count.tracks} track${pluralize(entity._count.tracks)}`
			: ''
		}</p>
	)
}