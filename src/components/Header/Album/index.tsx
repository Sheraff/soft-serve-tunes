import { type ForwardedRef, forwardRef, useDeferredValue, useMemo } from "react"
import pluralize from "utils/pluralize"
import { openPanel } from "components/AppContext"
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
	rect,
	name,
}: {
	open: boolean
	id: string
	z: number
	rect?: {
		top: number,
		left?: number,
		width?: number,
		height?: number,
		src?: string,
	}
	name?: string
}, ref: ForwardedRef<HTMLDivElement>) {
	const enabled = Boolean(id && open)
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
					openPanel("artist", {
						id: data.artist.id,
						name: data.artist.name,
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
			? (name ?? "New Playlist")
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
			rect={rect}
			description={data?.audiodb?.strDescriptionEN}
			coverId={data?.cover?.id}
			coverPalette={data?.cover?.palette}
			infos={infos}
			title={data?.name ?? name}
			onClickPlay={onClickPlay}
			animationName={styles["bubble-open"]}
		>
			{children}
		</Panel>
	)
})