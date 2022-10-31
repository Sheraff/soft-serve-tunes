// @ts-check
import { z } from "zod";

/**
 * Specify your server-side environment variables schema here.
 * This way you can ensure the app isn't built with invalid env vars.
 */
export const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]),
  NEXTAUTH_SECRET: z.string(),
  NEXTAUTH_URL: z.string().url(),
  LAST_FM_API_KEY: z.string(),
  AUDIO_DB_API_KEY: z.string(),
  SPOTIFY_CLIENT_ID: z.string(),
  SPOTIFY_CLIENT_SECRET: z.string(),
  TWITCH_CLIENT_ID: z.string(),
  TWITCH_CLIENT_SECRET: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  ACOUST_ID_API_KEY: z.string(),
  MUSIC_BRAINZ_USER_AGENT: z.string(),
  WEBSOCKET_SERVER_PORT: z.string().transform(Number),
  MAIN_DEVICE_WIDTH: z.string().transform(Number),
  MAIN_DEVICE_DENSITY: z.string().transform(Number),
  DAYS_BETWEEN_REFETCH: z.string().transform(days => 1000 * 60 * 60 * 24 * Number(days)),
  ALLOWED_USERS: z.preprocess(
    (string) => {
      if (typeof string !== "string") throw new Error('invalid ALLOWED_USERS env type')
      return string
        .split(",")
        .map((pair) => pair
          .split(":")
          .map(value => value.trim())
        )
    },
    z.array(z.tuple([
      z.string(),
      z.string()
    ]))
  ),
});

/**
 * Specify your client-side environment variables schema here.
 * This way you can ensure the app isn't built with invalid env vars.
 * To expose them to the client, prefix them with `NEXT_PUBLIC_`.
 */
export const clientSchema = z.object({
  NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER: z.string(),
  NEXT_PUBLIC_WEBSOCKET_URL: z.string(),
  NEXT_PUBLIC_UPLOAD_CHUNK_SIZE: z.number(),
});

/**
 * You can't destruct `process.env` as a regular object, so you have to do
 * it manually here. This is because Next.js evaluates this at build time,
 * and only used environment variables are included in the build.
 * @type {{ [k in keyof z.infer<typeof clientSchema>]: z.infer<typeof clientSchema>[k] | undefined }}
 */
export const clientEnv = {
  NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER: process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER,
  NEXT_PUBLIC_WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL,
  NEXT_PUBLIC_UPLOAD_CHUNK_SIZE: Number(process.env.NEXT_PUBLIC_UPLOAD_CHUNK_SIZE) || 30,
};
