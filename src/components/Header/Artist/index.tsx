import { type CSSProperties, type ForwardedRef, forwardRef, startTransition, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import pluralize from "utils/pluralize"
import AlbumList from "components/AlbumList"
import { artistView, useShowHome } from "components/AppContext"
import PlayIcon from "icons/play_arrow.svg"
import styles from "./index.module.css"
import classNames from "classnames"
import { paletteToCSSProperties } from "components/Palette"
import SectionTitle from "atoms/SectionTitle"
import { useAtomValue } from "jotai"
import TrackList from "components/TrackList"
import Head from "next/head"
import { trpc } from "utils/trpc"
import { useMakePlaylist } from "client/db/useMakePlaylist"

export default forwardRef(function ArtistView({
	open: _open,
	id,
	z,
}: {
	open: boolean
	id: string
	z: number
}, ref: ForwardedRef<HTMLDivElement>) {
	const open = useDeferredValue(_open)
	const artist = useAtomValue(artistView)
	const enabled = Boolean(id && artist.open)

	const {data, isLoading} = trpc.useQuery(["artist.get", {id}], {
		enabled,
		keepPreviousData: true,
	})

	const makePlaylist = useMakePlaylist()

	const showHome = useShowHome()

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
	}, [data?.audiodb?.strBiographyEN])

	const infos = []
	if (data?.audiodb?.intFormedYear || data?.audiodb?.intBornYear) {
		infos.push(`${data?.audiodb?.intFormedYear || data?.audiodb?.intBornYear}`)
	}
	if (data?._count?.albums) {
		infos.push(`${data._count.albums} album${pluralize(data._count.albums)}`)
	}
	if (data?._count?.tracks) {
		infos.push(`${data._count.tracks} track${pluralize(data._count.tracks)}`)
	}

	const palette = data?.cover ? paletteToCSSProperties(JSON.parse(data.cover.palette)) : undefined

	const main = useRef<HTMLDivElement>(null)
	useImperativeHandle(ref, () => main.current as HTMLDivElement)
	
	// synchronously compute initial position if an `artist.rect` emitter has been set
	const initialPositionRef = useRef<CSSProperties | null>(null)
	const initialImageSrc = useRef<string | null>(null)
	if (open && !initialPositionRef.current && artist.rect) {
		initialPositionRef.current = {
			'--top': `${artist.rect.top}px`,
			'--left': `${artist.rect.left}px`,
			'--scale': `${artist.rect.width / innerWidth}`,
			'--end': `${Math.hypot(innerWidth, innerHeight)}px`,
		} as CSSProperties
		initialImageSrc.current = artist.rect.src || null
	}

	const albums = useDeferredValue(data?.albums)
	const tracks = useDeferredValue(data?.tracks)

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
			{palette && (
				<Head>
					<meta name="theme-color" content={palette['--palette-bg-main']} />
				</Head>
			)}
			<img
				className={classNames(styles.img, styles.preview)}
				src={initialImageSrc.current || ""}
				alt=""
			/>
			<img
				className={styles.img}
				src={data?.cover ? `/api/cover/${data.cover.id}` : ""}
				alt=""
				decoding="async"
			/>
			<div className={styles.head}>
				<SectionTitle>{data?.name}</SectionTitle>
				<p className={styles.info}>
					{infos.join(" · ")}
				</p>
				{data?.audiodb?.strBiographyEN && (
					<div
						className={classNames(styles.bio, {[styles.seeBio as string]: seeBio})}
						onClick={() => setSeeBio(!seeBio)}
					>
						<div ref={bio} className={styles.bioText}>
							<div>
								{data?.audiodb?.strBiographyEN}
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
						const playlistName = !data
							? "New Playlist"
							: data.name
						startTransition(() => {
							makePlaylist({type: "artist", id}, playlistName)
							showHome("home")
						})
					}}
				>
					<PlayIcon />
				</button>
			</div>
			{useMemo(() => albums && Boolean(albums.length) && (
				<div className={styles.section}>
					<SectionTitle>Albums</SectionTitle>
					<AlbumList albums={albums} loading={isLoading} />
				</div>
			), [albums, isLoading])}
			{useMemo(() => tracks && Boolean(tracks.length) && (
				<div className={styles.section}>
					<SectionTitle>Tracks</SectionTitle>
					<TrackList tracks={tracks} />
				</div>
			), [tracks])}
		</div>
	)
})