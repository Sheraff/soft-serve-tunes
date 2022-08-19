import { ForwardedRef, forwardRef, useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "../../../client/db/useIndexedTRcpQuery"
import pluralize from "../../../utils/pluralize"
import AlbumList from "../../AlbumList"
import { useAppState } from "../../AppContext"
import PlayIcon from "../../../icons/play_arrow.svg"
import styles from "./index.module.css"
import classNames from "classnames"
import useImagePalette from "../../Palette/useImagePalette"

export default forwardRef(function ArtistView({
	open,
	id,
}: {
	open: boolean;
	id: string;
}, ref: ForwardedRef<HTMLDivElement>) {
	const {data: _data} = useIndexedTRcpQuery(["artist.get", {id}], {
		enabled: Boolean(id),
		keepPreviousData: true,
	})

	const stableData = useRef(_data)
	stableData.current = _data || stableData.current
	const data = stableData.current

	let imgSrc = ""
	if (data?.spotify?.imageId) {
		imgSrc = data.spotify.imageId
	} else if (data?.audiodb?.thumbId) {
		imgSrc = data.audiodb.thumbId
	} else if (data?.tracks?.[0]?.metaImageId) {
		imgSrc = data.tracks[0].metaImageId
	}

	const {setAppState, playlist} = useAppState()

	const playlistSetter = playlist && playlist.type === "artist" && playlist.id === id
		? undefined
		: {type: "artist", id, index: 0}

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

	const cover = useRef<HTMLImageElement>(null)
	const palette = useImagePalette({ref: cover})

	const infos = []
	if (data?.audiodb?.intFormedYear || data?.audiodb?.intBornYear) {
		infos.push(`${data?.audiodb?.intFormedYear || data?.audiodb?.intBornYear}`)
	}
	if (data?._count.albums) {
		infos.push(`${data._count.albums} album${pluralize(data._count.albums)}`)
	}
	if (data?._count.tracks) {
		infos.push(`${data._count.tracks} track${pluralize(data._count.tracks)}`)
	}

	return (
		<div className={styles.main} data-open={open} ref={ref} style={palette}>
			<img
				ref={cover}
				className={styles.img}
				src={imgSrc ? `/api/cover/${imgSrc}` : ""}
				alt=""
			/>
			<div className={styles.head}>
				<h2 className={styles.sectionTitle}>{data?.name}</h2>
				<p className={styles.info}>
					{infos.join(" · ")}
				</p>
				{data?.audiodb?.strBiographyEN && (
					<div
						className={classNames(styles.bio, {[styles.seeBio]: seeBio})}
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
				<div>
					<h2 className={styles.sectionTitle}>Albums</h2>
					<AlbumList albums={data.albums} />
				</div>
			)}
		</div>
	)
})