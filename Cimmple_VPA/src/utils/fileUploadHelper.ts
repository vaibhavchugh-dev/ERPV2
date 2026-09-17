export const DEFAULT_UPLOAD_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf",
  "ppt", "pptx", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "msg", "eml",
];

export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type FileValidationResult = {
  valid: File[];
  errors: string[];
};

function getFileExtension(name: string): string {
  const parts = (name || "").split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function validateSelectedFiles(
  files: File[],
  options?: {
    acceptedExtensions?: string[];
    maxFileSizeBytes?: number;
    existing?: Array<{ name: string; size: number }>;
  }
): FileValidationResult {
  const acceptedExtensions = options?.acceptedExtensions || DEFAULT_UPLOAD_EXTENSIONS;
  const maxFileSizeBytes = options?.maxFileSizeBytes || DEFAULT_MAX_UPLOAD_BYTES;
  const existingKeys = new Set(
    (options?.existing || []).map((item) => `${item.name.toLowerCase()}::${item.size}`)
  );
  const seen = new Set<string>();
  const valid: File[] = [];
  const errors: string[] = [];
  const maxSizeMb = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);

  for (const file of files) {
    const ext = getFileExtension(file.name);
    const key = `${file.name.toLowerCase()}::${file.size}`;

    if (!acceptedExtensions.includes(ext)) {
      errors.push(`File type .${ext || "unknown"} is not supported: ${file.name}`);
      continue;
    }
    if (file.size > maxFileSizeBytes) {
      errors.push(`File exceeds ${maxSizeMb} MB limit: ${file.name}`);
      continue;
    }
    if (existingKeys.has(key) || seen.has(key)) {
      errors.push(`Skipped duplicate file: ${file.name}`);
      continue;
    }

    seen.add(key);
    valid.push(file);
  }

  return { valid, errors };
}
