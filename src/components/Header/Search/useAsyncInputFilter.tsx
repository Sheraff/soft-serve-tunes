import { useRef, useState, useEffect, type RefObject, useMemo, startTransition } from "react"

type MinimumWorkerDataObject = { name: string }

type Obj = {
	[key: string]: Obj | string | Obj[] | string[]
}

function getIn (obj: Obj | string, [key, ...path]: string[]): string {
	if (typeof obj === "string")
		return obj
	if (!key)
		return ""
	const next = obj[key]
	if (!next)
		return ""
	if (Array.isArray(next))
		return next.map(branch => getIn(branch, path)).join(" ")
	return getIn(next, path)
}

export default function useAsyncInputStringDistance<T extends MinimumWorkerDataObject> (
	inputRef: RefObject<HTMLInputElement>,
	size: number,
	dataList: T[],
	keys: string[] = ["name"],
): T[] {
	const worker = useRef<Worker | null>(null)
	const [list, setList] = useState<T[]>([])

	// use namedObjects to pass less data to/from worker, use `namedObjects.id`to map back to `dataList` index
	const namedObjects = useMemo(() =>
		dataList.map((item, id) => ({
			name: keys.map(key => getIn(item, key.split("."))).join(" "),
			id,
		})),
		[dataList, ...keys]
	)

	// use these 2 refs to avoid making calls to worker for an input value that isn't current
	const isWorking = useRef(false)
	const nextValue = useRef<string | null>(null)

	useEffect(() => {
		const { current: inputMemo } = inputRef
		if (!inputMemo) return

		const workerMemo = new Worker(
			new URL("./worker/asyncInput.worker.ts", import.meta.url),
			{ type: "module" }
		)
		worker.current = workerMemo
		const onMessage = ({
			data
		}: {
			data: {
				list: Uint16Array
				input: string
			}
		}) => {
			if (nextValue.current && worker.current) {
				worker.current.postMessage({ type: "input", input: nextValue.current })
				nextValue.current = null
			} else {
				isWorking.current = false
			}
			if (inputMemo.value === data.input) {
				startTransition(() => {
					const newList = [] as T[] // might not actually be `T` if dataList has changed since then
					for (let i = 0; i < data.list.length; i++) {
						newList.push(dataList[data.list[i]!]!)
					}
					setList(newList)
				})
			}
		}
		workerMemo.addEventListener("message", onMessage)
		return () => {
			isWorking.current = false
			workerMemo.removeEventListener("message", onMessage)
			workerMemo.terminate()
		}
	}, [inputRef, dataList])

	useEffect(() => {
		const { current: inputMemo } = inputRef
		if (!worker.current || !inputMemo) return

		worker.current.postMessage({ type: "list", list: namedObjects, size })
		let lastInputValue: string
		const onInput = () => {
			const value = inputMemo.value.trim()
			if (worker.current && value) {
				if (lastInputValue === value) return
				if (!isWorking.current) {
					worker.current.postMessage({ type: "input", input: value })
					isWorking.current = true
				} else {
					nextValue.current = value
				}
			} else if (!value) {
				startTransition(() => {
					setList([])
				})
			}
			lastInputValue = value
		}
		onInput()

		inputMemo.addEventListener("input", onInput, { passive: true })
		return () => {
			inputMemo.removeEventListener("input", onInput)
		}
	}, [namedObjects, size, inputRef])

	return list
}