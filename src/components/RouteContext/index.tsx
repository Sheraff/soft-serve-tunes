import { useRouter } from "next/router"
import { createContext, useContext, useEffect, useState } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import sanitizeString from "../../utils/sanitizeString"

const routeTypes = ["track", "album", "artist", "genre"] as const
type RouteType = typeof routeTypes[number]
const paneTypes = ["search", "playlist", ""] as const
type PaneType = typeof paneTypes[number]

type RouteDefinition = {
	type: RouteType | "",
	name?: string,
	id: string,
	index?: number,
}

type RouteContextType = RouteDefinition & {
	pane: PaneType,
	setIndex: (index: number | ((prev: number) => number)) => void,
	setRoute: (route: RouteDefinition, pane?: PaneType) => void,
	setPane: (pane: PaneType) => void,
}

const RouteContext = createContext<RouteContextType>({
	type: "",
	name: "",
	id: "",
	index: 0,
	pane: "",
	setIndex: () => {},
	setRoute: () => {},
	setPane: () => {},
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
		// @ts-expect-error -- this *is* the type check...
		|| !routeTypes.includes(parts[0])
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

function parseHash(url?: string): PaneType {
	const hash = url?.split("#")?.[1]
	if (!hash) {
		return ""
	}
	// @ts-expect-error -- this *is* the type check...
	if (!paneTypes.includes(hash)) {
		throw new Error("Invalid hash")
	}
	return hash as PaneType
}

export function RouteParser({children}: {children: React.ReactNode}) {
	const {query: {parts = []}, push, events} = useRouter()
	const {type, name, id, index = 0} = parseParts(parts)
	const [pane, setPaneState] = useState<PaneType>("")
	useEffect(() => {
		setPaneState(parseHash(window?.location.hash))
	}, [])

	const setRoute: RouteContextType['setRoute'] = ({type, name = '', id, index = 0}, pane) => {
		const hash = pane ? `#${pane}` : ""
		if(!(type && id)) {
			push(hash)
		} else {
			push(`/${type}/${sanitizedName(name) || '-'}/${id}/${index}${hash}`, undefined, {scroll: false, shallow: true})
		}
	}
	const setIndex: RouteContextType['setIndex'] = (arg) => {
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

	const setPane: RouteContextType['setPane'] = (pane) => {
		setRoute({type, name, id, index}, pane)
	}

	useEffect(() => {
		const hashChange = (url: string) => setPaneState(() => parseHash(url))
		events.on("hashChangeStart", hashChange)
		events.on("routeChangeStart", hashChange)
		return () => {
			events.off("hashChangeStart", hashChange)
			events.off("routeChangeStart", hashChange)
		}
	}, [events])
	
	return (
		<RouteContext.Provider value={{
			type,
			name,
			id,
			index: index ?? 0,
			pane,
			setIndex,
			setRoute,
			setPane,
		}}>
			{children}
		</RouteContext.Provider>
	)
}

export function useRouteParts() {
	return useContext(RouteContext)
}

function sanitizedName(name: string) {
	return sanitizeString(name).replace(/\s/g, '-')
}