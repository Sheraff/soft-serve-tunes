import Dialog from "atoms/Dialog"
import SectionTitle from "atoms/SectionTitle"
import suspensePersistedState from "client/db/suspensePersistedState"
import FilterIcon from "icons/filter_list.svg"
import { useMemo, useState } from "react"
import { trpc } from "utils/trpc"
import styles from "../index.module.css"
import PillChoice from "../PillChoice"
import { addNewTraitByOption, options, selectionFromSelectedOptions, titleFromSelectedOptions, Trait } from "./utils"
import AlbumList from "components/AlbumList"

const preferredAlbumList = suspensePersistedState<Trait[]>("preferredAlbumList", [{
	trait: "danceability",
	value: "1",
}])

export default function AlbumsByTraitSuggestion() {
	const [open, setOpen] = useState(false)
	const [preferredOptions, setPreferredAlbums] = preferredAlbumList.useState()
	const onSelect = addNewTraitByOption(setPreferredAlbums)
	const {data: albums = [], isLoading} = trpc.album.byMultiTraits.useQuery({traits: preferredOptions}, {
		keepPreviousData: true,
	})
	const title = useMemo(() => titleFromSelectedOptions(preferredOptions, "albums"), [preferredOptions])
	const currentOptions = selectionFromSelectedOptions(preferredOptions)
	
	return (
		<>
			<SectionTitle>{title}</SectionTitle>
			<div className={styles.buttons}>
				<button type="button" onClick={() => {
					navigator.vibrate(1)
					setOpen(true)
				}}><FilterIcon /></button>
			</div>
			<Dialog title="Choose your mood" open={open} onClose={() => {
				navigator.vibrate(1)
				setOpen(false)
			}}>
				<PillChoice options={options} onSelect={onSelect} current={currentOptions}/>
			</Dialog>
			<AlbumList albums={albums} lines={1} scrollable loading={isLoading}/>
		</>
	)
}