const PRISMA_NON_RETRYABLE_ERROR_CODES = new Set([
	"P2000",
	"P2001",
	"P2002",
	"P2003",
	"P2004",
	"P2005",
	"P2006",
	"P2007",
	"P2008",
	"P2009",
	"P2010",
	"P2011",
	"P2012",
	"P2013",
	"P2014",
	"P2015",
	"P2016",
	"P2017",
	"P2018",
	"P2019",
	"P2020",
	"P2021",
	"P2022",
	"P2023",
	"P2025",
	"P2026",
	"P2028",
	"P2030",
	"P2031",
	"P2033",
])

export default async function retryable<T>(callback: () => (Promise<T> | T), tries = 0, originalError?: unknown): Promise<T> {
	try {
		const result = await callback()
		return result
	} catch (e) {
		if (tries < 5) {
			if (
				e
				&& typeof e === "object"
				&& ("code" in e)
				// @ts-expect-error -- the line above tests for the existence of `code` key in `e`
				&& PRISMA_NON_RETRYABLE_ERROR_CODES.has(e.code)
			) {
				console.error('will not retry callback, received an unrecoverable prisma error code')
				throw e
			}
			const code = typeof e === 'object' ? ` code:${e.code}` : ''
			const keys = typeof e === 'object' ? ` keys[${Object.keys(e).join(',')}]` : ''
			console.warn(new Error(`Error in retryable${code}${keys}, will retry #${tries}`, {cause: e}))
			await new Promise(resolve => setTimeout(resolve, Math.random() * 15 + 1000 * 2**tries))
			const result = await retryable(callback, tries + 1, originalError || e)
			return result
		} else {
			console.error(originalError)
			throw new Error('Retryable failed after all retries, see above for original stack trace', {cause: e})
		}
	}
}