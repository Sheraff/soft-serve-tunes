import { ForwardedRef, forwardRef, memo } from "react"
import { useCurrentTrack } from "components/AppContext/useCurrentTrack"

const Audio = forwardRef(function Audio(_, ref: ForwardedRef<HTMLAudioElement>) {
	const item = useCurrentTrack()
	
	return (
		<audio
			ref={ref}
			hidden
			playsInline
			src={item?.id && `/api/file/${item.id}`}
		/>
	)
})

export default memo(Audio)