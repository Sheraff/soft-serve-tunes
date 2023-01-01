import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import SaveIcon from "icons/save.svg"
import styles from "./index.module.css"
import { type Prisma } from "@prisma/client"
import useAsyncInputStringDistance from "components/Header/Search/useAsyncInputFilter"
import ArtistList from "components/ArtistList"
import { simplifiedName } from "utils/sanitizeString"
import AlbumList from "components/AlbumList"

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

function aggregateTracks<K extends DeepKeyof<DeepExcludeNull<TrackMiniature>>>(tracks: (TrackMiniature | null | undefined)[], key: K): {readonly value: GetFieldType<DeepExcludeNull<TrackMiniature>, K> | undefined, readonly unique: boolean} {
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
const defaultAggregate = {value: undefined, unique: undefined} as const

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
	const {data: artistsRaw} = trpc.artist.searchable.useQuery()
	const artists = useAsyncInputStringDistance(artistInput, artistsRaw || defaultArray)
	const artistAggregate = isLoading ? defaultAggregate : aggregateTracks(tracks, ["artist", "name"])
	const [artistState, setArtistState] = useState(artistAggregate.value)
	const setArtistInputName = useCallback((name: string | undefined) => {
		setArtistState(name)
		artistInput.current!.value = name ?? ''
		artistInput.current!.dispatchEvent(new Event('input'))
	}, [])
	useEffect(() => {setArtistInputName(artistAggregate.value)}, [setArtistInputName, artistAggregate.value])
	const exactArtist = Boolean(artistState && artists[0] && simplifiedName(artistState) === simplifiedName(artists[0].name))

	const albumInput = useRef<HTMLInputElement>(null)
	const albumAggregate = isLoading ? defaultAggregate : aggregateTracks(tracks, ["album", "name"])
	const [albumState, setAlbumState] = useState(albumAggregate.value)
	const {data: albumsRaw} = trpc.album.searchable.useQuery()
	const rawFromArtist = useMemo(
		() => (artists[0]?.albums?.length && albumsRaw)
			? albumsRaw.filter(({id}) => artists[0]!.albums.some((a) => a.id === id))
			: undefined,
		[artists[0]?.albums, albumsRaw]
	)
	const albumsUnfiltered = useAsyncInputStringDistance(albumInput, rawFromArtist || albumsRaw || defaultArray)
	const _albums = useMemo(
		() => exactArtist && artistState
			? (Boolean(albumState) ? albumsUnfiltered : (rawFromArtist || defaultArray)).filter(album =>
				(album.artist?.name && simplifiedName(album.artist.name) === simplifiedName(artistState))
				|| (artists[0]!.albums.some(a => a.id === album.id))
			)
			: albumsUnfiltered,
		[exactArtist, albumsUnfiltered, artistState, artists[0], Boolean(albumState), rawFromArtist]
	)
	console.log(albumInput.current?.value, _albums[0], albumsUnfiltered[0], rawFromArtist?.[0])
	const albums = useDeferredValue(_albums)
	const setAlbumInputName = useCallback((name: string | undefined, artistName?: string) => {
		if (typeof artistName === 'string') setArtistInputName(artistName)
		setAlbumState(name)
		albumInput.current!.value = name ?? ''
		albumInput.current!.dispatchEvent(new Event('input'))
	}, [setArtistInputName])
	useEffect(() => {setAlbumInputName(albumAggregate.value)}, [setAlbumInputName, albumAggregate.value])
	const exactAlbum = Boolean(
		albumState && albums[0] && simplifiedName(albumState) === simplifiedName(albums[0].name)
		&& (!albums[0].artist?.name || (exactArtist && artistState && simplifiedName(albums[0].artist.name) === simplifiedName(artistState)))
	)

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
					{/* Album */}
					<label htmlFor={`album${htmlId}`} className={styles.label}>Album</label>
					<input
						id={`album${htmlId}`}
						ref={albumInput}
						type="text"
						className={styles.input}
						value={albumState}
						onChange={() => setAlbumState(albumInput.current!.value)}
						placeholder={albumAggregate.unique ? undefined : 'Multiple values'}
					/>
					<div className={styles.full}>
						<AlbumList
							lines={1}
							scrollable
							albums={albums.slice(0, 10)}
							selected={exactAlbum ? albums[0]!.id : undefined}
							onClick={album => setAlbumInputName(album.name, album.artist?.name)}
							loading
						/>
					</div>
					{/* Artist */}
					<label htmlFor={`artist${htmlId}`} className={styles.label}>Artist</label>
					<input
						id={`artist${htmlId}`}
						ref={artistInput}
						type="text"
						className={styles.input}
						value={artistState}
						onChange={() => setArtistState(artistInput.current!.value)}
						placeholder={artistAggregate.unique ? undefined : 'Multiple values'}
					/>
					<div className={styles.full}>
						<ArtistList
							lines={1}
							artists={artists.slice(0, 10)}
							selected={exactArtist ? artists[0]!.id : undefined}
							onClick={(artist) => {setArtistInputName(artist.name)}}
							loading
						/>
					</div>
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