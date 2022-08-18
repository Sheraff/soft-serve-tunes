import { useRef, useState, useEffect, RefObject, useMemo } from "react"

type MinimumWorkerDataObject = {name: string, id: string}

function getIn(obj: any, path: string) {
	return path.split('.').reduce((acc, key) => acc[key] || '', obj)
}

export default function useAsyncInputStringDistance<T extends MinimumWorkerDataObject>(
	inputRef: RefObject<HTMLInputElement>,
	dataList: T[],
	keys: string[] = ["name"],
): T[] {
	const worker = useRef<Worker | null>(null)
	const [list, setList] = useState<T[]>([])

	// use namedObjects to pass less data to/from worker, use mapList to map back to original data
	const [mapList, namedObjects] = useMemo(() => {
		const map = new Map<string, T>()
		const namedObjects = [] as Pick<T, keyof MinimumWorkerDataObject>[]
		for (const item of dataList) {
			map.set(item.id, item)
			namedObjects.push({
				name: keys.map(key => getIn(item, key)).join(' '),
				id: item.id,
			})
		}
		return [map, namedObjects]
	}, [dataList, ...keys])

	// use these 2 refs to avoid making calls to worker for an input value that isn't current
	const isWorking = useRef(false)
	const nextValue = useRef<string | null>(null)

	useEffect(() => {
		const {current: inputMemo} = inputRef
		if (!inputMemo) return

		const workerMemo = new Worker(
			new URL("./worker/asyncInput.worker", import.meta.url),
			{ type: "module" }
		)
		worker.current = workerMemo
		const onMessage = ({
			data
		}: {
			data: {
				list: MinimumWorkerDataObject[]
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
				setList(data.list.map(({id}) => mapList.get(id) as T)) // might not actually be `T` if list has changed since then
			}
		}
		workerMemo.addEventListener("message", onMessage)
		return () => {
			workerMemo.removeEventListener("message", onMessage)
			workerMemo.terminate()
		}
	}, [inputRef, mapList])

	useEffect(() => {
		const { current: inputMemo } = inputRef
		if (!worker.current || !inputMemo) return

		worker.current.postMessage({ type: "list", list: namedObjects })
		const onInput = () => {
			if (worker.current && inputMemo.value) {
				if (!isWorking.current) {
					worker.current.postMessage({ type: "input", input: inputMemo.value })
					isWorking.current = true
				} else {
					nextValue.current = inputMemo.value
				}
			} else if (!inputMemo.value) {
				setList([])
			}
		}
		onInput()

		inputMemo.addEventListener("input", onInput, { passive: true })
		return () => {
			inputMemo.removeEventListener("input", onInput)
		}
	}, [namedObjects, inputRef])

	return list
}