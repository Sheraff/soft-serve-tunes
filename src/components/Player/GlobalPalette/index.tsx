import { useCurrentTrackDetails } from "components/AppContext/useCurrentTrack"
import Palette from "components/Palette"

export default function GlobalPalette() {
	const data = useCurrentTrackDetails()

	return (
		<Palette
			palette={data?.cover ? JSON.parse(data.cover.palette) : undefined}
		/>
	)
}