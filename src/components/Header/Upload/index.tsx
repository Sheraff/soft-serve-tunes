import Dialog from "atoms/Dialog"
import DropTarget from "./DropTarget"
import UploadFileIcon from "icons/upload_file.svg"
import UploadFolderIcon from "icons/drive_folder_upload.svg"
import UploadIcon from "icons/cloud_upload.svg"
import { ChangeEvent, memo, useCallback, useState } from "react"
import styles from "./index.module.css"
import { useProgressBar } from "components/ProgressBar"
import uploadLoop from "./uploadLoop"

export default memo(function Upload({
	className,
}: {
	className?: string
}) {
	const [open, setOpen] = useState(false)
	const setProgress = useProgressBar()

	const onChange = (event: ChangeEvent<HTMLInputElement>) => {
		const input = event.nativeEvent.target as HTMLInputElement
		const files = input.files
		setOpen(false)
		if (!files) return
		uploadLoop([...files], async (file: File) => {
			if (file && !file.name.startsWith('.') && file.type.startsWith('audio/')) {
				return {
					size: file.size,
					file,
					path: file.webkitRelativePath || file.name,
				}
			}
		}, setProgress)
	}

	const close = useCallback(() => setOpen(false), [])

	return (
		<>
			<button type="button" className={className} onClick={() => setOpen(true)}><UploadIcon /></button>
			<Dialog title="Upload music files" open={open} onClose={() => setOpen(false)}>
				<label className={styles.label}>
					<UploadFileIcon />
					<p>Upload files</p>
					<input
						type="file"
						accept="audio/*"
						multiple
						onChange={onChange}
					/>
				</label>
				<label className={styles.label}>
					<UploadFolderIcon />
					<p>Upload a folder</p>
					<input
						type="file"
						accept="audio/*"
						// @ts-expect-error -- ts doesn't know this attribute
						webkitdirectory=""
						onChange={onChange}
					/>
				</label>
				<p className={styles.instructions}>...or drag and drop files</p>
			</Dialog>
			<DropTarget onUserAction={close}/>
		</>
	)
})