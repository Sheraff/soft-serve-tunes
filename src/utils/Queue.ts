export default class Queue {
	rate: number
	queue: ((value?: unknown) => void)[]
	available: Promise<void> = Promise.resolve()
	wait = false

	constructor(rate: number, options: { wait?: boolean } = {}) {
		this.rate = rate
		this.queue = []
		this.wait = options.wait ?? false
	}
	
	async push<T>(callback: (...value: unknown[]) => T) {
		const executionPromise = new Promise(
			resolve => this.queue.push(resolve)
		).then(callback)

		if (this.queue.length === 1) {
			let nextItem
			while (nextItem = this.queue[0]) {
				await this.available
				if (this.wait) {
					await nextItem()
				} else {
					nextItem()
				}
				this.queue.shift()
				this.available = new Promise(resolve => setTimeout(resolve, this.rate))
			}
		}

		return executionPromise
	}

	next() {
		return new Promise((resolve) => this.push(resolve))
	}
}