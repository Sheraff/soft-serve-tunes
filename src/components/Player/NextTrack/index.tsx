import { useNextTrack, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import useIsOnline from "utils/typedWs/useIsOnline"
import Head from "next/head"
import { memo, useEffect, type RefObject } from "react"
import { useCachedTrack } from "client/sw/useCachedTrack"
import { trpc } from "utils/trpc"

export default memo(function NextTrack({
	audio,
	id,
}: {
	audio: RefObject<HTMLAudioElement>
	id?: string
}) {
	const nextItem = useNextTrack()
	const {nextPlaylistIndex} = useSetPlaylistIndex()
	const online = useIsOnline()
	const {data: cached} = useCachedTrack({id})

	useEffect(() => {
		const element = audio.current
		if (!element) return
		const controller = new AbortController()
		element.addEventListener("ended", () => {
			console.log("ended", nextItem)
			if (nextItem) {
				element.setAttribute("autoplay", "true")
				element.src = `/api/file/${nextItem.id}`
				element.load()
			}
			nextPlaylistIndex(audio)
		}, {signal: controller.signal})
		return () => controller.abort()
	}, [audio, nextPlaylistIndex, nextItem])

	const enabled = Boolean(online && cached && nextItem)

	const { data } = trpc.track.miniature.useQuery({
		id: nextItem?.id as string
	}, { enabled })

	if (!enabled) {
		return null
	}
	return (
		<Head>
			<link
				key={`/api/file/${nextItem!.id}`}
				rel="prefetch"
				as="audio"
				href={`/api/file/${nextItem!.id}`}
				// @ts-expect-error -- fetchpriority does exist
				fetchpriority="low"
			/>
			{Boolean(data?.cover?.id) && (
				<link
					key={`/api/cover/${data?.cover?.id}`}
					rel="prefetch"
					as="image"
					href={`/api/cover/${data?.cover?.id}`}
					// @ts-expect-error -- fetchpriority does exist
					fetchpriority="low"
				/>
			)}
		</Head>
	)
})