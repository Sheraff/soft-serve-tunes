import { memo, useEffect, useState } from "react"
import { env } from "../env/client.mjs"
import { trpc } from "../utils/trpc"

export default memo(function Test({artistId}: {artistId?: string | null}) {
	const { mutate } = trpc.useMutation(["audiodb.fetch"])

	const [enabled, setEnabled] = useState("")
	const {data} = trpc.useQuery(["audiodb.get.artist", {id: enabled}], {
		enabled: Boolean(enabled),
	})
	
	useEffect(() => {
		if(!artistId) return
		const controller = new AbortController()
		mutate({id: artistId}, { onSuccess: (response) => {
			if (response) {
				setEnabled(artistId)
				return
			}
			const socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
			socket.onopen = () => {
				socket.send(JSON.stringify({type: 'audiodb:subscribe', payload: {id: artistId}}))
			}
			socket.addEventListener("message", (e) => {
				const data = JSON.parse(e.data)
				if (data.type === "audiodb:done") {
					setEnabled(artistId)
					socket.close()
				}
			}, {signal: controller.signal})
		} })
		return () => controller.abort()
	}, [mutate, artistId])
	return null
})