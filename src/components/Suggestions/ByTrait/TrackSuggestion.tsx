import Dialog from "atoms/Dialog"
import SectionTitle from "atoms/SectionTitle"
import { getPlaylist, useMakePlaylist } from "client/db/useMakePlaylist"
import { showHome } from "components/AppContext"
import suspensePersistedState from "client/db/suspensePersistedState"
import TrackList from "components/TrackList"
import FilterIcon from "icons/filter_list.svg"
import PlaylistIcon from "icons/queue_music.svg"
import { useMemo, useState } from "react"
import { trpc } from "utils/trpc"
import styles from "../index.module.css"
import PillChoice from "../PillChoice"
import { addNewTraitByOption, options, selectionFromSelectedOptions, titleFromSelectedOptions, Trait } from "./utils"
import { autoplay, playAudio } from "components/Player/Audio"

const preferredTrackList = suspensePersistedState<Trait[]>("preferredTrackList", [{
	trait: "danceability",
	value: "1",
}])

export default function TracksByTraitSuggestion () {
	const [open, setOpen] = useState(false)
	const [preferredOptions, setPreferredTracks] = preferredTrackList.useState()
	const onSelect = addNewTraitByOption(setPreferredTracks)
	const makePlaylist = useMakePlaylist()
	const { data: tracks = [] } = trpc.track.byMultiTraits.useQuery({ traits: preferredOptions }, {
		keepPreviousData: true,
	})
	const title = useMemo(() => titleFromSelectedOptions(preferredOptions, "tracks"), [preferredOptions])
	const currentOptions = selectionFromSelectedOptions(preferredOptions)
	return (
		<>
			<SectionTitle>{title}</SectionTitle>
			<div className={styles.buttons}>
				<button type="button" onClick={() => {
					navigator.vibrate(1)
					const currentPlaylist = getPlaylist()
					makePlaylist({ type: "by-multi-traits", traits: preferredOptions }, title)
						.then((playlist) => {
							if (currentPlaylist?.current && playlist?.current === currentPlaylist.current)
								playAudio()
						})
					showHome("home")
					autoplay.setState(true)
				}}><PlaylistIcon /></button>
				<button type="button" onClick={() => {
					navigator.vibrate(1)
					setOpen(true)
				}}><FilterIcon /></button>
			</div>
			<Dialog title="Choose your mood" open={open} onClose={() => {
				navigator.vibrate(1)
				setOpen(false)
			}}>
				<PillChoice options={options} onSelect={onSelect} current={currentOptions} />
			</Dialog>
			<TrackList tracks={tracks} />
		</>
	)
}