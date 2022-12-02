import { useCurrentTrackDetails } from "client/db/useMakePlaylist"
import Palette from "components/Palette"
import { memo, useMemo } from "react"

export default memo(function GlobalPalette() {
	const data = useCurrentTrackDetails()

	return useMemo(() => (
		<Palette
			palette={data?.cover ? JSON.parse(data.cover.palette) : undefined}
		/>
	), [data?.cover])
})