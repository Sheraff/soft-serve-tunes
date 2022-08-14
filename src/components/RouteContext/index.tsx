import { useRouter } from "next/router"
import { createContext, useContext } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import sanitizeString from "../../utils/sanitizeString"

type RouteType = "track" | "album" | "artist" | "genre"

type RouteDefinition = {
	type: RouteType | "",
	name?: string,
	id: string,
	index?: number,
}

type RouteContextType = RouteDefinition & {
	setIndex: (index: number) => void,
	setRoute: (route: RouteDefinition) => void,
}

const RouteContext = createContext<RouteContextType>({
	type: "",
	name: "",
	id: "",
	index: 0,
	setIndex: () => {},
	setRoute: () => {},
})

/**
 * Acceptable formats:
 * /genre/genre-name/id/[[index]]
 * /track/track-name/id/[[index]]
 * /album/album-name/id/[[index]]
 * /artist/artist-name/id/[[index]]
 */
function parseParts(parts: string | string[]): RouteDefinition {
	if (parts.length === 0)
		return {
			type: "",
			name: "",
			id: "",
			index: 0,
		}
	console.log(parts)
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
	const {query: {parts = []}, push} = useRouter()
	const {type, name, id, index = 0} = parseParts(parts)
	const setRoute = ({type, name = '', id, index = 0}: RouteDefinition) => {
		if(!(type && id)) return
		push(`/${type}/${sanitizedName(name) || '-'}/${id}/${index}`, undefined, {scroll: false, shallow: true})
	}
	const setIndex = (arg: number | ((prev: number) => number)) => {
		const next = typeof arg === "function"
			? arg(index)
			: index
		setRoute({type, name, id, index: next})
	}
	useIndexedTRcpQuery([`${type as RouteType}.get`, { id }], {
		enabled: Boolean(type && id && name === '-'),
		onSuccess: (item) => {
			if(!item?.name) return
			setRoute({type, name: sanitizedName(item.name), id, index})
		}
	})
	return (
		<RouteContext.Provider value={{
			type,
			name,
			id,
			index: index ?? 0,
			setIndex,
			setRoute,
		}}>
			{children}
		</RouteContext.Provider>
	)
}

export default function useRouteParts() {
	return useContext(RouteContext)
}

function sanitizedName(name: string) {
	return sanitizeString(name).replace(/\s/g, '-')
}