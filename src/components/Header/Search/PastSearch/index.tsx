import classNames from "classnames"
import { trpc, type inferQueryOutput } from "utils/trpc"
import { albumView, artistView, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import pluralize from "utils/pluralize"
import { useSetAtom } from "jotai"
import { startTransition } from "react"
import { useAddNextToPlaylist, useMakePlaylist, useSetPlaylist } from "client/db/useMakePlaylist"
import { useRemoveFromPastSearches } from "client/db/indexedPastSearches"

const OPTIONS = {
	track: {
		key: "track.miniature",
		Component: TrackInfo,
		cover: (e?: inferQueryOutput<"track.miniature">) => e?.cover?.id,
	},
	album: {
		key: "album.miniature",
		Component: AlbumInfo,
		cover: (e?: inferQueryOutput<"album.miniature">) => e?.cover?.id,
	},
	artist: {
		key: "artist.miniature",
		Component: ArtistInfo,
		cover: (e?: inferQueryOutput<"artist.miniature">) => e?.cover?.id,
	},
	genre: {
		key: "genre.miniature",
		Component: GenreInfo,
		cover: () => undefined
	},
	playlist: {
		key: "playlist.get",
		Component: PlaylistInfo,
		cover: (e?: inferQueryOutput<"playlist.get">) => e?.albums.find(a => a.coverId)?.coverId
	}
} as const

function trackNarrow(type: keyof typeof OPTIONS, entity: any): entity is inferQueryOutput<"track.miniature"> {
	return type === "track"
}
function albumNarrow(type: keyof typeof OPTIONS, entity: any): entity is inferQueryOutput<"album.miniature"> {
	return type === "album"
}
function artistNarrow(type: keyof typeof OPTIONS, entity: any): entity is inferQueryOutput<"artist.miniature"> {
	return type === "artist"
}
function genreNarrow(type: keyof typeof OPTIONS, entity: any): entity is inferQueryOutput<"genre.miniature"> {
	return type === "genre"
}
function playlistNarrow(type: keyof typeof OPTIONS, entity: any): entity is inferQueryOutput<"playlist.get"> {
	return type === "playlist"
}


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
	const setPlaylist = useSetPlaylist()
	const addNextToPlaylist = useAddNextToPlaylist()
	const showHome = useShowHome()
	const {mutate: deletePastSearch} = useRemoveFromPastSearches()

	const {key, Component, cover} = OPTIONS[type]
	const {data: entity} = trpc.useQuery([key, {id}], {
		onSettled(data) {
			if (data) return
			deletePastSearch({id})
		}
	})

	// @ts-expect-error -- I'm too lazy to type this... it's only fine as long as this component remains very simple
	const coverId = cover(entity)
	const src = coverId ? `/api/cover/${coverId}/${Math.round(56 * 2)}` : undefined

	return (
		<button
			type="button"
			className={classNames(
				styles.main,
				{
					[styles.empty]: !src,
					[styles.list]: type === "playlist" || type === "genre",
					[styles.artist]: type === "artist",
				}
			)}
			onClick={() => {
				startTransition(() => {
					if (trackNarrow(type, entity)) {
						if (!entity) return console.warn('PastSearch could not add track to playlist as it was not able to fetch associated data')
						addNextToPlaylist(entity, true)
						showHome("home")
					} else if (genreNarrow(type, entity)) {
						makePlaylist({type: "genre", id}, entity ? entity.name : "New Playlist")
						showHome("home")
					} else if (albumNarrow(type, entity)) {
						setAlbum({id, open: true, name: entity?.name})
					} else if (artistNarrow(type, entity)) {
						setArtist({id, open: true, name: entity?.name})
					} else if (playlistNarrow(type, entity)) {
						if (!entity) return console.warn('PastSearch could not start playlist as it was not able to fetch associated data')
						setPlaylist(entity.name, entity.id, entity.tracks)
						showHome("home")
					}
				})
			}}
		>
			{src && (
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
						{/* @ts-expect-error -- I'm too lazy to type this... it's only fine as long as this component remains very simple */}
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

function PlaylistInfo(entity: Exclude<inferQueryOutput<typeof OPTIONS['playlist']['key']>, null>) {
	return (
		<p className={styles.info}>Playlist{entity._count.tracks
			? ` · ${entity._count.tracks} track${pluralize(entity._count.tracks)}`
			: ''
		}</p>
	)
}