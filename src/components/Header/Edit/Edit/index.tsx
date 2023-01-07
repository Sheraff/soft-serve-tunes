import { useCallback, useDeferredValue, useEffect, useId, useRef, useState, type FormEvent } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import SaveIcon from "icons/save.svg"
import styles from "./index.module.css"
import { type Prisma } from "@prisma/client"
import useAsyncInputStringDistance from "components/Header/Search/useAsyncInputFilter"
import ArtistList from "components/ArtistList"
import { simplifiedName } from "utils/sanitizeString"
import AlbumList from "components/AlbumList"
import CoverList from "./CoverList"
import pluralize from "utils/pluralize"

/**
 * TODO: validation
 * 	- track name shouldn't already exist in album
 * TODO: fix sharp queue in api/cover because this component might request many big covers at once
 */

type TrackMiniature = RouterOutputs["track"]["miniature"]

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
	const {tracks, isLoading} = trpc
		.useQueries((t) => ids.map((id) => t.track.miniature({id})))
		.reduce<{
			tracks: (TrackMiniature | undefined)[],
			isLoading: boolean
		}>((acc, {data, isLoading}) => {
			acc.tracks.push(data)
			acc.isLoading = acc.isLoading || isLoading
			return acc
		}, {tracks: [], isLoading: false})

	const htmlId = useId()

	const [nameState, setNameState] = useState<null | string>(tracks[0]?.name ?? null)
	useEffect(() => {setNameState(tracks[0]?.name ?? null)}, [tracks[0]?.name])
	const [positionState, setPositionState] = useState<null | number>(tracks[0]?.position ?? null)
	useEffect(() => {setPositionState(tracks[0]?.position ?? null)}, [tracks[0]?.position])

	const albumAggregate = isLoading ? defaultAggregate : aggregateTracks(tracks, ["album", "name"])
	const [albumState, setAlbumState] = useState(albumAggregate.value)
	const albumSimplified = albumState ? simplifiedName(albumState) : ''

	const artistAggregate = isLoading ? defaultAggregate : aggregateTracks(tracks, ["artist", "name"])
	const [artistState, setArtistState] = useState(artistAggregate.value)
	const artistSimplified = artistState ? simplifiedName(artistState) : ''

	const coverAggregate = isLoading ? defaultAggregate : aggregateTracks(tracks, ["cover", "id"])
	const [coverState, setCoverState] = useState(coverAggregate.value)

	const artistInput = useRef<HTMLInputElement>(null)
	const {data: artistsRaw} = trpc.artist.searchable.useQuery()
	const _artists = useAsyncInputStringDistance(artistInput, artistsRaw || defaultArray)
	const artists = _artists.length === 0 ? artistsRaw || defaultArray : _artists
	const setArtistInputName = useCallback((name: string | undefined) => {
		setArtistState(name)
		artistInput.current!.value = name ?? ''
		artistInput.current!.dispatchEvent(new Event('input'))
		albumInput.current!.dispatchEvent(new Event('input'))
	}, [])
	useEffect(() => {setArtistInputName(artistAggregate.value)}, [setArtistInputName, artistAggregate.value])
	artists.sort((a, b) => {
		if (!albumSimplified && !artistSimplified) return 0
		const aName = simplifiedName(a.name) === artistSimplified
		const bName = simplifiedName(b.name) === artistSimplified
		if (aName === bName) {
			const aArtist = a.albums?.some(album => simplifiedName(album.name) === albumSimplified)
			const bArtist = b.albums?.some(album => simplifiedName(album.name) === albumSimplified)
			if (aArtist && bArtist) {
				return 0
			} else if (aArtist) {
				return -1
			} else if (bArtist) {
				return 1
			}
		} else if (aName) {
			return -1
		} else if (bName) {
			return 1
		}
		const aIsInTracks = tracks.some(track => track?.artist?.id === a.id)
		const bIsInTracks = tracks.some(track => track?.artist?.id === b.id)
		if (aIsInTracks && !bIsInTracks) {
			return -1
		} else if (!aIsInTracks && bIsInTracks) {
			return 1
		}
		return 0
	})
	const exactArtist = Boolean(artistSimplified && artists[0] && artistSimplified === simplifiedName(artists[0].name))

	const albumInput = useRef<HTMLInputElement>(null)
	const {data: albumsRaw} = trpc.album.searchable.useQuery()
	const fakeAlbumInput = useRef<HTMLInputElement>({} as HTMLInputElement)
	useEffect(() => {
		const input = albumInput.current!
		fakeAlbumInput.current = {
			get value() {
				return `${input.value} ${artistInput.current!.value}`
			},
			get addEventListener() {
				return input.addEventListener.bind(input)
			},
			get removeEventListener() {
				return input.removeEventListener.bind(input)
			},
		} as HTMLInputElement
	}, [])
	const __albums = useAsyncInputStringDistance(fakeAlbumInput, albumsRaw || defaultArray, ["name", "artists"])
	const _albums = __albums.length === 0 ? albumsRaw || defaultArray : __albums
	const albums = useDeferredValue(_albums)
	const setAlbumInputName = useCallback((name: string | undefined, artistName?: string) => {
		albumInput.current!.value = name ?? ''
		setAlbumState(name)
		if (typeof artistName === 'string') setArtistInputName(artistName)
		albumInput.current!.dispatchEvent(new Event('input'))
	}, [setArtistInputName])
	useEffect(() => {setAlbumInputName(albumAggregate.value)}, [setAlbumInputName, albumAggregate.value])
	albums.sort((a, b) => {
		// if an album has exact title and artist, put it first. If an album has exact title, put it second
		if (!albumSimplified && !artistSimplified) return 0
		const aName = simplifiedName(a.name) === albumSimplified
		const bName = simplifiedName(b.name) === albumSimplified
		if (aName === bName) {
			const aArtist = a.artists?.some(artist => simplifiedName(artist) === artistSimplified)
			const bArtist = b.artists?.some(artist => simplifiedName(artist) === artistSimplified)
			if (aArtist && bArtist) {
				return 0
			} else if (aArtist) {
				return -1
			} else if (bArtist) {
				return 1
			}
		} else if (aName) {
			return -1
		} else if (bName) {
			return 1
		}
		const aIsInTracks = tracks.some(track => track?.album?.id === a.id)
		const bIsInTracks = tracks.some(track => track?.album?.id === b.id)
		if (aIsInTracks && !bIsInTracks) {
			return -1
		} else if (!aIsInTracks && bIsInTracks) {
			return 1
		}
		return 0
	})
	const exactAlbum = Boolean(albumSimplified && albums[0] && albumSimplified === simplifiedName(albums[0].name))

	const coverInput = useRef<HTMLInputElement>(null)
	const setCoverInputId = useCallback((id: string | undefined) => {
		setCoverState(id)
		coverInput.current!.value = id ?? ''
		coverInput.current!.dispatchEvent(new Event('input'))
	}, [])
	useEffect(() => {setCoverInputId(coverAggregate.value)}, [setCoverInputId, coverAggregate.value])

	const isAlbumModified = Boolean(albumSimplified && (!albumAggregate.value || albumSimplified !== simplifiedName(albumAggregate.value)))
	const isArtistModified = Boolean(artistSimplified && (!artistAggregate.value || artistSimplified !== simplifiedName(artistAggregate.value)))
	const isCoverModified = Boolean(coverState && coverState !== coverAggregate.value)
	const isSingleTrack = tracks.length === 1
	const isNameModified = isSingleTrack && Boolean(nameState && (!tracks[0]?.name || simplifiedName(nameState) !== simplifiedName(tracks[0].name)))
	const isPositionModified = isSingleTrack && Boolean(positionState !== null && positionState !== tracks[0]?.position)

	const {mutateAsync: updateTrack} = trpc.edit.track.useMutation()
	const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		const editData: Omit<Parameters<typeof updateTrack>[0], 'id'> = {}
		let hasEdits = false
		if (isNameModified) {
			hasEdits = true
			editData.name = nameState!
		}
		if (isPositionModified) {
			hasEdits = true
			editData.position = positionState!
		}
		if (isAlbumModified) {
			hasEdits = true
			if (exactAlbum) {
				editData.album = {
					id: albums[0]!.id,
					name: albums[0]!.name,
				}
			} else {
				editData.album = {
					name: albumState!,
				}
			}
		}
		if (isArtistModified) {
			hasEdits = true
			if (exactArtist) {
				editData.artist = {
					id: artists[0]!.id,
					name: artists[0]!.name,
				}
			} else {
				editData.artist = {
					name: artistState!,
				}
			}
		}
		if (isCoverModified) {
			hasEdits = true
			editData.coverId = coverState!
		}
		if (hasEdits) {
			const allExist = tracks.every(track => track)
			if (!allExist) {
				console.error('Some tracks are missing at the time of editing. This should not happen.')
				return
			}
			try {
				for (const track of tracks) {
					await updateTrack({
						id: track!.id,
						...editData
					})
				}
			} catch {
				return
			}
		}
		// onDone()
	}

	return (
		<form onSubmit={onSubmit} className={styles.form}>
			{isLoaded(tracks, isLoading) && (
				<>
					{isSingleTrack && (
						<>
							<label htmlFor={`name${htmlId}`} className={styles.label}>Name</label>
							<input
								id={`name${htmlId}`}
								name="name"
								type="text"
								className={styles.input}
								value={nameState ?? ''}
								onChange={(e) => setNameState(e.target.value)}
								placeholder={tracks[0]?.name}
							/>
							<label htmlFor={`position${htmlId}`} className={styles.label}>#</label>
							<input
								id={`position${htmlId}`}
								name="position"
								type="number"
								className={styles.input}
								value={positionState ?? ''}
								onChange={(e) => setPositionState(e.target.value !== '' ? Number(e.target.value) : null)}
								placeholder={String(tracks[0]?.position ?? tracks[0]?.spotify?.trackNumber ?? tracks[0]?.audiodb?.intTrackNumber) || undefined}
							/>
						</>
					)}
					{/* Album */}
					<label htmlFor={`album${htmlId}`} className={styles.label}>Album</label>
					<input
						id={`album${htmlId}`}
						name="album"
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
							onClick={album => {
								if (album.name === albumState && album.artist?.name === artistState) {
									setAlbumInputName(albumAggregate.value, artistState)
								} else {
									setAlbumInputName(album.name, album.artist?.name)
								}
							}}
							loading
						/>
					</div>
					{/* Artist */}
					<label htmlFor={`artist${htmlId}`} className={styles.label}>Artist</label>
					<input
						id={`artist${htmlId}`}
						name="artist"
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
							onClick={(artist) => {
								if (artist.name === artistState) {
									setArtistInputName(artistAggregate.value)
								} else {
									setArtistInputName(artist.name)
								}
							}}
							loading
						/>
					</div>
					
					{/* Cover */}
					<label htmlFor={`cover${htmlId}`} className={styles.label}>Cover</label>
					<input
						id={`cover${htmlId}`}
						name="cover"
						ref={coverInput}
						type="text"
						className={styles.input}
						value={coverState}
						placeholder={coverAggregate.unique ? undefined : 'Multiple values'}
						disabled
					/>
					<div className={styles.full}>
						<CoverList
							tracks={ids}
							albums={exactAlbum ? [albums[0]!.id] : []}
							selected={coverState}
							onClick={(cover) => {
								if (cover.id === coverState) {
									setCoverInputId(coverAggregate.value)
								} else {
									setCoverInputId(cover.id)
								}
							}}
						/>
					</div>
					
					<div className={styles.summary}>
						{isNameModified && (
							<p>{
								`rename track to "${nameState}"`
							}</p>
						)}
						{isPositionModified && (
							<p>{
								`set track position to #${String(positionState).padStart(2, '0')}`
							}</p>
						)}
						{isAlbumModified && (
							<p>{
								exactAlbum
									? `assigning album "${albumState}" to ${tracks.length} track${pluralize(tracks.length)}`
									: `creating new album "${albumState}" for ${tracks.length} track${pluralize(tracks.length)}`
							}</p>
						)}
						{isArtistModified && (
							<p>{
								exactArtist
									? `assigning artist "${artistState}" to ${tracks.length} track${pluralize(tracks.length)}`
									: `creating new artist "${artistState}" for ${tracks.length} track${pluralize(tracks.length)}`
							}</p>
						)}
						{isCoverModified && (
							<p>{
								`forcing selected cover on ${tracks.length} track${pluralize(tracks.length)}`
							}</p>
						)}
					</div>

					<button type="submit" className={styles.submit}>
						<SaveIcon className={styles.icon} />
						Save
					</button>
				</>
			)}
		</form>
	)
}