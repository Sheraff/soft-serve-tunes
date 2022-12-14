import { type CSSProperties, type ForwardedRef, forwardRef, Fragment, startTransition, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import pluralize from "utils/pluralize"
import { albumView, artistView, useShowHome } from "components/AppContext"
import PlayIcon from "icons/play_arrow.svg"
import styles from "./index.module.css"
import classNames from "classnames"
import TrackList from "components/TrackList"
import { paletteToCSSProperties } from "components/Palette"
import SectionTitle from "atoms/SectionTitle"
import Head from "next/head"
import { trpc } from "utils/trpc"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import { useQueryClient } from "@tanstack/react-query"

export default forwardRef(function AlbumView({
	open: _open,
	id,
	z,
}: {
	open: boolean
	id: string
	z: number
}, ref: ForwardedRef<HTMLDivElement>) {
	const open = useDeferredValue(_open)
	const album = albumView.useValue()
	const enabled = Boolean(id && album.open)

	const {data} = trpc.album.get.useQuery({id}, {
		enabled,
		keepPreviousData: true,
	})

	const makePlaylist = useMakePlaylist()

	const showHome = useShowHome()
	const queryClient = useQueryClient()

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
			<button type="button" onClick={() => {
				if (data.artist) {
					navigator.vibrate(1)
					artistView.setState({
						id: data.artist.id,
						name: data.artist.name,
						open: true,
					}, queryClient)
				}
			}}>
				{`${data.artist?.name}`}
			</button>
		)
	}
	if (data?._count?.tracks) {
		infos.push(`${data?._count.tracks} track${pluralize(data?._count.tracks)}`)
	}

	const palette = paletteToCSSProperties(data?.cover?.palette)

	const main = useRef<HTMLDivElement>(null)
	useImperativeHandle(ref, () => main.current as HTMLDivElement)

	// synchronously compute initial position if an `artist.rect` emitter has been set
	const initialPositionRef = useRef<CSSProperties | null>(null)
	const initialImageSrc = useRef<string | null>(null)
	if (open && !initialPositionRef.current && album.rect) {
		initialPositionRef.current = {
			"--top": `${album.rect.top}px`,
			"--left": `${album.rect.left}px`,
			"--scale": `${album.rect.width / innerWidth}`,
		} as CSSProperties
		initialImageSrc.current = album.rect.src || null
	}

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
			{palette && album.open && (
				<Head>
					<meta name="theme-color" content={palette["--palette-bg-main"]} />
				</Head>
			)}
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
						<Fragment key={i}>
							{i > 0 ? " ?? " : ""}
							{info}
						</Fragment>
					))}
				</p>
				{data?.audiodb?.strDescriptionEN && (
					<div
						className={classNames(styles.bio, {[styles.seeBio as string]: seeBio})}
						onClick={() => {
							navigator.vibrate(1)
							setSeeBio(!seeBio)
						}}
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
							{seeBio ? "...Less" : "More..."}
						</button>
					</div>
				)}
				<button
					className={styles.play}
					type="button"
					onClick={() => {
						const playlistName = !data
							? "New Playlist"
							: !data.artist
							? data.name
							: `${data.name} by ${data.artist.name}`
						navigator.vibrate(1)
						startTransition(() => {
							makePlaylist({type: "album", id}, playlistName)
							showHome("home")
						})
					}}
				>
					<PlayIcon />
				</button>
			</div>
			{useMemo(() => tracks && Boolean(tracks.length) && (
				<div className={styles.section}>
					<SectionTitle>Tracks</SectionTitle>
					<TrackList tracks={tracks} />
				</div>
			), [tracks])}
		</div>
	)
})