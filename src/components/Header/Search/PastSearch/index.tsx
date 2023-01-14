import classNames from "classnames"
import { trpc } from "utils/trpc"
import { openPanel, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import pluralize from "utils/pluralize"
import { ReactNode, startTransition } from "react"
import { useAddNextToPlaylist, useMakePlaylist } from "client/db/useMakePlaylist"
import { usePastSearchesMutation, useRemoveFromPastSearches } from "client/db/indexedPastSearches"
import { useQueryClient } from "@tanstack/react-query"

function BasePastSearch({
	className,
	coverId,
	onClick,
	children,
	name,
	id,
	type,
}: {
	className?: string
	coverId?: string | null
	onClick: () => void
	children: ReactNode
	name?: string
	id: string
	type: keyof typeof PAST_SEARCH_COMPONENTS
}) {
	const src = coverId ? `/api/cover/${coverId}/${Math.round(56 * 2)}` : undefined
	const {mutate: onSelect} = usePastSearchesMutation()
	return (
		<button
			type="button"
			className={classNames(
				styles.main,
				className,
				{ [styles.empty]: !src }
			)}
			onClick={() => {
				navigator.vibrate(1)
				startTransition(() => {
					onClick()
					onSelect({id, type})
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
				{name && (
					<>
						<p className={styles.name}>{name}</p>
						{children}
					</>
				)}
			</div>
		</button>
	)
}

type PastSearchProps = {
	id: string
	onSettled: (data: boolean) => void
}

function PastSearchArtist({
	id,
	onSettled,
}: PastSearchProps) {
	const {data: entity} = trpc.artist.miniature.useQuery({id}, {onSettled: (data) => onSettled(!!data)})
	const queryClient = useQueryClient()
	const onClick = () => openPanel("artist", {id, name: entity?.name}, queryClient)
	return (
		<BasePastSearch
			className={styles.artist}
			coverId={entity?.cover?.id}
			onClick={onClick}
			name={entity?.name}
			type="artist"
			id={id}
		>
			<p className={styles.info}>
				Artist
				{entity?._count?.albums
					? ` · ${entity._count.albums} album${entity._count.albums > 1 ? "s": ""}`
					: entity?._count?.tracks
					? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? "s": ""}`
					: ""
				}
			</p>
		</BasePastSearch>
	)
}

function PastSearchAlbum({
	id,
	onSettled,
}: PastSearchProps) {
	const {data: entity} = trpc.album.miniature.useQuery({id}, {onSettled: (data) => onSettled(!!data)})
	const queryClient = useQueryClient()
	const onClick = () => openPanel("album", {id, name: entity?.name}, queryClient)
	return (
		<BasePastSearch
			coverId={entity?.cover?.id}
			onClick={onClick}
			name={entity?.name}
			type="album"
			id={id}
		>
			<p className={styles.info}>
				Album
				{entity?._count?.tracks
					? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? "s": ""}`
					: ""
				}
			</p>
		</BasePastSearch>
	)
}

function PastSearchGenre({
	id,
	onSettled,
}: PastSearchProps) {
	const {data: entity} = trpc.genre.miniature.useQuery({id}, {onSettled: (data) => onSettled(!!data)})
	const makePlaylist = useMakePlaylist()
	const showHome = useShowHome()
	const onClick = () => {
		makePlaylist({type: "genre", id}, entity ? entity.name : "New Playlist")
		showHome("home")
	}
	return (
		<BasePastSearch
			className={styles.list}
			onClick={onClick}
			name={entity?.name}
			type="genre"
			id={id}
		>
			<p className={styles.info}>
				Genre
				{entity?._count?.tracks
					? ` · ${entity._count.tracks} track${pluralize(entity._count.tracks)}`
					: ""
				}
			</p>
		</BasePastSearch>
	)
}

function PastSearchPlaylist({
	id,
	onSettled,
}: PastSearchProps) {
	const {data: entity} = trpc.playlist.get.useQuery({id}, {onSettled: (data) => onSettled(!!data)})
	const queryClient = useQueryClient()
	const onClick = () => openPanel("playlist", {id, name: entity?.name}, queryClient)
	return (
		<BasePastSearch
			className={styles.list}
			coverId={entity?.albums?.find(a => a.coverId)?.coverId}
			onClick={onClick}
			name={entity?.name}
			type="playlist"
			id={id}
		>
			<p className={styles.info}>
				Playlist
				{entity?._count.tracks
					? ` · ${entity._count.tracks} track${pluralize(entity._count.tracks)}`
					: ""
				}
			</p>
		</BasePastSearch>
	)
}

function PastSearchTrack({
	id,
	onSettled,
}: PastSearchProps) {
	const {data: entity} = trpc.track.miniature.useQuery({id}, {onSettled: (data) => onSettled(!!data)})
	const addNextToPlaylist = useAddNextToPlaylist()
	const showHome = useShowHome()
	const onClick = () => {
		if (!entity) return console.warn("PastSearch could not add track to playlist as it was not able to fetch associated data")
		addNextToPlaylist(entity, true)
		showHome("home")
	}
	return (
		<BasePastSearch
			coverId={entity?.cover?.id}
			onClick={onClick}
			name={entity?.name}
			type="track"
			id={id}
		>
			<p className={styles.info}>
				Track
				{entity?.artist
					? ` · by ${entity.artist.name}`
					: entity?.album
					? ` · from ${entity.album.name}`
					: ""
				}
			</p>
		</BasePastSearch>
	)
}

const PAST_SEARCH_COMPONENTS = {
	artist: PastSearchArtist,
	album: PastSearchAlbum,
	genre: PastSearchGenre,
	playlist: PastSearchPlaylist,
	track: PastSearchTrack,
}


export default function PastSearch({
	id,
	type,
}: {
	id: string
	type: keyof typeof PAST_SEARCH_COMPONENTS
}) {
	const {mutate: deletePastSearch} = useRemoveFromPastSearches()
	const onSettled = (data: boolean) => {
		if (data) return
		deletePastSearch({id})
	}
	const Component = PAST_SEARCH_COMPONENTS[type]
	return <Component id={id} onSettled={onSettled} />
}
