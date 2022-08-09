import { useRouter } from "next/router"
import { createContext, useContext } from "react"

type RouteContextType = {
	type: "track" | "album" | "artist" | "genre" | "",
	name: string,
	id: string,
	index: number,
}

const RouteContext = createContext<RouteContextType>({
	type: "",
	name: "",
	id: "",
	index: 0,
})

/**
 * Acceptable formats:
 * /genre/genre-name/id/[[index]]
 * /track/track-name/id/[[index]]
 * /album/album-name/id/[[index]]
 * /artist/artist-name/id/[[index]]
 */
function parseParts(parts: string | string[]): RouteContextType {
	if (parts.length === 0)
		return {
			type: "",
			name: "",
			id: "",
			index: 0,
		}

	if (
		!Array.isArray(parts)
		|| !parts[0] || !parts[1] || !parts[2]
		|| !["track", "album", "artist", "genre"].includes(parts[0])
	) {
		throw new Error("Invalid route")
	}

	return {
		type: parts[0] as RouteContextType["type"],
		name: parts[1],
		id: parts[2],
		index: Number(parts[3]) || 0,
	}
}

export function RouteParser({children}: {children: React.ReactNode}) {
	const {query: {parts = []}} = useRouter()
	return (
		<RouteContext.Provider value={parseParts(parts)}>
			{children}
		</RouteContext.Provider>
	)
}

export default function useRouteParts() {
	return useContext(RouteContext)
}