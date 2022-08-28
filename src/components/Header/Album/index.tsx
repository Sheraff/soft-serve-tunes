import { CSSProperties, ForwardedRef, forwardRef, startTransition, useEffect, useImperativeHandle, useRef, useState } from "react"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import pluralize from "utils/pluralize"
import { albumView, artistView, playlist, useShowHome } from "components/AppContext"
import PlayIcon from "icons/play_arrow.svg"
import styles from "./index.module.css"
import classNames from "classnames"
import TrackList from "components/TrackList"
import { paletteToCSSProperties } from "components/Palette"
import SectionTitle from "atoms/SectionTitle"
import { useAtom, useAtomValue, useSetAtom } from "jotai"

export default forwardRef(function AlbumView({
	open,
	id,
	z,
}: {
	open: boolean
	id: string
	z: number
}, ref: ForwardedRef<HTMLDivElement>) {
	const album = useAtomValue(albumView)
	const enabled = Boolean(id && album.open)

	const {data} = useIndexedTRcpQuery(["album.get", {id}], {
		enabled,
		keepPreviousData: true,
	})

	const [playlistData, setPlaylist] = useAtom(playlist)
	const playlistSetter = playlistData.type === "album" && playlistData.id === id
		? undefined
		: {type: "album", id, index: 0} as const

	const showHome = useShowHome()
	const setArtist = useSetAtom(artistView)

	const [seeBio, setSeeBio] = useState(false)
	const bio = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const element = bio.current
		if (!element) return
		setSeeBio(false)
		const observer = new ResizeObserver(([entry]) => {
			if(entry) {
				const child = entry.target.firstElementChild as HTMLDivElement
				if (child.offsetHeight <= entry.contentRect.height) {
					setSeeBio(true)
				}
			}
		})
		observer.observe(element)
		return () => observer.disconnect()
	}, [data?.audiodb?.strDescriptionEN])

	const infos = []
	const date = data?.spotify?.releaseDate || data?.audiodb?.intYearReleased || data?.lastfm?.releasedate
	if (date) {
		const string = typeof date === "number" ? date.toString() : date.getFullYear().toString()
		infos.push(string)
	}
	if (data?.artist) {
		infos.push(
			<button type="button" onClick={() => data.artist && setArtist({
				id: data.artist.id,
				name: data.artist.name,
				open: true,
			})}>
				{`${data.artist?.name}`}
			</button>
		)
	}
	if (data?._count?.tracks) {
		infos.push(`${data?._count.tracks} track${pluralize(data?._count.tracks)}`)
	}

	const palette = data?.cover ? paletteToCSSProperties(JSON.parse(data.cover.palette)) : undefined

	const main = useRef<HTMLDivElement>(null)
	useImperativeHandle(ref, () => main.current as HTMLDivElement)

	// synchronously compute initial position if an `artist.rect` emitter has been set
	const initialPositionRef = useRef<CSSProperties | null>(null)
	const initialImageSrc = useRef<string | null>(null)
	if (open && !initialPositionRef.current && album.rect) {
		initialPositionRef.current = {
			'--top': `${album.rect.top}px`,
			'--left': `${album.rect.left}px`,
			'--scale': `${album.rect.width / innerWidth}`,
		} as CSSProperties
		initialImageSrc.current = album.rect.src || null
	}

	return (
		<div
			className={styles.main}
			data-open={open}
			data-bubble={initialPositionRef.current !== null}
			ref={main}
			style={{
				"--z": z,
				...palette,
				...(initialPositionRef.current || {}),
			} as CSSProperties}
		>
			<img
				className={classNames(styles.img, styles.preview)}
				src={initialImageSrc.current || ""}
				alt=""
			/>
			<img
				className={styles.img}
				src={data?.cover ? `/api/cover/${data?.cover.id}` : ""}
				alt=""
				decoding="async"
			/>
			<div className={styles.head}>
				<SectionTitle>{data?.name}</SectionTitle>
				<p className={styles.info}>
					{infos.map((info, i) => (
						<>
							{i > 0 ? " · " : ""}
							{info}
						</>
					))}
				</p>
				{data?.audiodb?.strDescriptionEN && (
					<div
						className={classNames(styles.bio, {[styles.seeBio as string]: seeBio})}
						onClick={() => setSeeBio(!seeBio)}
					>
						<div ref={bio} className={styles.bioText}>
							<div>
								{data?.audiodb?.strDescriptionEN}
							</div>
						</div>
						<button
							className={styles.toggle}
							type="button"
						>
							{seeBio ? '...Less' : 'More...'}
						</button>
					</div>
				)}
				<button
					className={styles.play}
					type="button"
					onClick={() => {
						startTransition(() => {
							if (playlistSetter)
								setPlaylist(playlistSetter)
							showHome()
						})
					}}
				>
					<PlayIcon />
				</button>
			</div>
			{data?.tracks && Boolean(data.tracks.length) && (
				<div className={styles.section}>
					<SectionTitle>Tracks</SectionTitle>
					<TrackList tracks={data.tracks} />
				</div>
			)}
		</div>
	)
})