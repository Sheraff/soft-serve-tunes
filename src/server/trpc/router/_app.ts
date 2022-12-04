import { router } from "../trpc"
import { trackRouter } from "./track"
import { albumRouter } from "./album"
import { artistRouter } from "./artist"
import { genreRouter } from "./genre"
import { playlistRouter } from "./playlist"

export const appRouter = router({
  track: trackRouter,
  album: albumRouter,
  artist: artistRouter,
  genre: genreRouter,
  playlist: playlistRouter,
})

// export type definition of API
export type AppRouter = typeof appRouter
