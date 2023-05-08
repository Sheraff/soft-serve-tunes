import { type ForwardedRef, forwardRef, startTransition, useMemo, useDeferredValue, useRef, useImperativeHandle } from "react"
import Panel from "../Panel"
import { openPanel, showHome } from "components/AppContext"
import { trpc } from "utils/trpc"
import { getPlaylist, setPlaylist } from "client/db/useMakePlaylist"
import { autoplay, playAudio } from "components/Player/Audio"
import SectionTitle from "atoms/SectionTitle"
import TrackList, { useVirtualTracks } from "components/TrackList"
import styles from "./index.module.css"
import GenreGraph from "components/Header/Genre/GenreGraph"

export default forwardRef(function GenreView ({
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
	const { data, isLoading } = trpc.genre.get.useQuery({ id }, {
		enabled,
		keepPreviousData: true,
	})

	console.log(id, name)
	console.log(data)

	const onClickPlay = () => {
		if (!data) return
		startTransition(() => {
			const playlist = getPlaylist()
			setPlaylist(data.name, data.tracks)
			if (playlist?.current && playlist.current === data.tracks[0]?.id) {
				playAudio()
			} else {
				autoplay.setState(true)
			}
			showHome("home")
		})
	}

	const coverElement = (
		<GenreGraph
			id={id}
			name={name}
			genre={data}
		/>
	)

	const parent = useRef<HTMLDivElement>(null)

	useImperativeHandle(ref, () => parent.current!)

	return (
		<Panel
			ref={parent}
			open={open}
			z={z}
			rect={rect}
			// description={data?.audiodb?.strDescriptionEN}
			// coverId={data?.cover?.id}
			coverElement={coverElement}
			// coverPalette={data?.cover?.palette}
			infos={[]}
			title={data?.name ?? name}
			onClickPlay={onClickPlay}
			animationName={""}
			isTop={isTop}
		>
			{"content"}
		</Panel>
	)
})