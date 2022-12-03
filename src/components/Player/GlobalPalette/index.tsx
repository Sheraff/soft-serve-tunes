import { useCurrentTrackDetails } from "client/db/useMakePlaylist"
import Palette from "components/Palette"
import { memo, useMemo } from "react"
import { type PaletteDefinition } from "utils/paletteExtraction"

export default memo(function GlobalPalette() {
	const data = useCurrentTrackDetails()

	return useMemo(() => (
		<Palette
			palette={data?.cover?.palette as PaletteDefinition | undefined}
		/>
	), [data?.cover])
})