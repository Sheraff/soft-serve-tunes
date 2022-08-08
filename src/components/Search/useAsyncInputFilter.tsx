import { useRef, useState, useEffect, RefObject } from "react"

export default function useAsyncInputStringDistance<T extends {name: string}>(
	inputRef: RefObject<HTMLInputElement>,
	dataList: T[]
): T[] {
	const [list, setList] = useState(dataList)

	const worker = useRef<Worker | null>(null)

	useEffect(() => {
		const workerMemo = new Worker("./worker/asyncInput.worker.js", {
			type: "module"
		})
		worker.current = workerMemo
		const onMessage = ({
			data
		}: {
			data: {
				list: T[]
				input: string
			}
		}) => {
			console.log('received', inputRef.current?.value, data.input)
			if (inputRef.current.value === data.input) {
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

		console.log('sending list')
		worker.current.postMessage({ type: "list", list: dataList })
		const onInput = () => {
			if (worker.current && inputMemo.value) {
				console.log('sending input')
				worker.current.postMessage({ type: "input", input: inputMemo.value })
			}
		}
		onInput()
		inputMemo.addEventListener("input", onInput, { passive: true })
		return () => {
			inputMemo.removeEventListener("input", onInput)
		}
	}, [dataList, inputRef])

	return list
}