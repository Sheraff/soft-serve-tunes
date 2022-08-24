export default async function retryable<T>(callback: () => (Promise<T> | T), tries = 0): Promise<T> {
	try {
		const result = await callback()
		return result
	} catch (e) {
		if (tries < 5) {
			await new Promise(resolve => setTimeout(resolve, 1000 * 2**tries))
			const result = await retryable(callback, tries + 1)
			return result
		} else {
			throw e
		}
	}
}