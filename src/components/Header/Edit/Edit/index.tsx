import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import SaveIcon from "icons/save.svg"
import styles from "./index.module.css"
import { type Prisma } from "@prisma/client"
import useAsyncInputStringDistance from "components/Header/Search/useAsyncInputFilter"
import ArtistList from "components/ArtistList"
import { simplifiedName } from "utils/sanitizeString"

type TrackMiniature = RouterOutputs["track"]["miniature"]

function useTracks(ids: string[]) {
	return ids.reduce<{
		tracks: (TrackMiniature | undefined)[],
		isLoading: boolean
	}>((acc, id) => {
		const {data, isLoading} = trpc.track.miniature.useQuery({id})
		acc.tracks.push(data)
		acc.isLoading = acc.isLoading || isLoading
		return acc
	}, {tracks: [], isLoading: false})
}

function isLoaded(tracks: (TrackMiniature | undefined)[], isLoading: boolean): tracks is TrackMiniature[] {
	return !isLoading
}

type Value = number | string | boolean | null | undefined | ValueObject | Prisma.JsonValue | Date

type ValueObject = {
	[key: string]: Value
}

type DeepKeyof<T extends Record<string, Value> | null> = {
	[K in keyof T]: K extends string ? T[K] extends Record<string, Value> ? [K, ...DeepKeyof<T[K]>] : [K] : never
}[keyof T]

type DeepExcludeNull<T extends Record<string, Value> | null> = T extends null ? never : {
	[K in keyof T]: Exclude<T[K], null> extends Record<string, Value> ? DeepExcludeNull<Exclude<T[K], null>> : Exclude<T[K], null>
}

type GetFieldType<T extends Record<string, Value> | null, P extends DeepKeyof<T>> = P extends [keyof T]
	? T[P[0]]
	: P extends [infer Left, ...infer Right]
		? Left extends keyof T
			? T[Left] extends Record<string, Value>
				? Right extends DeepKeyof<T[Left]>
					? GetFieldType<T[Left], Right>
					: never
				: never
			: undefined
		: undefined

function getIn<T extends Record<string, Value>, K extends DeepKeyof<DeepExcludeNull<T>>>(obj: T, key: K): GetFieldType<DeepExcludeNull<T>, K> | undefined {
	const [first, ...rest] = key as [keyof T, ...string[]]
	const next = obj[first]
	if (rest.length === 0) return next as GetFieldType<DeepExcludeNull<T>, K>
	return getIn(next as any, rest as any) as any
}

function aggregateTracks<K extends DeepKeyof<DeepExcludeNull<TrackMiniature>>>(tracks: (TrackMiniature | null | undefined)[], key: K): {value: GetFieldType<DeepExcludeNull<TrackMiniature>, K> | undefined, unique: boolean} {
	const [first, ...rest] = (tracks.filter(Boolean) as Exclude<TrackMiniature, null>[])
	if (!first) return {value: undefined, unique: true}
	const value = getIn(first, key)
	for (const track of rest) {
		const trackValue = getIn(track, key)
		if (trackValue !== value) return {value: undefined, unique: false}
	}
	return {value, unique: true}
}

const defaultArray = [] as never[]

export default function Edit({
	ids,
	onDone,
}: {
	ids: string[]
	onDone: () => void
}) {
	const onSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		onDone()
	}
	const {tracks, isLoading} = useTracks(ids)
	const htmlId = useId()

	const artistInput = useRef<HTMLInputElement>(null)
	const {data: artistsRaw} = trpc.artist.searchable.useQuery(undefined)
	const artists = useAsyncInputStringDistance(artistInput, artistsRaw || defaultArray)
	const artistAggregate = isLoading ? {value: undefined, unique: undefined} : aggregateTracks(tracks, ["artist", "name"])
	const [artistState, setArtistState] = useState(artistAggregate.value)
	useEffect(() => {
		setArtistState(artistAggregate.value)
		artistInput.current!.value = artistAggregate.value ?? ''
		artistInput.current!.dispatchEvent(new Event('input'))
	}, [artistAggregate.value])
	return (
		<form onSubmit={onSubmit} className={styles.form}>
			{isLoaded(tracks, isLoading) && (
				<>
					{tracks.length === 1 && (
						<>
							<label htmlFor={`name${htmlId}`} className={styles.label}>Name</label>
							<input id={`name${htmlId}`} type="text" className={styles.input} defaultValue={tracks[0]?.name}/>
							<label htmlFor={`position${htmlId}`} className={styles.label}>#</label>
							<input id={`position${htmlId}`} type="number" className={styles.input} defaultValue={tracks[0]?.position ?? tracks[0]?.spotify?.trackNumber ?? tracks[0]?.audiodb?.intTrackNumber ?? undefined}/>
						</>
					)}
					{(() => {
						const {value, unique} = aggregateTracks(tracks, ["album", "name"])
						return <>
							<label htmlFor={`album${htmlId}`} className={styles.label}>Album</label>
							<input id={`album${htmlId}`} type="text" className={styles.input} defaultValue={value} placeholder={unique ? undefined : 'Multiple values'}/>
						</>
					})()}
					{(() => {
						const exact = Boolean(artistState && artists[0] && simplifiedName(artistState) === simplifiedName(artists[0].name))
						return <>
							<label htmlFor={`artist${htmlId}`} className={styles.label}>Artist</label>
							<input id={`artist${htmlId}`} ref={artistInput} type="text" className={styles.input} value={artistState} onChange={() => setArtistState(artistInput.current!.value)} placeholder={artistAggregate.unique ? undefined : 'Multiple values'}/>
							{artists.length > 0 && (
								<div className={styles.full}>
									<ArtistList
										lines={1}
										artists={artists.slice(0, 21)}
										selected={exact ? artists[0]!.id : undefined}
										onClick={(artist) => {
											setArtistState(artist.name)
											artistInput.current!.value = artist.name
											artistInput.current!.dispatchEvent(new Event('input'))
										}}
									/>
								</div>
							)}
						</>
					})()}
					{(() => {
						const {value, unique} = aggregateTracks(tracks, ["cover", "id"])
						return <>
							<label htmlFor={`cover${htmlId}`} className={styles.label}>Cover</label>
							<input id={`cover${htmlId}`} type="text" className={styles.input} defaultValue={value} placeholder={unique ? undefined : 'Multiple values'}/>
						</>
					})()}
					<button type="submit" className={styles.submit}>
						<SaveIcon className={styles.icon} />
						Save
					</button>
				</>
			)}
		</form>
	)
}