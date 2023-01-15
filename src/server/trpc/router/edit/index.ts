import { router } from "server/trpc/trpc"
import { albumEditRouter } from "./album"
import { artistEditRouter } from "./artist"
import { genreEditRouter } from "./genre"
import { trackEditRouter } from "./track"

export const editRouter = router({
	track: trackEditRouter,
	album: albumEditRouter,
	artist: artistEditRouter,
	genre: genreEditRouter,
})