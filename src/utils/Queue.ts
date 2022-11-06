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

	async #run() {
		let nextItem
		while (nextItem = this.queue[0]) {
			await this.available
			try {
				if (this.wait) {
					await nextItem()
				} else {
					nextItem()
				}
			} catch (e) { // catching so that error on 1 item doesn't prevent other items from executing
				console.error(e)
			}
			this.queue.shift()
			this.available = new Promise(resolve => setTimeout(resolve, this.rate))
		}
	}

	#isWait<T>(callback: (...value: unknown[]) => PromiseLike<T> | T): callback is (...value: unknown[]) => PromiseLike<T> {
		return this.wait
	}

	async push<T>(callback: (...value: unknown[]) => PromiseLike<T> | T) {
		if (this.#isWait(callback)) {
			let resolve: (a: T | PromiseLike<T>) => void
			let reject: (a: T | PromiseLike<T>) => void
			const promise = new Promise<T>((res, rej) => {
				resolve = res
				reject = rej
			})
			this.queue.push(() => callback().then(resolve, reject))
			if (this.queue.length === 1) {
				this.#run()
			}
			return promise
		} else {
			const executionPromise = new Promise(r => this.queue.push(r)).then(callback)
			if (this.queue.length === 1) {
				this.#run()
			}
			return executionPromise
		}
	}

	next() {
		if (this.wait) {
			throw new Error('This is an awaited queue, you cannot call .next()')
		}
		return new Promise((resolve) => this.push(resolve))
	}

	/**
	 * @description Add some delay at the TOP of the queue
	 */
	delay(ms = this.rate * 10) {
		this.queue.unshift(() => new Promise(resolve => setTimeout(resolve, ms)))
	}
}