import { router } from "server/trpc/trpc"
import { trackEditRouter } from "./track"

export const editRouter = router({
	track: trackEditRouter,
})