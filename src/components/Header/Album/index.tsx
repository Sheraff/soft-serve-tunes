import { type ForwardedRef, forwardRef, useDeferredValue, useMemo } from "react"
import pluralize from "utils/pluralize"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import TrackList from "components/TrackList"
import SectionTitle from "atoms/SectionTitle"
import { trpc } from "utils/trpc"
import { setPlaylist } from "client/db/useMakePlaylist"
import Panel from "../Panel"
import { autoplay } from "components/Player/Audio"

export default forwardRef(function AlbumView ({
	open,
	id,
	z,
	rect,
	name,
	isTop,
}: {
	open: boolean
	id: string
	z: number
	rect?: {
		top: number
		left?: number
		width?: number
		height?: number
		src?: string
	}
	name?: string
	isTop: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const enabled = Boolean(id && open)
	const { data } = trpc.album.get.useQuery({ id }, {
		enabled,
		keepPreviousData: true,
	})

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
					openPanel("artist", {
						id: data.artist.id,
						name: data.artist.name,
					})
				}
			}}>
				{`${data.artist?.name}`}
			</button>
		)
	}
	if (data?._count?.tracks) {
		infos.push(`${data?._count.tracks} track${pluralize(data?._count.tracks)}`)
	}

	const onClickPlay = () => {
		if (!data) return
		const playlistName = !data.artist
			? data.name
			: `${data.name} by ${data.artist.name}`
		const tracks = data.tracks.map(track => ({
			id: track.id,
			name: track.name,
			artist: track.artist,
			album: {
				id: data.id,
				name: data.name,
			},
		}))
		setPlaylist(playlistName, tracks)
		autoplay.setState(true)
	}

	const tracks = useDeferredValue(data?.tracks)
	const children = useMemo(() => tracks && Boolean(tracks.length) && (
		<>
			<SectionTitle className={styles.sectionTitle}>Tracks</SectionTitle>
			<TrackList tracks={tracks} />
		</>
	), [tracks])

	return (
		<Panel
			ref={ref}
			open={open}
			z={z}
			rect={rect}
			description={data?.audiodb?.strDescriptionEN}
			coverId={data?.cover?.id}
			coverPalette={data?.cover?.palette}
			infos={infos}
			title={data?.name ?? name}
			onClickPlay={onClickPlay}
			animationName={styles["bubble-open"]}
			isTop={isTop}
		>
			{children}
		</Panel>
	)
})