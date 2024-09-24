import type { Conversation } from "$lib/types/Conversation";
import type { MessageFile } from "$lib/types/Message";
import { sha256 } from "$lib/utils/sha256";
import { fileTypeFromBuffer } from "file-type";
import { collections } from "$lib/server/database";

export async function uploadFile(file: File, conv: Conversation): Promise<MessageFile> {
	const sha = await sha256(await file.text());
	const buffer = await file.arrayBuffer();

	// Attempt to detect the mime type of the file, fallback to the uploaded mime
	const mime = await fileTypeFromBuffer(buffer).then((fileType) => fileType?.mime ?? file.type);

	const upload = collections.bucket.openUploadStream(`${conv._id}-${sha}`, {
		metadata: { conversation: conv._id.toString(), mime },
	});

	upload.write((await file.arrayBuffer()) as unknown as Buffer);
	upload.end();

	// Prepare the form data to send the file to the backend API
	const formData = new FormData();
	formData.append("file", file, file.name);
	formData.append("file_id", sha);

	// Wrap the upload and fetch operations in promises
	const uploadPromise = new Promise<void>((resolve, reject) => {
		upload.once("finish", resolve);
		upload.once("error", reject);
	});

	const fetchPromise = fetch("http://localhost:8000/embed", {
		method: "POST",
		body: formData,
	}).then((response) => {
		if (!response.ok) {
			throw new Error(`Failed to upload file to backend API: ${response.statusText}`);
		}
	});

	// Wait for both the upload and fetch operations to complete
	await Promise.all([uploadPromise, fetchPromise]);

	return { type: "hash", value: sha, mime: file.type, name: file.name };
}
