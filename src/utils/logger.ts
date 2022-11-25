import { env } from "env/server.mjs"

type Levels = 'ready' | 'event' | 'info' | 'warn' | 'error'
type Category = string
type Entity = 'lastfm' | 'spotify' | 'audiodb' | 'fswatcher' | 'trpc' | 'acoustid' |'sharp'

const levelColor: {[key in Levels]: string} = {
	'error': "\x1b[31m",
	'ready': "\x1b[32m",
	'warn': "\x1b[33m",
	'event': "\x1b[35m",
	'info': "\x1b[36m",
}

const entityColor: {[key in Entity]: string} = {
	lastfm: "\x1b[30m\x1b[41m", // red
	spotify: "\x1b[30m\x1b[42m", // green
	audiodb: "\x1b[37m\x1b[44m", // blue
	fswatcher: "\x1b[30m\x1b[47m", // white
	trpc: "\x1b[37m\x1b[46m", // cyan
	acoustid: "\x1b[37m\x1b[45m", // magenta
	sharp: "\x1b[37m\x1b[43m", // yellow
}

const stop = "\x1b[0m"

function spaces(string: Category) {
	return ' '.repeat(5 - string.length)
}

export function log(message: string): void
export function log(entity: Entity, message: string): void
export function log(level: Levels, category: Category, message: string): void
export function log(level: Levels, category: Category, entity: Entity, message: string): void
export default function log(...args: [string] | [Entity, string] | [Levels, Category, string] | [Levels, Category, Entity, string]): void {
	switch (args.length) {
		case 1: {
			console.log(cleanString(args[0]))
			return
		}
		case 2: {
			const entityArg = args[0] as Entity
			console.log(cleanString(`${entityColor[entityArg]} ${entityArg} ${stop} ${args[1]}`))
			return
		}
		case 3: {
			const levelArg = args[0] as Levels
			const categoryArg = args[1] as Category
			console.log(cleanString(`${levelColor[levelArg]}${categoryArg}${spaces(categoryArg)}${stop} - ${args[2]}`))
			return
		}
		case 4: {
			const levelArg = args[0] as Levels
			const categoryArg = args[1] as Category
			const entityArg = args[2] as Entity
			console.log(cleanString(`${levelColor[levelArg]}${categoryArg}${spaces(categoryArg)}${stop} - ${entityColor[entityArg]} ${entityArg} ${stop} ${args[3]}`))
			return
		}
	}
}

function cleanString(string: string) {
	const clean1 = string
		.replaceAll(env.LAST_FM_API_KEY, '[[LAST_FM_API_KEY]]')
		.replaceAll(env.ACOUST_ID_API_KEY, '[[ACOUST_ID_API_KEY]]')
	if (!env.AUDIO_DB_API_KEY)
		return clean1
	return clean1
		.replaceAll(env.AUDIO_DB_API_KEY, '[[AUDIO_DB_API_KEY]]')
}