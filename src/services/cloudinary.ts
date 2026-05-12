const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export async function uploadEncryptedFile(
  encryptedBytes: Uint8Array,
  filename: string,
): Promise<string> {
  const blob = new Blob([encryptedBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('upload_preset', UPLOAD_PRESET!);
  formData.append('resource_type', 'raw');

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`,
    { method: 'POST', body: formData },
  );
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
  const json = await res.json();
  return json.secure_url as string;
}
