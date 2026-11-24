/**
 * What the console's file preview needs to know about a stored file, and how
 * it tells a picture from anything else. See hooks/useFilePreview.
 */
export interface PreviewFile {
  /** Stable per file: the attachment or receipt id. */
  id: string;
  name?: string;
  /** The stored MIME type, when the list knows it. */
  mime?: string;
  /** Issues a fresh signed link to the bytes. */
  resolve: () => Promise<string>;
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;
const OTHER_EXTENSION = /\.(pdf|xlsx?|csv|docx?|json|txt|zip)$/i;

/**
 * Whether a file is a picture: by its stored type first, then its name. Unknown
 * is treated as a picture, because every file that reaches here without a type
 * (OCR receipts, transfer slips) is a photo; the dialog still offers the tab
 * if the browser can't draw it.
 */
export function looksLikeImage(file: Pick<PreviewFile, "name" | "mime">): boolean {
  if (file.mime) return file.mime.toLowerCase().startsWith("image/");
  if (file.name && IMAGE_EXTENSION.test(file.name)) return true;
  return !(file.name && OTHER_EXTENSION.test(file.name));
}

/** The signed link's own path, for a file whose name and type were unknown. */
export function linkIsOtherFile(url: string): boolean {
  try {
    return OTHER_EXTENSION.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
