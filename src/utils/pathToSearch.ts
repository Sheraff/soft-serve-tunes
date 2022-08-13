import { basename, extname, sep } from "path"

export default function pathToSearch(path: string) {
	const slashless = path.replace(new RegExp(`/\\${sep}/`, 'g'), ' ')
	const extensionless = basename(slashless, extname(slashless))
	return extensionless

}