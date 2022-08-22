import { ForwardedRef, forwardRef, memo } from "react"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import { useAppState } from "components/AppContext"

const Audio = forwardRef(function Audio(_, ref: ForwardedRef<HTMLAudioElement>) {
	const {playlist} = useAppState()
	const { data: list} = useIndexedTRcpQuery(["playlist.generate", {
		type: playlist?.type as string,
		id: playlist?.id as string,
	}], {
		enabled: Boolean(playlist?.type && playlist?.id)
	})
	
	const item = playlist?.index === undefined ? undefined : list?.[playlist.index]
	
	return (
		<audio
			ref={ref}
			hidden
			playsInline
			src={item?.id && `/api/file/${item.id}`}
			autoPlay
		/>
	)
})

export default memo(Audio)