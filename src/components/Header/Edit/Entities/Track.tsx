import { type CSSProperties, useCallback, useDeferredValue, useEffect, useId, useRef, useState, type FormEvent } from "react"
import { type AppRouter, trpc, type RouterOutputs } from "utils/trpc"
import SaveIcon from "icons/save.svg"
import ErrorIcon from "icons/emergency_home.svg"
import ModifIcon from "icons/edit_square.svg"
import AssignIcon from "icons/link.svg"
import CreateIcon from "icons/add_circle.svg"
import styles from "../Entities/index.module.css"
import useAsyncInputStringDistance from "components/Header/Search/useAsyncInputFilter"
import ArtistList from "components/ArtistList"
import { simplifiedName } from "utils/sanitizeString"
import AlbumList from "components/AlbumList"
import CoverList from "./CoverList"
import pluralize from "utils/pluralize"
import { type TRPCClientError } from "@trpc/client"
import classNames from "classnames"
import isLoaded from "./isLoaded"
import getIn, { type DeepExcludeNull, type DeepKeyof, type GetFieldType } from "./getIn"

/**
 * TODO: since selecting a cover will lock the cover to the track, add way to unlock it
 * 
 * TODO: ability to edit feats. by adding/removing arbitrary amount of artists
 *   => this is also important to be able to handle multi-artist albums (and avoid creating duplicate albums)
 */

type TrackMiniature = RouterOutputs["track"]["miniature"]

function aggregateTracks<K extends DeepKeyof<DeepExcludeNull<TrackMiniature>>> (tracks: (TrackMiniature | null | undefined)[], key: K): { readonly value: GetFieldType<DeepExcludeNull<TrackMiniature>, K> | undefined, readonly unique: boolean } {
	const [first, ...rest] = (tracks.filter(Boolean) as Exclude<TrackMiniature, null>[])
	if (!first) return { value: undefined, unique: true }
	const value = getIn(first, key)
	for (const track of rest) {
		const trackValue = getIn(track, key)
		if (trackValue !== value) return { value: undefined, unique: false }
	}
	return { value, unique: true }
}

const defaultArray = [] as never[]
const defaultAggregate = { value: undefined, unique: undefined } as const

async function awaitButNotTooLong (p: Promise<any>, timeout: number) {
	await Promise.race([
		p,
		new Promise(resolve => setTimeout(resolve, timeout)),
	])
	return
}

