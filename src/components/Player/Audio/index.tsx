import { useCurrentTrack } from "client/db/useMakePlaylist"
import globalState from "client/globalState"
import { type ForwardedRef, forwardRef, memo } from "react"

export const autoplay = globalState<boolean>("autoplay", false)

const Audio = forwardRef(function Audio (_, ref: ForwardedRef<HTMLAudioElement>) {
	const item = useCurrentTrack()
	return (
		<audio
			ref={ref}
			hidden
			autoPlay={autoplay.useValue()}
			playsInline
			src={item?.id && `/api/file/${item.id}`}
		/>
	)
})

export default memo(Audio)