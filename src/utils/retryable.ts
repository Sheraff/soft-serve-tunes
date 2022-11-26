export default async function retryable<T>(callback: () => (Promise<T> | T), tries = 0): Promise<T> {
	try {
		const result = await callback()
		return result
	} catch (e) {
		if (tries < 5) {
			const code = typeof e === 'object' ? ` code:${e.code}` : ''
			const keys = typeof e === 'object' ? ` keys[${Object.keys(e).join(',')}]` : ''
			console.warn(new Error(`Error in retryable${code}${keys}, will retry #${tries}`, {cause: e}))
			await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 1000 * 2**tries))
			const result = await retryable(callback, tries + 1)
			return result
		} else {
			throw e
		}
	}
}