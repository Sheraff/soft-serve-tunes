import { useRef, useState, useEffect, RefObject } from "react"

export default function useAsyncInputStringDistance<T extends {name: string}>(
	inputRef: RefObject<HTMLInputElement>,
	dataList: T[],
	keys: string[] = ["name"],
): T[] {
	const [list, setList] = useState(dataList)

	const worker = useRef<Worker | null>(null)

	useEffect(() => {
		const {current: inputMemo} = inputRef
		if (!inputMemo) return

		const workerMemo = new Worker(
			new URL("./worker/asyncInput.worker.js", import.meta.url),
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