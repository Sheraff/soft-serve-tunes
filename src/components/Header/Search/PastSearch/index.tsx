import classNames from "classnames"
import { type AllRoutes, trpc, type RouterOutputs } from "utils/trpc"
import { albumView, artistView, playlistView, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import pluralize from "utils/pluralize"
import { startTransition } from "react"
import { useAddNextToPlaylist, useMakePlaylist } from "client/db/useMakePlaylist"
import { useRemoveFromPastSearches } from "client/db/indexedPastSearches"
import { useQueryClient } from "@tanstack/react-query"

type Option<Key extends AllRoutes> = {
	key: Key
	Component: (entity: Exclude<RouterOutputs[Key[0]][Key[1]], null>) => JSX.Element
	cover: (e?: RouterOutputs[Key[0]][Key[1]]) => string | undefined
}

const track: Option<["track", "miniature"]> = {
	key: ["track", "miniature"],
	Component: TrackInfo,
	cover: (e) => e?.cover?.id,
}
const album: Option<["album", "miniature"]> = {
	key: ["album", "miniature"],
	Component: AlbumInfo,
	cover: (e) => e?.cover?.id,
}
const artist: Option<["artist", "miniature"]> = {
	key: ["artist", "miniature"],
	Component: ArtistInfo,
	cover: (e) => e?.cover?.id,
}
const genre: Option<["genre", "miniature"]> = {
	key: ["genre", "miniature"],
	Component: GenreInfo,
	cover: () => undefined
}
const playlist: Option<["playlist", "get"]> = {
	key: ["playlist", "get"],
	Component: PlaylistInfo,
	cover: (e) => e?.albums?.find(a => a.coverId)?.coverId
}

const OPTIONS = {
	track,
	album,
	artist,
	genre,
	playlist,
} as const

function trackNarrow(type: keyof typeof OPTIONS, entity: any): entity is RouterOutputs["track"]["miniature"] {
	return type === "track"
}
function albumNarrow(type: keyof typeof OPTIONS, entity: any): entity is RouterOutputs["album"]["miniature"] {
	return type === "album"
}
function artistNarrow(type: keyof typeof OPTIONS, entity: any): entity is RouterOutputs["artist"]["miniature"] {
	return type === "artist"
}
function genreNarrow(type: keyof typeof OPTIONS, entity: any): entity is RouterOutputs["genre"]["miniature"] {
	return type === "genre"
}
function playlistNarrow(type: keyof typeof OPTIONS, entity: any): entity is RouterOutputs["playlist"]["get"] {
	return type === "playlist"
}

function getTrpcProcedure(key: typeof OPTIONS[keyof typeof OPTIONS]["key"]) {
	if (key[0] === "playlist" && key[1] === "get")
		return trpc.playlist.get
	return trpc[key[0]][key[1]]
}


export default function PastSearch({
	id,
	type,
}: {
	id: string
	type: keyof typeof OPTIONS
}) {
	const queryClient = useQueryClient()

	const makePlaylist = useMakePlaylist()
	const addNextToPlaylist = useAddNextToPlaylist()
	const showHome = useShowHome()
	const {mutate: deletePastSearch} = useRemoveFromPastSearches()

	const {key, Component, cover} = OPTIONS[type]
	const {data: entity} = getTrpcProcedure(key).useQuery({id}, {
		onSettled(data) {
			if (data) return
			deletePastSearch({id})
		}
	})

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
				navigator.vibrate(1)
				startTransition(() => {
					if (trackNarrow(type, entity)) {
						if (!entity) return console.warn("PastSearch could not add track to playlist as it was not able to fetch associated data")
						addNextToPlaylist(entity, true)
						showHome("home")
					} else if (genreNarrow(type, entity)) {
						makePlaylist({type: "genre", id}, entity ? entity.name : "New Playlist")
						showHome("home")
					} else if (albumNarrow(type, entity)) {
						albumView.setState({id, open: true, name: entity?.name}, queryClient)
					} else if (artistNarrow(type, entity)) {
						artistView.setState({id, open: true, name: entity?.name}, queryClient)
					} else if (playlistNarrow(type, entity)) {
						playlistView.setState({id, open: true, name: entity?.name}, queryClient)
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
						<Component {...entity} />
					</>
				)}
			</div>
		</button>
	)
}

function ArtistInfo(entity: Exclude<RouterOutputs[typeof OPTIONS["artist"]["key"][0]][typeof OPTIONS["artist"]["key"][1]], null>) {
	return (
		<p className={styles.info}>Artist{entity._count?.albums
			? ` · ${entity._count.albums} album${entity._count.albums > 1 ? "s": ""}`
			: entity._count?.tracks
				? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? "s": ""}`
				: ""
		}</p>
	)
}

function AlbumInfo(entity: Exclude<RouterOutputs[typeof OPTIONS["album"]["key"][0]][typeof OPTIONS["album"]["key"][1]], null>) {
	return (
		<p className={styles.info}>Album{entity._count?.tracks
			? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? "s": ""}`
			: ""
		}</p>
	)
}

function TrackInfo(entity: Exclude<RouterOutputs[typeof OPTIONS["track"]["key"][0]][typeof OPTIONS["track"]["key"][1]], null>) {
	return (
		<p className={styles.info}>Track{entity.artist
			? ` · by ${entity.artist.name}`
			: entity.album
				? ` · from ${entity.album.name}`
				: ""
		}</p>
	)
}

function GenreInfo(entity: Exclude<RouterOutputs[typeof OPTIONS["genre"]["key"][0]][typeof OPTIONS["genre"]["key"][1]], null>) {
	return (
		<p className={styles.info}>Genre{entity._count?.tracks
			? ` · ${entity._count.tracks} track${pluralize(entity._count.tracks)}`
			: ""
		}</p>
	)
}

function PlaylistInfo(entity: Exclude<RouterOutputs[typeof OPTIONS["playlist"]["key"][0]][typeof OPTIONS["playlist"]["key"][1]], null>) {
	return (
		<p className={styles.info}>Playlist{entity._count.tracks
			? ` · ${entity._count.tracks} track${pluralize(entity._count.tracks)}`
			: ""
		}</p>
	)
}