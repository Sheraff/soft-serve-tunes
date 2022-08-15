import { useRef, useState, useEffect, RefObject } from "react"

type MemoList<T> = WeakMap<T[], Map<string, T[]>>
const lists = new WeakMap<MemoList>()

export default function useAsyncInputStringDistance<T extends {name: string}>(
	inputRef: RefObject<HTMLInputElement>,
	dataList: T[],
	keys: string[] = ["name"],
): T[] {
	const [list, setList] = useState(() => {
		if (!inputRef.current?.value) {
			return []
		}
		const pastList = lists.get(dataList)
		if (pastList) {
			const pastResult = pastList.get(inputRef.current.value)
			if (pastResult) {
				return pastResult
			}
		}
		return []
	})

	const worker = useRef<Worker | null>(null)

	const listRef = useRef(dataList)
	listRef.current = dataList

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
				list: T[]
				input: string
			}
		}) => {
			if (inputMemo.value === data.input) {
				setList(data.list)
			}

			// memoize for later, this is not accurate as listRef might not be the one that triggered the worker
			// but it's fine enough because it's used for the half second where the worker boots up
			const memo = lists.get(listRef.current)
			if (memo) {
				memo.set(data.input, data.list)
			}
		}
		workerMemo.addEventListener("message", onMessage)
		return () => {
			workerMemo.removeEventListener("message", onMessage)
			workerMemo.terminate()
		}
	}, [inputRef])

	useEffect(() => {
		const { current: inputMemo } = inputRef
		if (!worker.current || !inputMemo) return

		if (!lists.has(dataList)) {
			lists.set(dataList, new Map())
		}
		worker.current.postMessage({ type: "list", list: dataList, keys })
		const onInput = () => {
			if (worker.current && inputMemo.value) {
				worker.current.postMessage({ type: "input", input: inputMemo.value })
			} else if (!inputMemo.value) {
				setList([])
			}
		}
		onInput()

		inputMemo.addEventListener("input", onInput, { passive: true })
		return () => {
			inputMemo.removeEventListener("input", onInput)
		}
	}, [dataList, inputRef, ...keys])

	return list
}