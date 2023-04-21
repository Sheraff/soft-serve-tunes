import { type ForwardedRef, forwardRef, useDeferredValue, useMemo, Fragment } from "react"
import pluralize from "utils/pluralize"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import TrackList from "components/TrackList"
import SectionTitle from "atoms/SectionTitle"
import { trpc } from "utils/trpc"
import { getPlaylist, setPlaylist } from "client/db/useMakePlaylist"
import Panel from "../Panel"
import { autoplay, playAudio } from "components/Player/Audio"
import GenreList from "components/GenreList"

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
	const { data, isLoading } = trpc.album.get.useQuery({ id }, {
		enabled,
		keepPreviousData: true,
	})

	const infos = []
	const date = data?.spotify?.releaseDate || data?.audiodb?.intYearReleased || data?.lastfm?.releasedate
	if (date) {
		const string = typeof date === "number" ? date.toString() : date.getFullYear().toString()
		infos.push(string)
	}
	const artist = data?.artist
	if (artist) {
		infos.push(
			<button type="button" onClick={() => {
				navigator.vibrate(1)
				openPanel("artist", {
					id: artist.id,
					name: artist.name,
				})
			}}>
				{`${artist.name}`}
			</button>
		)
	}
	if (data?._count?.tracks) {
		infos.push(`${data?._count.tracks} track${pluralize(data?._count.tracks)}`)
	}
	if (data?.feats?.length) {
		infos.push(
			<>
				featuring
				{data.feats.slice(0, 3).map((artist, i) => (
					<Fragment key={artist.id}>
						{" "}
						<button key={artist.id} type="button" onClick={() => {
							navigator.vibrate(1)
							openPanel("artist", {
								id: artist.id,
								name: artist.name,
							})
						}}>
							{`${artist.name}`}
						</button>
						{i !== data.feats.length - 1 && ","}
					</Fragment>
				))}
				{data.feats.length > 3 && ` and ${data.feats.length - 3} more`}
			</>
		)
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
		const playlist = getPlaylist()
		setPlaylist(playlistName, tracks)
		if (playlist?.current && playlist.current === tracks[0]?.id) {
			playAudio()
		} else {
			autoplay.setState(true)
		}
	}

	const { tracks, genres } = useDeferredValue(data) || {}
	const loading = useDeferredValue(isLoading)
	const children = (
		<>
			{useMemo(() => genres && Boolean(genres.length) && (
				<GenreList genres={genres} loading={loading} scrollable />
			), [genres, loading])}
			{useMemo(() => tracks && Boolean(tracks.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Tracks</SectionTitle>
					<TrackList tracks={tracks} />
				</>
			), [tracks])}
		</>
	)

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