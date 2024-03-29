import { useRef, useState, useEffect, type RefObject, useMemo } from "react"

type MinimumWorkerDataObject = { name: string }

type Obj = {
	[key: string]: Obj | string | Obj[] | string[]
}

function getIn(obj: Obj | string, [key, ...path]: string[]): string {
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

export default function useAsyncInputStringDistance<
	T extends MinimumWorkerDataObject,
	TSelected = T[],
>({
	inputRef,
	size = Infinity,
	dataList,
	keys = ["name"],
	select,
}: {
	inputRef: RefObject<HTMLInputElement>,
	size?: number,
	dataList: T[],
	keys?: string[],
	select?: (list: T[]) => TSelected,
}): TSelected {
	const worker = useRef<Worker | null>(null)
	const [list, setList] = useState<TSelected>(() => select
		? select([])
		: [] as unknown as TSelected
	)

	// use namedObjects to pass less data to/from worker, use `namedObjects.id`to map back to `dataList` index
	const namedObjects = useMemo(() =>
		dataList.map((item, id) => ({
			name: keys.map(key => getIn(item, key.split("."))).join(" ").toLowerCase(),
			id,
		})),
		[dataList, ...keys]
	)

	// these refs to avoid re-running useEffects
	const selectRef = useRef(select)
	selectRef.current = select

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
			if (inputMemo.value.toLowerCase().startsWith(data.input)) {
				const newList = [] as T[] // might not actually be `T` if dataList has changed since then
				for (let i = 0; i < data.list.length; i++) {
					newList.push(dataList[data.list[i]!]!)
				}
				if (selectRef.current)
					setList(selectRef.current(newList))
				else
					setList(newList as unknown as TSelected)
			}
		}
		workerMemo.addEventListener("message", onMessage)
		return () => {
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
			const value = inputMemo.value.trim().toLowerCase()
			if (worker.current && value) {
				if (lastInputValue === value) return
				worker.current.postMessage({ type: "input", input: value })
			} else if (!value) {
				if (selectRef.current)
					setList(selectRef.current([]))
				else
					setList([] as unknown as TSelected)
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