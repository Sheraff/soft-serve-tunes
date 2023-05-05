import { useCurrentTrack } from "client/db/useMakePlaylist"
import globalState from "client/globalState"
import { type ForwardedRef, forwardRef, memo, useRef, useImperativeHandle, useEffect } from "react"

export const autoplay = globalState<boolean>("autoplay", false)

let audioElement: HTMLAudioElement | null = null

export function playAudio () {
	if (!audioElement) return
	audioElement.play()
	if (autoplay.getValue()) return
	autoplay.setState(true)
}

const Audio = forwardRef(function Audio (_, ref: ForwardedRef<HTMLAudioElement>) {
	const item = useCurrentTrack()
	const audio = useRef<HTMLAudioElement>(null)
	useImperativeHandle(ref, () => audio.current!)
	useEffect(() => {
		if (audio.current) audioElement = audio.current
	}, [])
	return (
		<audio
			ref={audio}
			hidden
			autoPlay={autoplay.useValue()}
			playsInline
			src={item?.id && `/api/file/${item.id}`}
			crossOrigin="use-credentials"
		/>
	)
})

export default memo(Audio)