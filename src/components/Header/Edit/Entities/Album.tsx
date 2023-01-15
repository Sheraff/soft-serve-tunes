import { type TRPCClientError } from "@trpc/client"
import classNames from "classnames"
import ArtistList from "components/ArtistList"
import useAsyncInputStringDistance from "components/Header/Search/useAsyncInputFilter"
import { type FormEvent, useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react"
import SaveIcon from "icons/save.svg"
import ErrorIcon from "icons/emergency_home.svg"
import ModifIcon from "icons/edit_square.svg"
import AssignIcon from "icons/link.svg"
import CreateIcon from "icons/add_circle.svg"
import pluralize from "utils/pluralize"
import { simplifiedName } from "utils/sanitizeString"
import { type RouterOutputs, trpc, type AppRouter } from "utils/trpc"
import CoverList from "./CoverList"
import getIn, { type DeepExcludeNull, type DeepKeyof, type GetFieldType } from "./getIn"
import isLoaded from "./isLoaded"
import styles from "./index.module.css"

type AlbumMiniature = RouterOutputs["album"]["miniature"]

function aggregateTracks<K extends DeepKeyof<DeepExcludeNull<AlbumMiniature>>>(tracks: (AlbumMiniature | null | undefined)[], key: K): {readonly value: GetFieldType<DeepExcludeNull<AlbumMiniature>, K> | undefined, readonly unique: boolean} {
	const [first, ...rest] = (tracks.filter(Boolean) as Exclude<AlbumMiniature, null>[])
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

export default function EditAlbum({
	ids,
	onDone,
}: {
	ids: string[]
	onDone: () => void
}) {
	const {albums, isLoading} = trpc
		.useQueries((t) => ids.map((id) => t.album.miniature({id})))
		.reduce<{
			albums: (AlbumMiniature | undefined)[],
			isLoading: boolean
		}>((acc, {data, isLoading}) => {
			acc.albums.push(data)
			acc.isLoading = acc.isLoading || isLoading
			return acc
		}, {albums: [], isLoading: false})

	const htmlId = useId()

	const [nameState, setNameState] = useState<null | string>(albums[0]?.name ?? null)
	useEffect(() => {setNameState(albums[0]?.name ?? null)}, [albums[0]?.name])

	const artistAggregate = isLoading ? defaultAggregate : aggregateTracks(albums, ["artist", "name"])
	const [artistState, setArtistState] = useState(artistAggregate.value)
	const artistSimplified = artistState ? simplifiedName(artistState) : ""

	const coverAggregate = isLoading ? defaultAggregate : aggregateTracks(albums, ["cover", "id"])
	const [coverState, setCoverState] = useState(coverAggregate.value)

	const artistInput = useRef<HTMLInputElement>(null)
	const {data: artistsRaw} = trpc.artist.searchable.useQuery()
	const _artists = useAsyncInputStringDistance(artistInput, artistsRaw || defaultArray)
	const artists = _artists.length === 0 ? artistsRaw || defaultArray : _artists
	const setArtistInputName = useCallback((name: string | undefined) => {
		setArtistState(name)
		artistInput.current!.value = name ?? ""
		artistInput.current!.dispatchEvent(new Event("input"))
	}, [])
	useEffect(() => {setArtistInputName(artistAggregate.value)}, [setArtistInputName, artistAggregate.value])
	artists.sort((a, b) => {
		if (!artistSimplified) return 0
		const aName = simplifiedName(a.name) === artistSimplified
		const bName = simplifiedName(b.name) === artistSimplified
		if (aName !== bName) {
			if (aName) {
				return -1
			}
			return 1
		}
		const aIsInAlbums = albums.some(album => album?.artist?.id === a.id)
		const bIsInAlbums = albums.some(album => album?.artist?.id === b.id)
		if (aIsInAlbums && !bIsInAlbums) {
			return -1
		} else if (!aIsInAlbums && bIsInAlbums) {
			return 1
		}
		return 0
	})
	const exactArtist = Boolean(artistSimplified && artists[0] && artistSimplified === simplifiedName(artists[0].name))

	const coverInput = useRef<HTMLInputElement>(null)
	const setCoverInputId = useCallback((id: string | undefined) => {
		setCoverState(id)
		coverInput.current!.value = id ?? ""
		coverInput.current!.dispatchEvent(new Event("input"))
	}, [])
	useEffect(() => {setCoverInputId(coverAggregate.value)}, [setCoverInputId, coverAggregate.value])

	const isArtistModified = Boolean(artistSimplified && (!artistAggregate.value || artistSimplified !== simplifiedName(artistAggregate.value)))
	const isCoverModified = Boolean(coverState && coverState !== coverAggregate.value)
	const isSingleAlbum = albums.length === 1
	const isNameModified = isSingleAlbum && Boolean(nameState && (!albums[0]?.name || simplifiedName(nameState) !== simplifiedName(albums[0].name)))

	const {mutateAsync: updateAlbum} = trpc.edit.album.modify.useMutation()
	const {mutateAsync: validateAlbum} = trpc.edit.album.validate.useMutation({retry: 0})
	const [submitProgress, setSubmitProgress] = useState<number | null>(null)
	const [errors, setErrors] = useState<string[]>([])
	const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		navigator.vibrate(1)
		if (submitProgress !== null) return
		const editData: Omit<Parameters<typeof updateAlbum>[0], "id"> = {}
		let hasEdits = false
		if (isNameModified) {
			hasEdits = true
			editData.name = nameState!
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
		const allExist = albums.every(album => album)
		if (!allExist) {
			console.error("Some albums are missing at the time of editing. This should not happen.")
			return
		}
		const totalSteps = albums.length * 2 + 1
		const increment = () => {
			setSubmitProgress(prev => (prev ?? 0) + 1 / totalSteps)
		}
		increment()
		const allValidResponse = await Promise.allSettled(
			albums.map(album =>
				validateAlbum({
					id: album!.id,
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
			for (const album of albums) {
				await updateAlbum({
					id: album!.id,
					...editData
				})
				increment()
			}
		} catch {
			return
		}
		onDone()
	}

	return (
		<form onSubmit={onSubmit} className={styles.form}>
			{isLoaded(albums, isLoading) && (
				<>
					<h2 className={classNames(styles.full, styles.title)}>Edit album{pluralize(albums.length)}</h2>
					{isSingleAlbum && (
						<>
							<label htmlFor={`name${htmlId}`} className={styles.label}>Name</label>
							<input
								id={`name${htmlId}`}
								name="name"
								type="text"
								className={styles.input}
								value={nameState ?? ""}
								onChange={(e) => setNameState(e.target.value)}
								placeholder={albums[0]?.name}
							/>
						</>
					)}
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
							artists={artists.slice(0, 10)}
							selected={exactArtist ? artists[0]!.id : undefined}
							selectable={false}
							onClick={(artist) => {
								navigator.vibrate(1)
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
						type="hidden"
						className={styles.input}
						value={coverState ?? ""}
						placeholder={coverAggregate.unique ? undefined : "Multiple values"}
						disabled
					/>
					<div className={styles.full}>
						<CoverList
							albums={ids}
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
								<ModifIcon className={styles.icon}/>
								{`Rename album to "${nameState}"`}
							</p>
						)}
						{isArtistModified && (
							<p>
								{exactArtist && (
									<>
										<AssignIcon className={styles.icon}/>
										{`Assign artist "${artistState}" to ${albums.length} album${pluralize(albums.length)} (will not change tracks artist)`}
									</>
								)}
								{!exactArtist && (
									<>
										<CreateIcon className={styles.icon}/>
										{`Create new artist "${artistState}" with ${albums.length} album${pluralize(albums.length)} (will not change tracks artist)`}
									</>
								)}
							</p>
						)}
						{isCoverModified && (
							<p>
								<ModifIcon className={styles.icon}/>
								{`Force selected cover on ${albums.length} album${pluralize(albums.length)}`}
							</p>
						)}
						{errors.length > 0 && errors.map((error, index) => (
							<p key={index} className={styles.error}>
								<ErrorIcon className={styles.icon}/>
								{error}
							</p>
						))}
					</div>

					<button type="submit" className={styles.submit}>
						<SaveIcon className={styles.icon} />
						Save
						{submitProgress !== null && (
							<div className={styles.progress} style={{"--progress": submitProgress} as CSSProperties}>
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