import { type ForwardedRef, forwardRef, useDeferredValue, useMemo } from "react"
import pluralize from "utils/pluralize"
import { albumView, artistView } from "components/AppContext"
import styles from "./index.module.css"
import TrackList from "components/TrackList"
import SectionTitle from "atoms/SectionTitle"
import { trpc } from "utils/trpc"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import { useQueryClient } from "@tanstack/react-query"
import Panel from "../Panel"

export default forwardRef(function AlbumView({
	open,
	id,
	z,
}: {
	open: boolean
	id: string
	z: number
}, ref: ForwardedRef<HTMLDivElement>) {
	const album = albumView.useValue()

	const enabled = Boolean(id && album.open)
	const {data} = trpc.album.get.useQuery({id}, {
		enabled,
		keepPreviousData: true,
	})

	const queryClient = useQueryClient()
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

	const makePlaylist = useMakePlaylist()
	const onClickPlay = () => {
		const playlistName = !data
			? "New Playlist"
			: !data.artist
			? data.name
			: `${data.name} by ${data.artist.name}`
		makePlaylist({type: "album", id}, playlistName)
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
			view={album}
			description={data?.audiodb?.strDescriptionEN}
			coverId={data?.cover?.id}
			coverPalette={data?.cover?.palette}
			infos={infos}
			title={data?.name}
			onClickPlay={onClickPlay}
			animationName={styles["bubble-open"]}
		>
			{children}
		</Panel>
	)
})