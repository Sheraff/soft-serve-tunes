import { useCurrentTrack } from "client/db/useMakePlaylist"
import { ForwardedRef, forwardRef, memo, useState } from "react"

const Audio = forwardRef(function Audio(_, ref: ForwardedRef<HTMLAudioElement>) {
	const item = useCurrentTrack()
	const [autoPlay, setAutoPlay] = useState(false)
	return (
		<audio
			ref={ref}
			onPlay={autoPlay ? undefined : () => setAutoPlay(true)}
			hidden
			autoPlay={autoPlay}
			playsInline
			src={item?.id && `/api/file/${item.id}`}
		/>
	)
})

export default memo(Audio)