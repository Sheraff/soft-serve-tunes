import { createRouter } from "./context"
import superjson from "superjson"

import { listRouter } from "./list"
import { trackRouter } from "./track"
import { albumRouter } from "./album"
import { artistRouter } from "./artist"
import { genreRouter } from "./genre"
import { playlistRouter } from "./playlist"

export const appRouter = createRouter()
  .transformer(superjson)
  .merge("list.", listRouter)
  .merge("track.", trackRouter)
  .merge("album.", albumRouter)
  .merge("artist.", artistRouter)
  .merge("genre.", genreRouter)
  .merge("playlist.", playlistRouter)

// export type definition of API
export type AppRouter = typeof appRouter
