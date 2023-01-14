import { useQueryClient } from "@tanstack/react-query"
import descriptionFromPlaylistCredits from "client/db/useMakePlaylist/descriptionFromPlaylistCredits"
import { openPanel } from "components/AppContext"
import { Fragment, useMemo } from "react"

export default function usePlaylistDescription({
	artistData,
	length,
}: {
	artistData: {
		name: string
		id: string
	}[]
	length?: number
}) {
	const queryClient = useQueryClient()
	const description = useMemo(() => {
		const string = descriptionFromPlaylistCredits(artistData, length, true)
		const parts = string.split("{{name}}")
		return parts.flatMap((part, i) => [
			<Fragment key={i}>{part}</Fragment>,
			i === parts.length - 1
				? null
				: (
					<button
						key={artistData[i]!.id}
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							openPanel("artist", {
								id: artistData[i]!.id,
								name: artistData[i]!.name,
							}, queryClient)
						}}
					>
						{artistData[i]!.name}
					</button>
				)
		])
	}, [artistData, length, queryClient])
	
	return description
}