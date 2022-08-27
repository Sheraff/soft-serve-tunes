import { ForwardedRef, forwardRef, useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import pluralize from "utils/pluralize"
import { useAppState } from "components/AppContext"
import PlayIcon from "icons/play_arrow.svg"
import styles from "./index.module.css"
import classNames from "classnames"
import TrackList from "components/TrackList"
import { paletteToCSSProperties } from "components/Palette"
import SectionTitle from "atoms/SectionTitle"

export default forwardRef(function AlbumView({
	open,
	id,
}: {
	open: boolean;
	id: string;
}, ref: ForwardedRef<HTMLDivElement>) {
	const {view, setAppState, playlist} = useAppState()
	const active = view.type === "album"
	const enabled = Boolean(id && active)

	const {data: _data} = useIndexedTRcpQuery(["album.get", {id}], {
		enabled,
		keepPreviousData: true,
	})

	const stableData = useRef(_data)
	stableData.current = enabled ? _data : stableData.current
	const data = stableData.current

	const playlistSetter = playlist && playlist.type === "album" && playlist.id === id
		? undefined
		: {type: "album", id, index: 0} as const

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
			<button type="button" onClick={() => setAppState({view: {type: "artist", id: data.artist.id}})}>
				{`${data?.artist?.name}`}
			</button>
		)
	}
	if (data?._count?.tracks) {
		infos.push(`${data?._count.tracks} track${pluralize(data?._count.tracks)}`)
	}

	const palette = data?.cover ? paletteToCSSProperties(JSON.parse(data.cover.palette)) : undefined

	return (
		<div className={styles.main} data-open={open} ref={ref} style={palette}>
			<img
				className={styles.img}
				src={data?.cover ? `/api/cover/${data?.cover.id}` : ""}
				alt=""
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
					onClick={() => setAppState({
						view: {type: "home"},
						playlist: playlistSetter,
					})}
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