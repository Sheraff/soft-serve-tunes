import { type Dispatch, type SetStateAction, useState, useEffect } from "react"

const setters = new Set<Dispatch<SetStateAction<boolean>>>()

function onOnline() {
	setters.forEach(setter => setter(true))
}
function onOffline() {
	setters.forEach(setter => setter(false))
}

function addOnlineListener() {
	addEventListener('offline', onOffline)
	addEventListener('online', onOnline)
}
function removeOnlineListener() {
	removeEventListener('offline', onOffline)
	removeEventListener('online', onOnline)
}

export default function useIsOnline() {
	const [isOnline, setIsOnline] = useState(true)
	useEffect(() => {
		setters.add(setIsOnline)
		if (setters.size === 1) {
			addOnlineListener()
		}
		return () => {
			setters.delete(setIsOnline)
			if (setters.size === 0) {
				removeOnlineListener()
			}
		}
	}, [])
	return isOnline
}