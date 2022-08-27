import { CSSProperties, ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import pluralize from "utils/pluralize"
import AlbumList from "components/AlbumList"
import { useAppState } from "components/AppContext"
import PlayIcon from "icons/play_arrow.svg"
import styles from "./index.module.css"
import classNames from "classnames"
import { paletteToCSSProperties } from "components/Palette"
import SectionTitle from "atoms/SectionTitle"

export default forwardRef(function ArtistView({
	open,
	id,
}: {
	open: boolean;
	id: string;
}, ref: ForwardedRef<HTMLDivElement>) {
	const {view, setAppState, playlist} = useAppState()
	const active = view.type === "artist"
	const enabled = Boolean(id && active)

	const {data: _data} = useIndexedTRcpQuery(["artist.get", {id}], {
		enabled,
		keepPreviousData: true,
	})

	const stableData = useRef(_data)
	stableData.current = enabled ? _data : stableData.current
	const data = stableData.current

	const playlistSetter = playlist && playlist.type === "artist" && playlist.id === id
		? undefined
		: {type: "artist", id, index: 0} as const

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
	
	// synchronously compute initial position if a `_artistViewInit` emitter has been set
	const initialPositionRef = useRef<CSSProperties | null>(null)
	const initialImageSrc = useRef<string | null>(null)
	if (open && !initialPositionRef.current && window._artistViewInit) {
		const toggle = window._artistViewInit
		const rect = toggle.getBoundingClientRect()
		initialPositionRef.current = {
			'--top': `${rect.top}px`,
			'--left': `${rect.left}px`,
			'--scale': `${rect.width / innerWidth}`,
			'--end': `${Math.hypot(innerWidth, innerHeight)}px`,
		} as CSSProperties
		const image = toggle.querySelector('img')
		initialImageSrc.current = image ? image.getAttribute("src") : null
		window._artistViewInit = undefined
	}

	return (
		<div
			className={styles.main}
			data-open={open}
			data-bubble={initialPositionRef.current !== null}
			ref={main}
			style={{
				...palette,
				...(initialPositionRef.current || {}),
			}}
		>
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
					onClick={() => setAppState({
						view: {type: "home"},
						playlist: playlistSetter,
					})}
				>
					<PlayIcon />
				</button>
			</div>
			{data?.albums && Boolean(data.albums.length) && (
				<div className={styles.section}>
					<SectionTitle>Albums</SectionTitle>
					<AlbumList albums={data.albums} />
				</div>
			)}
		</div>
	)
})