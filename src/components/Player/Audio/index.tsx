import { ForwardedRef, forwardRef, memo } from "react"
import useIndexedTRcpQuery from "../../../client/db/useIndexedTRcpQuery"
import { useRouteParts } from "../../RouteContext"

const Audio = forwardRef(function Audio(_, ref: ForwardedRef<HTMLAudioElement>) {
	const {type, id, index} = useRouteParts()

	const { data: list } = useIndexedTRcpQuery(["playlist.generate", { type, id }], {
		enabled: Boolean(type && id)
	})

	const item = list?.[index]
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