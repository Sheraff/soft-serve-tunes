import classNames from "classnames"
import { PropsWithoutRef } from "react"
import { inferQueryOutput } from "../../../../utils/trpc"
import { useAppState } from "../../../AppContext"
import styles from "./index.module.css"

export type PastSearchItem = 
	{type: 'track', entity: Exclude<inferQueryOutput<"track.miniature">, null>}
	| {type: 'album', entity: Exclude<inferQueryOutput<"album.miniature">, null>}
	| {type: 'artist', entity: Exclude<inferQueryOutput<"artist.miniature">, null>}
	| {type: 'genre', entity: Exclude<inferQueryOutput<"genre.list">[number], null>}

export default function PastSearch({
	entity,
	type,
}: PropsWithoutRef<PastSearchItem>) {
	const isEmpty = !('cover' in entity)
	const {setAppState} = useAppState()
	return (
		<button
			type="button"
			className={classNames(styles.main, {[styles.empty]: isEmpty})}
			onClick={() => setAppState({playlist: {type, id: entity.id, index: 0}, view: {type: "home"}})}
		>
			{!isEmpty && (
				<img
					className={styles.img}
					src={`/api/cover/${entity.cover?.id}`}
					alt=""
				/>
			)}
			<div>
				<p className={styles.name}>{entity.name}</p>
				{type === 'artist' && (
					<p className={styles.info}>Artist{entity._count?.albums
						? ` · ${entity._count.albums} album${entity._count.albums > 1 ? 's': ''}`
						: entity._count?.tracks
							? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? 's': ''}`
							: ''
					}</p>
				)}
				{type === 'album' && (
					<p className={styles.info}>Album{entity._count?.tracks
						? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? 's': ''}`
						: ''
					}</p>
				)}
				{type === 'track' && (
					<p className={styles.info}>Track{entity.artist
						? ` · by ${entity.artist.name}`
						: entity.album
							? ` · from ${entity.album.name}`
							: ''
					}</p>
				)}
				{type === 'genre' && (
					<p className={styles.info}>Genre{entity._count?.tracks
						? ` · ${entity._count.tracks} track${entity._count.tracks > 1 ? 's': ''}`
						: ''
					}</p>
				)}
			</div>
		</button>
	)
}