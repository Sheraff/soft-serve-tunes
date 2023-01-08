import { router } from "server/trpc/trpc"
import { albumEditRouter } from "./album"
import { trackEditRouter } from "./track"

export const editRouter = router({
	track: trackEditRouter,
	album: albumEditRouter,
})