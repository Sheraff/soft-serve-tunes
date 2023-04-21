import { useQuery, useMutation } from "@tanstack/react-query"
import { deleteFromIndexedDB, listAllFromIndexedDB, storeInIndexedDB } from "./utils"
import { queryClient } from "utils/trpc"

const MAX_ITEMS_COUNT = 30

export type PastSearchItem = {
	type: "track" | "album" | "artist" | "genre" | "playlist"
	id: string
	key: string
	timestamp: number
}

export function usePastSearchesQuery () {
	return useQuery<PastSearchItem[]>(["pastSearches"], {
		async queryFn () {
			const results = await listAllFromIndexedDB<PastSearchItem>("pastSearches")
			return results.sort((a, b) => b.timestamp - a.timestamp)
		},
		cacheTime: 0,
	})
}

export function usePastSearchesMutation () {
	return useMutation(["pastSearches"], {
		async mutationFn ({
			type,
			id,
		}: Pick<PastSearchItem, "type" | "id">) {
			const entry = { type, key: id, id, timestamp: Date.now() }
			await storeInIndexedDB("pastSearches", id, entry)
			const list = await listAllFromIndexedDB<PastSearchItem>("pastSearches")
			if (list.length > MAX_ITEMS_COUNT) {
				const sorted = list.sort((a, b) => b.timestamp - a.timestamp)
				const extraCount = list.length - MAX_ITEMS_COUNT
				for (let i = 0; i < extraCount; i++) {
					const item = sorted.pop() as PastSearchItem
					await deleteFromIndexedDB("pastSearches", item.key)
				}
			}
			return entry
		},
		onSuccess () {
			queryClient.invalidateQueries(["pastSearches"])
		}
	})
}

export function useRemoveFromPastSearches () {
	return useMutation(["pastSearches"], {
		async mutationFn ({ id }: Pick<PastSearchItem, "id">) {
			return deleteFromIndexedDB("pastSearches", id)
		},
		onSuccess (_, { id }) {
			queryClient.setQueryData<PastSearchItem[]>(["pastSearches"], (list) => {
				if (!list) return []
				return list.filter(item => item.id !== id)
			})
		}
	})
}