// @ts-check
import { z } from "zod";

/**
 * Specify your server-side environment variables schema here.
 * This way you can ensure the app isn't built with invalid env vars.
 */
export const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]),
  LAST_FM_API_KEY: z.string(),
  LAST_FM_SHARED_SECRET: z.string(),
  AUDIO_DB_API_KEY: z.string(),
  SPOTIFY_CLIENT_ID: z.string(),
  SPOTIFY_CLIENT_SECRET: z.string(),
  ACCOUST_ID_API_KEY: z.string(),
});

/**
 * Specify your client-side environment variables schema here.
 * This way you can ensure the app isn't built with invalid env vars.
 * To expose them to the client, prefix them with `NEXT_PUBLIC_`.
 */
export const clientSchema = z.object({
  NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER: z.string(),
  NEXT_PUBLIC_WEBSOCKET_PORT: z.number(),
});

/**
 * You can't destruct `process.env` as a regular object, so you have to do
 * it manually here. This is because Next.js evaluates this at build time,
 * and only used environment variables are included in the build.
 * @type {{ [k in keyof z.infer<typeof clientSchema>]: z.infer<typeof clientSchema>[k] | undefined }}
 */
export const clientEnv = {
  NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER: process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER,
  NEXT_PUBLIC_WEBSOCKET_PORT: Number(process.env.NEXT_PUBLIC_WEBSOCKET_PORT),
};