export default function EditTrack ({
	ids,
	onDone,
}: {
	ids: string[]
	onDone: () => void
}) {
	const { tracks, isLoading } = trpc
		.useQueries((t) => ids.map((id) => t.track.miniature({ id })))
		.reduce<{
			tracks: (TrackMiniature | undefined)[],
			isLoading: boolean
		}>((acc, { data, isLoading }) => {
			acc.tracks.push(data)
			acc.isLoading = acc.isLoading || isLoading
			return acc
		}, { tracks: [], isLoading: false })

	const htmlId = useId()

	const [nameState, setNameState] = useState<null | string>(tracks[0]?.name ?? null)
	useEffect(() => { setNameState(tracks[0]?.name ?? null) }, [tracks[0]?.name])
	const [positionState, setPositionState] = useState<null | number>(tracks[0]?.position ?? null)
	useEffect(() => { setPositionState(tracks[0]?.position ?? null) }, [tracks[0]?.position])

	const albumAggregate = isLoading ? defaultAggregate : aggregateTracks(tracks, ["album", "name"])
	const [albumState, setAlbumState] = useState(albumAggregate.value)
	const albumSimplified = albumState ? simplifiedName(albumState) : ""

	const artistAggregate = isLoading ? defaultAggregate : aggregateTracks(tracks, ["artist", "name"])
	const [artistState, setArtistState] = useState(artistAggregate.value)
	const artistSimplified = artistState ? simplifiedName(artistState) : ""

	const coverAggregate = isLoading ? defaultAggregate : aggregateTracks(tracks, ["cover", "id"])
	const [coverState, setCoverState] = useState(coverAggregate.value)

	const artistInput = useRef<HTMLInputElement>(null)
	const { data: artistsRaw } = trpc.artist.searchable.useQuery()
	const artists = useAsyncInputStringDistance({
		inputRef: artistInput,
		dataList: artistsRaw || defaultArray,
		select (list) {
			const base = list.length === 0 ? artistsRaw || defaultArray : list
			if (!albumSimplified && !artistSimplified) return base.slice(0, 10)
			return list
				.sort((a, b) => {
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
				.slice(0, 10)
		}
	})
	const setArtistInputName = useCallback((name: string | undefined) => {
		setArtistState(name)
		artistInput.current!.value = name ?? ""
		artistInput.current!.dispatchEvent(new Event("input"))
		albumInput.current!.dispatchEvent(new Event("input"))
	}, [])
	useEffect(() => { setArtistInputName(artistAggregate.value) }, [setArtistInputName, artistAggregate.value])
	const exactArtist = Boolean(artistSimplified && artists[0] && artistSimplified === simplifiedName(artists[0].name))

	const albumInput = useRef<HTMLInputElement>(null)
	const { data: albumsRaw } = trpc.album.searchable.useQuery()
	const fakeAlbumInput = useRef<HTMLInputElement>({} as HTMLInputElement)
	useEffect(() => {
		const input = albumInput.current!
		fakeAlbumInput.current = {
			get value () {
				return `${input.value} ${artistInput.current!.value}`
			},
			get addEventListener () {
				return input.addEventListener.bind(input)
			},
			get removeEventListener () {
				return input.removeEventListener.bind(input)
			},
		} as HTMLInputElement
	}, [])
	const _albums = useAsyncInputStringDistance({
		inputRef: fakeAlbumInput,
		dataList: albumsRaw || defaultArray,
		keys: ["name", "artists"],
		select (list) {
			const base = list.length === 0 ? albumsRaw || defaultArray : list
			if (!albumSimplified && !artistSimplified) return base.slice(0, 10)
			return base
				.sort((a, b) => {
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
				.slice(0, 10)
		}
	})
	const albums = useDeferredValue(_albums)
	const setAlbumInputName = useCallback((name: string | undefined, artistName?: string) => {
		albumInput.current!.value = name ?? ""
		setAlbumState(name)
		if (typeof artistName === "string") setArtistInputName(artistName)
		albumInput.current!.dispatchEvent(new Event("input"))
	}, [setArtistInputName])
	useEffect(() => { setAlbumInputName(albumAggregate.value) }, [setAlbumInputName, albumAggregate.value])
	const exactAlbum = Boolean(albumSimplified && albums[0] && albumSimplified === simplifiedName(albums[0].name))

	const coverInput = useRef<HTMLInputElement>(null)
	const setCoverInputId = useCallback((id: string | undefined) => {
		setCoverState(id)
		coverInput.current!.value = id ?? ""
		coverInput.current!.dispatchEvent(new Event("input"))
	}, [])
	useEffect(() => { setCoverInputId(coverAggregate.value) }, [setCoverInputId, coverAggregate.value])

	const isAlbumModified = Boolean(albumSimplified && (!albumAggregate.value || albumSimplified !== simplifiedName(albumAggregate.value)))
	const isArtistModified = Boolean(artistSimplified && (!artistAggregate.value || artistSimplified !== simplifiedName(artistAggregate.value)))
	const isCoverModified = Boolean(coverState && coverState !== coverAggregate.value)
	const isSingleTrack = tracks.length === 1
	const isNameModified = isSingleTrack && Boolean(nameState && (!tracks[0]?.name || nameState !== tracks[0].name))
	const isPositionModified = isSingleTrack && Boolean(positionState !== null && positionState !== tracks[0]?.position)

	const { mutateAsync: updateTrack } = trpc.edit.track.modify.useMutation()
	const { mutateAsync: validateTrack } = trpc.edit.track.validate.useMutation({ retry: 0 })
	const [submitProgress, setSubmitProgress] = useState<number | null>(null)
	const [errors, setErrors] = useState<string[]>([])
	const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		navigator.vibrate(1)
		if (submitProgress !== null) return
		const editData: Omit<Parameters<typeof updateTrack>[0], "id"> = {}
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
		if (!hasEdits) {
			onDone()
			return
		}
		const allExist = tracks.every(track => track)
		if (!allExist) {
			console.error("Some tracks are missing at the time of editing. This should not happen.")
			return
		}
		const totalSteps = tracks.length * 2 + 1
		const increment = () => {
			setSubmitProgress(prev => (prev ?? 0) + 1 / totalSteps)
		}
		increment()
		const allValidResponse = await Promise.allSettled(
			tracks.map(track =>
				validateTrack({
					id: track!.id,
					...editData
				})
					// @ts-expect-error -- this is fine
					.finally((any) => {
						increment()
						return any
					})
			)
		)
		const rejections = allValidResponse.reduce<TRPCClientError<AppRouter["edit"]["track"]["validate"]>[]>((acc, res) => {
			if (res.status === "rejected") {
				acc.push(res.reason)
			}
			return acc
		}, [])
		if (rejections.length > 0) {
			console.log(rejections)
			setSubmitProgress(null)
			setErrors(rejections.map(err => err.message))
			return
		}
		try {
			for (const track of tracks) {
				await awaitButNotTooLong(updateTrack({
					id: track!.id,
					...editData
				}), 3_000)
				increment()
			}
		} catch {
			return
		}
		onDone()
	}

	const placeholderPosition = tracks[0]?.position ?? null

	return (
		<form onSubmit={onSubmit} className={styles.form}>
			{isLoaded(tracks, isLoading) && (
				<>
					<h2 className={classNames(styles.full, styles.title)}>Edit track{pluralize(tracks.length)}</h2>
					{isSingleTrack && (
						<>
							<label htmlFor={`name${htmlId}`} className={styles.label}>Name</label>
							<input
								id={`name${htmlId}`}
								name="name"
								type="text"
								className={styles.input}
								value={nameState ?? ""}
								onChange={(e) => setNameState(e.target.value)}
								placeholder={tracks[0]?.name}
							/>
							<label htmlFor={`position${htmlId}`} className={styles.label}>#</label>
							<input
								id={`position${htmlId}`}
								name="position"
								type="number"
								className={styles.input}
								value={positionState ?? ""}
								onChange={(e) => setPositionState(e.target.value !== "" ? Number(e.target.value) : null)}
								placeholder={placeholderPosition !== null ? String(placeholderPosition) : undefined}
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
						value={albumState ?? ""}
						onChange={() => setAlbumState(albumInput.current!.value)}
						placeholder={albumAggregate.unique ? undefined : "Multiple values"}
					/>
					<div className={styles.full}>
						<AlbumList
							lines={1}
							scrollable
							albums={albums}
							selected={exactAlbum ? albums[0]!.id : undefined}
							onClick={album => {
								navigator.vibrate(1)
								if (album.name === albumState && (!album.artist || album.artist?.name === artistState)) {
									setAlbumInputName(albumAggregate.value, artistState)
								} else {
									setAlbumInputName(album.name, album.artist?.name)
								}
							}}
							loading
							selectable={false}
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
						value={artistState ?? ""}
						onChange={() => setArtistState(artistInput.current!.value)}
						placeholder={artistAggregate.unique ? undefined : "Multiple values"}
					/>
					<div className={styles.full}>
						<ArtistList
							lines={1}
							artists={artists}
							selected={exactArtist ? artists[0]!.id : undefined}
							onClick={(artist) => {
								navigator.vibrate(1)
								if (artist.name === artistState) {
									setArtistInputName(artistAggregate.value)
								} else {
									setArtistInputName(artist.name)
								}
							}}
							loading
							selectable={false}
						/>
					</div>

					{/* Cover */}
					<label htmlFor={`cover${htmlId}`} className={styles.label}>Cover</label>
					<input
						id={`cover${htmlId}`}
						name="cover"
						ref={coverInput}
						type="hidden"
						className={styles.input}
						value={coverState ?? ""}
						placeholder={coverAggregate.unique ? undefined : "Multiple values"}
						disabled
					/>
					<div className={styles.full}>
						<CoverList
							tracks={ids}
							albums={exactAlbum ? [albums[0]!.id] : []}
							selected={coverState}
							onClick={(cover) => {
								navigator.vibrate(1)
								if (cover.id === coverState) {
									setCoverInputId(coverAggregate.value)
								} else {
									setCoverInputId(cover.id)
								}
							}}
						/>
					</div>

					<div className={classNames(styles.full, styles.summary)}>
						{isNameModified && (
							<p>
								<ModifIcon className={styles.icon} />
								{`Rename track to "${nameState}"`}
							</p>
						)}
						{isPositionModified && (
							<p>
								<ModifIcon className={styles.icon} />
								{`Set track position to #${String(positionState).padStart(2, "0")}`}
							</p>
						)}
						{isAlbumModified && (
							<p>
								{exactAlbum && (
									<>
										<AssignIcon className={styles.icon} />
										{`Add ${tracks.length} track${pluralize(tracks.length)} to "${albumState}" album`}
									</>
								)}
								{!exactAlbum && (
									<>
										<CreateIcon className={styles.icon} />
										{`Create new album "${albumState}" with ${tracks.length} track${pluralize(tracks.length)}`}
									</>
								)}
							</p>
						)}
						{isArtistModified && (
							<p>
								{exactArtist && (
									<>
										<AssignIcon className={styles.icon} />
										{`Assign artist "${artistState}" to ${tracks.length} track${pluralize(tracks.length)}`}
									</>
								)}
								{!exactArtist && (
									<>
										<CreateIcon className={styles.icon} />
										{`Create new artist "${artistState}" with ${tracks.length} track${pluralize(tracks.length)}`}
									</>
								)}
							</p>
						)}
						{isCoverModified && (
							<p>
								<ModifIcon className={styles.icon} />
								{`Force selected cover on ${tracks.length} track${pluralize(tracks.length)}`}
							</p>
						)}
						{errors.length > 0 && errors.map((error, index) => (
							<p key={index} className={styles.error}>
								<ErrorIcon className={styles.icon} />
								{error}
							</p>
						))}
					</div>

					<button type="submit" className={styles.submit}>
						<SaveIcon className={styles.icon} />
						Save
						{submitProgress !== null && (
							<div className={styles.progress} style={{ "--progress": submitProgress } as CSSProperties}>
								<SaveIcon className={styles.icon} />
								Save
							</div>
						)}
					</button>
				</>
			)}
		</form>
	)
}