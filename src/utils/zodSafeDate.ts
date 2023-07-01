import { z } from "zod"

export const zSafeDate = z
	.any()
	.optional()
	.transform((dateString) => {
		if (!dateString || typeof dateString !== 'string') return undefined
		const date = new Date(dateString)
		if (!z.date().safeParse(date).success) {
			return undefined
		}
		return date
	})
